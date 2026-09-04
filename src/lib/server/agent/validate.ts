// Server-side validation of a proposal before it becomes a pending change set
// (docs/design.md: allowed operations, referential integrity, dependency refs,
// text limits — all checked before anything is shown, and model output never
// writes to accepted graph tables regardless).
//
// Mechanical problems are normalized (missing endpoint dependencies, ordering,
// stray evidence refs, duplicate relations); substantive problems are returned
// as errors, which the caller feeds back to the model for one retry.

import {
	MAX_OPERATIONS,
	STATEMENT_LIMIT,
	SUMMARY_LIMIT,
	RATIONALE_LIMIT,
	TITLE_LIMIT,
	proposalSchema,
	type AgentProposal,
	type WireOperation
} from './wire';

export interface ValidationDeps {
	thoughtExists: (id: string) => boolean;
	relationExists: (from: string, to: string, type: string) => boolean;
	scratchId?: string;
}

export type ValidationResult =
	| { ok: true; proposal: AgentProposal }
	| { ok: false; errors: string[] };

export function validateProposal(raw: unknown, deps: ValidationDeps): ValidationResult {
	const parsed = proposalSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues
				.slice(0, 10)
				.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
		};
	}

	const errors: string[] = [];
	const proposal = parsed.data;

	if (!proposal.summary.trim()) errors.push('summary must not be empty.');
	if (proposal.operations.length === 0) errors.push('The change set contains no operations.');
	if (proposal.operations.length > MAX_OPERATIONS)
		errors.push(`At most ${MAX_OPERATIONS} operations are allowed.`);

	// Unique, non-empty client_refs.
	const refs = new Set<string>();
	for (const op of proposal.operations) {
		if (!op.client_ref.trim()) errors.push('Every operation needs a non-empty client_ref.');
		else if (refs.has(op.client_ref)) errors.push(`Duplicate client_ref "${op.client_ref}".`);
		refs.add(op.client_ref);
	}
	if (errors.length > 0) return { ok: false, errors };

	const createRefs = new Set(
		proposal.operations.filter((o) => o.op === 'create_thought').map((o) => o.client_ref)
	);
	const isEndpoint = (ref: string) => createRefs.has(ref) || deps.thoughtExists(ref);

	const checkText = (label: string, title?: string, statement?: string) => {
		if (title !== undefined) {
			if (!title.trim()) errors.push(`${label}: title must not be empty.`);
			if (title.length > TITLE_LIMIT)
				errors.push(`${label}: title exceeds ${TITLE_LIMIT} characters.`);
		}
		if (statement !== undefined) {
			if (!statement.trim()) errors.push(`${label}: statement must not be empty.`);
			if (statement.length > STATEMENT_LIMIT)
				errors.push(`${label}: statement exceeds ${STATEMENT_LIMIT} characters.`);
		}
	};

	const operations: WireOperation[] = [];
	for (const op of proposal.operations) {
		const label = `Operation "${op.client_ref}"`;

		if (!op.rationale.trim()) errors.push(`${label}: rationale must not be empty.`);

		// Dependencies must name other operations in this change set.
		const dependsOn = [...new Set(op.depends_on)].filter((ref) => ref !== op.client_ref);
		for (const ref of dependsOn) {
			if (!refs.has(ref)) errors.push(`${label}: depends_on references unknown ref "${ref}".`);
		}

		if (op.op === 'create_thought') {
			checkText(label, op.thought.title, op.thought.statement);
		} else if (op.op === 'revise_thought') {
			if (!deps.thoughtExists(op.thought_id))
				errors.push(`${label}: revises unknown thought "${op.thought_id}".`);
			if (createRefs.has(op.thought_id))
				errors.push(`${label}: cannot revise a thought being created in the same change set.`);
			const t = op.thought;
			if (t.title === undefined && t.statement === undefined && t.status === undefined)
				errors.push(`${label}: the revision changes nothing.`);
			checkText(label, t.title, t.statement);
		} else {
			if (!isEndpoint(op.from))
				errors.push(`${label}: relation endpoint "${op.from}" is neither an existing thought nor a create_thought ref in this change set.`);
			if (!isEndpoint(op.to))
				errors.push(`${label}: relation endpoint "${op.to}" is neither an existing thought nor a create_thought ref in this change set.`);
			if (op.from === op.to) errors.push(`${label}: a thought cannot relate to itself.`);
			// A relation on a proposed thought cannot be accepted without it.
			for (const end of [op.from, op.to]) {
				if (createRefs.has(end) && !dependsOn.includes(end)) dependsOn.push(end);
			}
			// Duplicates of existing accepted relations are dropped, not errored —
			// re-proposing what is already in the graph is mechanical noise.
			if (
				deps.thoughtExists(op.from) &&
				deps.thoughtExists(op.to) &&
				deps.relationExists(op.from, op.to, op.relation_type)
			) {
				continue;
			}
		}

		// Evidence refs must name something real: a thought, the scratch note, or
		// an operation in this change set. Unknown refs are dropped silently.
		const evidence = [...new Set(op.evidence_refs)].filter(
			(ref) => refs.has(ref) || deps.thoughtExists(ref) || ref === deps.scratchId
		);

		operations.push({
			...op,
			depends_on: dependsOn,
			evidence_refs: evidence,
			rationale: op.rationale.slice(0, RATIONALE_LIMIT)
		});
	}

	if (operations.length === 0 && errors.length === 0)
		errors.push('Every proposed operation already exists in the graph.');
	if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

	// Stable topological order so dependencies always precede dependents (the
	// apply transaction resolves client_refs in sequence order).
	const sorted = topoSort(operations);
	if (!sorted) return { ok: false, errors: ['depends_on contains a dependency cycle.'] };

	return {
		ok: true,
		proposal: { summary: proposal.summary.trim().slice(0, SUMMARY_LIMIT), operations: sorted }
	};
}

function topoSort(ops: WireOperation[]): WireOperation[] | null {
	const byRef = new Map(ops.map((o) => [o.client_ref, o]));
	const done = new Set<string>();
	const visiting = new Set<string>();
	const out: WireOperation[] = [];

	const visit = (op: WireOperation): boolean => {
		if (done.has(op.client_ref)) return true;
		if (visiting.has(op.client_ref)) return false;
		visiting.add(op.client_ref);
		for (const ref of op.depends_on) {
			const dep = byRef.get(ref);
			if (dep && !visit(dep)) return false;
		}
		visiting.delete(op.client_ref);
		done.add(op.client_ref);
		out.push(op);
		return true;
	};

	for (const op of ops) if (!visit(op)) return null;
	return out;
}
