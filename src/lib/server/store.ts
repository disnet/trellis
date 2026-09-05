// Canonical graph operations over SQLite. All mutations happen here, inside
// transactions; model output never writes directly to accepted graph tables —
// a validated proposal is persisted as a *pending* change set, and applying it
// is a separate, explicitly-invoked transaction.

import crypto from 'node:crypto';
import { activeGraphId, activeWorkingSetId, db } from './db';
import { generateProposal, linkCallToChangeSet } from './agent';
import type { ModelSelection } from '$lib/models';
import {
	RELATION_TYPES,
	STATEMENT_LIMIT,
	THOUGHT_STATUSES,
	THOUGHT_TYPES,
	TITLE_LIMIT,
	type WireOperation
} from './agent/wire';
import {
	effectivePayload,
	type ActorType,
	type AgentAction,
	type ChangeSet,
	type OperationDecision,
	type OperationPayload,
	type ProposedOperation,
	type ReentrySummary,
	type Relation,
	type ScratchNote,
	type Thought,
	type ThoughtRevision,
	type ThoughtStatus,
	type WorkingSetItem,
	type WorkspaceState
} from '$lib/types';

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

// --- meta helpers ---

function getMeta(key: string): string | null {
	const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	return row?.value ?? null;
}

function setMeta(key: string, value: string | null) {
	if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key);
	else
		db.prepare(
			'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		).run(key, value);
}

// --- row mappers ---

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToRevision(r: any): ThoughtRevision {
	return {
		id: r.id,
		title: r.title,
		statement: r.statement,
		status: r.status,
		actorType: r.actor_type,
		sourceChangeSetId: r.source_change_set_id ?? undefined,
		editedFromProposal: r.edited_from_proposal ? true : undefined,
		createdAt: r.created_at
	};
}

function rowToThought(r: any, revisions: ThoughtRevision[]): Thought {
	return {
		id: r.id,
		type: r.type,
		status: r.status,
		title: r.title,
		statement: r.statement,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		revisions
	};
}

function rowToRelation(r: any): Relation {
	return {
		id: r.id,
		fromThoughtId: r.from_thought_id,
		toThoughtId: r.to_thought_id,
		type: r.type,
		createdBy: r.created_by,
		sourceChangeSetId: r.source_change_set_id ?? undefined,
		createdAt: r.created_at
	};
}

function rowToOperation(r: any): ProposedOperation {
	return {
		id: r.id,
		clientRef: r.client_ref,
		sequence: r.sequence,
		dependsOn: JSON.parse(r.depends_on),
		evidenceRefs: JSON.parse(r.evidence_refs),
		payload: JSON.parse(r.payload),
		editedPayload: r.edited_payload ? JSON.parse(r.edited_payload) : undefined,
		rationale: r.rationale,
		decision: r.decision,
		decidedAt: r.decided_at ?? undefined
	};
}

function rowToChangeSet(r: any, operations: ProposedOperation[]): ChangeSet {
	return {
		id: r.id,
		action: r.action,
		status: r.status,
		summary: r.summary,
		invokedOn: JSON.parse(r.invoked_on),
		scratchId: r.scratch_id ?? undefined,
		operations,
		createdAt: r.created_at,
		appliedBy: r.applied_by ?? undefined,
		appliedAt: r.applied_at ?? undefined
	};
}

function rowToScratch(r: any): ScratchNote {
	return {
		id: r.id,
		body: r.body,
		createdAt: r.created_at,
		distilledChangeSetId: r.distilled_change_set_id ?? undefined
	};
}

// --- reads ---

function loadChangeSet(csId: string): ChangeSet | null {
	// Scoped to the active graph so review actions cannot cross a boundary.
	const row = db
		.prepare('SELECT * FROM change_sets WHERE id = ? AND graph_id = ?')
		.get(csId, activeGraphId());
	if (!row) return null;
	const ops = (
		db
			.prepare('SELECT * FROM proposed_operations WHERE change_set_id = ? ORDER BY sequence')
			.all(csId) as any[]
	).map(rowToOperation);
	return rowToChangeSet(row, ops);
}

export function getState(): WorkspaceState {
	const graphId = activeGraphId();
	const graphs = (
		db.prepare('SELECT * FROM graphs ORDER BY created_at, rowid').all() as any[]
	).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
	const thoughtRows = db.prepare('SELECT * FROM thoughts WHERE graph_id = ?').all(graphId) as any[];
	const revisionRows = db
		.prepare(
			`SELECT * FROM thought_revisions
			 WHERE thought_id IN (SELECT id FROM thoughts WHERE graph_id = ?)
			 ORDER BY created_at, rowid`
		)
		.all(graphId) as any[];
	const revsByThought = new Map<string, ThoughtRevision[]>();
	for (const r of revisionRows) {
		const list = revsByThought.get(r.thought_id) ?? [];
		list.push(rowToRevision(r));
		revsByThought.set(r.thought_id, list);
	}

	const thoughts: Record<string, Thought> = {};
	for (const r of thoughtRows) thoughts[r.id] = rowToThought(r, revsByThought.get(r.id) ?? []);

	const relations = (
		db.prepare('SELECT * FROM relations WHERE graph_id = ? ORDER BY created_at, rowid').all(graphId) as any[]
	).map(rowToRelation);
	const activeSet = activeWorkingSetId(graphId);
	const workingSets = (
		db
			.prepare(
				`SELECT ws.id, ws.name, ws.created_at, COUNT(i.thought_id) AS size
				 FROM working_sets ws
				 LEFT JOIN working_set_items i ON i.working_set_id = ws.id
				 WHERE ws.graph_id = ?
				 GROUP BY ws.id ORDER BY ws.created_at, ws.rowid`
			)
			.all(graphId) as any[]
	).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, size: r.size }));
	const workingSet = (
		db.prepare('SELECT * FROM working_set_items WHERE working_set_id = ?').all(activeSet) as any[]
	).map((r) => ({
		thoughtId: r.thought_id,
		x: r.x,
		y: r.y
	})) as WorkingSetItem[];
	const pinnedThoughtIds = (
		db
			.prepare('SELECT thought_id FROM pinned_thoughts WHERE graph_id = ? ORDER BY pinned_at, rowid')
			.all(graphId) as any[]
	).map((r) => r.thought_id as string);
	const scratchNotes = (
		db.prepare('SELECT * FROM scratch_notes WHERE graph_id = ? ORDER BY created_at, rowid').all(graphId) as any[]
	).map(rowToScratch);

	const csRows = db
		.prepare('SELECT * FROM change_sets WHERE graph_id = ? ORDER BY created_at, rowid')
		.all(graphId) as any[];
	const opRows = db
		.prepare(
			`SELECT * FROM proposed_operations
			 WHERE change_set_id IN (SELECT id FROM change_sets WHERE graph_id = ?)
			 ORDER BY sequence`
		)
		.all(graphId) as any[];
	const opsByCs = new Map<string, ProposedOperation[]>();
	for (const r of opRows) {
		const list = opsByCs.get(r.change_set_id) ?? [];
		list.push(rowToOperation(r));
		opsByCs.set(r.change_set_id, list);
	}

	const pendingChangeSets: ChangeSet[] = [];
	const decidedChangeSets: ChangeSet[] = [];
	for (const r of csRows) {
		const cs = rowToChangeSet(r, opsByCs.get(r.id) ?? []);
		(cs.status === 'pending' ? pendingChangeSets : decidedChangeSets).push(cs);
	}

	return {
		graphs,
		activeGraphId: graphId,
		thoughts,
		relations,
		workingSets,
		activeWorkingSetId: activeSet,
		workingSet,
		pinnedThoughtIds,
		scratchNotes,
		pendingChangeSets,
		decidedChangeSets,
		undoLabel: getMeta(`undo_label:${graphId}`)
	};
}

/** Compute the active graph's structural re-entry summary against the previous
 *  visit to that graph, then record this one. Per-graph: switching graphs swaps
 *  the summary along with the rest of the workspace. */
export function reentrySummary(): ReentrySummary {
	const graphId = activeGraphId();
	const lastVisitRaw = getMeta(`last_visit_at:${graphId}`);
	const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;
	const state = getState();

	const degree = new Map<string, number>();
	for (const r of state.relations) {
		degree.set(r.fromThoughtId, (degree.get(r.fromThoughtId) ?? 0) + 1);
		degree.set(r.toThoughtId, (degree.get(r.toThoughtId) ?? 0) + 1);
	}

	const inWorkingSet = state.workingSet
		.map((w) => state.thoughts[w.thoughtId])
		.filter((t): t is Thought => t !== undefined);

	const ref = (t: Thought) => ({ id: t.id, title: t.title, type: t.type, status: t.status });

	// Pins are what *matters*; the rest of the summary is what changed. Each
	// pinned thought reports the relations it gained since the last visit.
	const pinned = state.pinnedThoughtIds
		.map((tid) => state.thoughts[tid])
		.filter((t): t is Thought => t !== undefined)
		.map((t) => ({
			...ref(t),
			newRelations:
				lastVisitAt === null
					? 0
					: state.relations.filter(
							(r) =>
								r.createdAt > lastVisitAt &&
								(r.fromThoughtId === t.id || r.toThoughtId === t.id)
						).length
		}));

	const central = inWorkingSet
		.filter((t) => t.type === 'claim' || t.type === 'question')
		.map((t) => ({ ...ref(t), degree: degree.get(t.id) ?? 0 }))
		.sort((a, b) => b.degree - a.degree)
		.slice(0, 3);
	const centralIds = new Set(central.map((c) => c.id));

	const attention = inWorkingSet
		.filter((t) => (t.status === 'contested' || t.status === 'tentative') && !centralIds.has(t.id))
		.slice(0, 5)
		.map(ref);

	const newThoughts: ReentrySummary['newThoughts'] = [];
	const revisedThoughts: ReentrySummary['revisedThoughts'] = [];
	let newRelations = 0;
	if (lastVisitAt !== null) {
		for (const t of Object.values(state.thoughts)) {
			if (t.createdAt > lastVisitAt) newThoughts.push(ref(t));
			else if (t.revisions.some((rev) => rev.createdAt > lastVisitAt)) revisedThoughts.push(ref(t));
		}
		newRelations = state.relations.filter((r) => r.createdAt > lastVisitAt).length;
	}

	setMeta(`last_visit_at:${graphId}`, String(Date.now()));

	return {
		lastVisitAt,
		pinned,
		central,
		attention,
		newThoughts,
		revisedThoughts,
		newRelations,
		pendingChangeSets: state.pendingChangeSets.length
	};
}

// --- invoking agent operations ---

function wireToPayload(op: WireOperation): OperationPayload {
	if (op.op === 'create_thought') return { op: 'create_thought', thought: op.thought };
	if (op.op === 'revise_thought')
		return { op: 'revise_thought', thoughtId: op.thought_id, thought: op.thought };
	return { op: 'add_relation', from: op.from, to: op.to, relationType: op.relation_type };
}

export async function invoke(
	action: AgentAction,
	selectedIds: string[],
	scratchBody?: string,
	selection?: ModelSelection
): Promise<{ error: string; generationFailed?: boolean } | { changeSetId: string }> {
	const fromScratch = action === 'decompose' && !!scratchBody?.trim();
	if (!fromScratch && selectedIds.length === 0) {
		return {
			error:
				action === 'decompose'
					? 'Decompose needs scratch text or a selected thought.'
					: `Select at least one thought to ${action}.`
		};
	}
	const graphId = activeGraphId();
	const exists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	for (const tid of selectedIds) {
		if (!exists.get(tid, graphId)) return { error: `Unknown thought in selection: ${tid}` };
	}

	// Persist the scratch note before generation so capture survives a failed
	// model call. A retry with identical text reuses the undistilled note.
	let scratch: { id: string; body: string } | undefined;
	if (fromScratch) {
		const body = scratchBody!;
		const existing = db
			.prepare(
				'SELECT id FROM scratch_notes WHERE body = ? AND graph_id = ? AND distilled_change_set_id IS NULL ORDER BY created_at DESC LIMIT 1'
			)
			.get(body, graphId) as { id: string } | undefined;
		if (existing) {
			scratch = { id: existing.id, body };
		} else {
			scratch = { id: id('scratch'), body };
			db.prepare('INSERT INTO scratch_notes (id, body, graph_id, created_at) VALUES (?, ?, ?, ?)').run(
				scratch.id,
				body,
				graphId,
				Date.now()
			);
		}
	}

	const outcome = await generateProposal(action, selectedIds, scratch, selection);
	if (!outcome.ok) return { error: outcome.error, generationFailed: true };

	const now = Date.now();
	const csId = db.transaction(() => {
		const changeSetId = id('cs');
		db.prepare(
			`INSERT INTO change_sets (id, action, status, summary, invoked_on, scratch_id, graph_id, created_at)
			 VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`
		).run(
			changeSetId,
			action,
			outcome.proposal.summary,
			JSON.stringify(selectedIds),
			scratch?.id ?? null,
			graphId,
			now
		);

		const insertOp = db.prepare(
			`INSERT INTO proposed_operations
			   (id, change_set_id, client_ref, sequence, depends_on, evidence_refs, payload, rationale, decision)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
		);
		outcome.proposal.operations.forEach((op, sequence) => {
			insertOp.run(
				id('op'),
				changeSetId,
				op.client_ref,
				sequence,
				JSON.stringify(op.depends_on),
				JSON.stringify(op.evidence_refs),
				JSON.stringify(wireToPayload(op)),
				op.rationale
			);
		});

		if (scratch) {
			db.prepare('UPDATE scratch_notes SET distilled_change_set_id = ? WHERE id = ?').run(
				changeSetId,
				scratch.id
			);
		}
		linkCallToChangeSet(outcome.callId, changeSetId);
		return changeSetId;
	})();

	return { changeSetId: csId };
}

// --- review decisions ---

export function decide(
	csId: string,
	opId: string,
	decision: OperationDecision
): string | null {
	const cs = loadChangeSet(csId);
	if (!cs) return 'Unknown change set.';
	if (cs.status !== 'pending') return 'This change set has already been ratified.';
	const op = cs.operations.find((o) => o.id === opId);
	if (!op) return 'Unknown operation.';
	if (!['pending', 'accepted', 'rejected'].includes(decision)) return 'Invalid decision.';

	if (decision === 'accepted') {
		for (const depRef of op.dependsOn) {
			const dep = cs.operations.find((o) => o.clientRef === depRef);
			if (dep && dep.decision === 'rejected') {
				return 'Blocked: this operation depends on a rejected operation.';
			}
		}
	}

	const now = Date.now();
	const update = db.prepare(
		'UPDATE proposed_operations SET decision = ?, decided_at = ? WHERE id = ?'
	);

	db.transaction(() => {
		update.run(decision, decision === 'pending' ? null : now, opId);
		if (decision === 'rejected') {
			// Cascade transitively: anything depending on a rejected op cannot stand.
			const rejected = new Set([op.clientRef]);
			let changed = true;
			while (changed) {
				changed = false;
				for (const other of cs.operations) {
					if (rejected.has(other.clientRef)) continue;
					if (other.dependsOn.some((ref) => rejected.has(ref))) {
						rejected.add(other.clientRef);
						update.run('rejected', now, other.id);
						changed = true;
					}
				}
			}
		}
	})();

	return null;
}

function validateEditedPayload(original: OperationPayload, edited: any): string | null {
	if (!edited || typeof edited !== 'object') return 'Invalid edited payload.';
	if (edited.op !== original.op) return 'An edit cannot change the kind of operation.';
	if (edited.op === 'create_thought' || edited.op === 'revise_thought') {
		const t = edited.thought;
		if (!t || typeof t !== 'object') return 'Invalid thought fields.';
		if (edited.op === 'create_thought') {
			if (!THOUGHT_TYPES.includes(t.type)) return 'Invalid thought type.';
			if (!THOUGHT_STATUSES.includes(t.status)) return 'Invalid thought status.';
			if (typeof t.title !== 'string' || !t.title.trim()) return 'Title is required.';
			if (typeof t.statement !== 'string' || !t.statement.trim()) return 'Statement is required.';
		}
		if (typeof t.title === 'string' && t.title.length > TITLE_LIMIT)
			return `Title is longer than ${TITLE_LIMIT} characters.`;
		if (typeof t.statement === 'string' && t.statement.length > STATEMENT_LIMIT)
			return `Statement is longer than ${STATEMENT_LIMIT} characters.`;
	} else if (edited.op === 'add_relation') {
		if (!RELATION_TYPES.includes(edited.relationType)) return 'Invalid relation type.';
		if (edited.from !== (original as any).from || edited.to !== (original as any).to)
			return 'An edit cannot change relation endpoints.';
	}
	return null;
}

export function saveEdit(csId: string, opId: string, editedPayload: unknown): string | null {
	const cs = loadChangeSet(csId);
	if (!cs) return 'Unknown change set.';
	if (cs.status !== 'pending') return 'This change set has already been ratified.';
	const op = cs.operations.find((o) => o.id === opId);
	if (!op) return 'Unknown operation.';
	const invalid = validateEditedPayload(op.payload, editedPayload);
	if (invalid) return invalid;
	db.prepare('UPDATE proposed_operations SET edited_payload = ? WHERE id = ?').run(
		JSON.stringify(editedPayload),
		opId
	);
	return null;
}

// --- applying a change set ---

export interface ApplyResult {
	applied: number;
	total: number;
	status: string;
}

export function applyChangeSet(
	csId: string,
	positions: Record<string, { x: number; y: number }>
): { error: string } | ApplyResult {
	const cs = loadChangeSet(csId);
	if (!cs) return { error: 'Unknown change set.' };
	if (cs.status !== 'pending') return { error: 'This change set has already been ratified.' };
	if (cs.operations.some((o) => o.decision === 'pending'))
		return { error: 'Decide every operation before applying.' };

	const accepted = cs.operations
		.filter((o) => o.decision === 'accepted')
		.sort((a, b) => a.sequence - b.sequence);

	// Re-validate the chosen subset: every dependency of an accepted op must be accepted.
	for (const op of accepted) {
		for (const depRef of op.dependsOn) {
			const dep = cs.operations.find((o) => o.clientRef === depRef);
			if (dep && dep.decision !== 'accepted') {
				return { error: 'Cannot apply: an accepted operation depends on one that was not accepted.' };
			}
		}
	}

	// Snapshot for change-set-granularity undo (survives restarts). Per-graph,
	// so undoing here can never touch another graph.
	const graphId = activeGraphId();
	const snapshot = JSON.stringify(exportState(graphId));

	const now = Date.now();
	const activeSet = activeWorkingSetId(graphId);
	const thoughtExists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	const onCanvas = db.prepare(
		'SELECT 1 FROM working_set_items WHERE working_set_id = ? AND thought_id = ?'
	);
	const insertItem = db.prepare(
		'INSERT INTO working_set_items (working_set_id, thought_id, x, y) VALUES (?, ?, ?, ?)'
	);
	const insertRevision = db.prepare(
		`INSERT INTO thought_revisions
		   (id, thought_id, title, statement, status, actor_type, source_change_set_id, edited_from_proposal, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	let fallbackY = 80;
	const place = (key: string, defaultX: number) => {
		const p = positions[key];
		if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
		const pos = { x: defaultX, y: fallbackY };
		fallbackY += 140;
		return pos;
	};

	try {
		db.transaction(() => {
			const refToId: Record<string, string> = {};
			for (const op of accepted) {
				const p = effectivePayload(op);
				const edited = op.editedPayload !== undefined;
				const actor: ActorType = edited ? 'human' : 'agent';

				if (p.op === 'create_thought') {
					const tid = id('t');
					refToId[op.clientRef] = tid;
					db.prepare(
						`INSERT INTO thoughts (id, type, status, title, statement, graph_id, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
					).run(tid, p.thought.type, p.thought.status, p.thought.title, p.thought.statement, graphId, now, now);
					insertRevision.run(
						id('rev'),
						tid,
						p.thought.title,
						p.thought.statement,
						p.thought.status,
						actor,
						cs.id,
						edited ? 1 : 0,
						now
					);
					const pos = place(op.clientRef, 80);
					insertItem.run(activeSet, tid, pos.x, pos.y);
				} else if (p.op === 'revise_thought') {
					const row = db
						.prepare('SELECT * FROM thoughts WHERE id = ? AND graph_id = ?')
						.get(p.thoughtId, graphId) as any;
					if (!row) throw new Error(`Cannot apply: unknown thought ${p.thoughtId}.`);
					const fields = {
						title: p.thought.title ?? row.title,
						statement: p.thought.statement ?? row.statement,
						status: p.thought.status ?? row.status
					};
					db.prepare(
						'UPDATE thoughts SET title = ?, statement = ?, status = ?, updated_at = ? WHERE id = ?'
					).run(fields.title, fields.statement, fields.status, now, p.thoughtId);
					insertRevision.run(
						id('rev'),
						p.thoughtId,
						fields.title,
						fields.statement,
						fields.status,
						actor,
						cs.id,
						edited ? 1 : 0,
						now
					);
				} else {
					const from = refToId[p.from] ?? p.from;
					const to = refToId[p.to] ?? p.to;
					if (!thoughtExists.get(from, graphId) || !thoughtExists.get(to, graphId)) {
						throw new Error('Cannot apply: relation endpoint does not exist.');
					}
					db.prepare(
						`INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, source_change_set_id, graph_id, created_at)
						 VALUES (?, ?, ?, ?, 'agent', ?, ?, ?)`
					).run(id('r'), from, to, p.relationType, cs.id, graphId, now);
					// Surfaced existing thoughts join the working set so the relation is visible.
					for (const end of [from, to]) {
						if (!onCanvas.get(activeSet, end)) {
							const pos = place(end, 80);
							insertItem.run(activeSet, end, pos.x, pos.y);
						}
					}
				}
			}

			const status =
				accepted.length === 0
					? 'rejected'
					: accepted.length === cs.operations.length
						? 'applied'
						: 'partially_applied';
			db.prepare(
				"UPDATE change_sets SET status = ?, applied_by = 'human', applied_at = ? WHERE id = ?"
			).run(status, now, cs.id);
		})();
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Applying the change set failed.' };
	}

	setMeta(`undo_snapshot:${graphId}`, snapshot);
	setMeta(`undo_label:${graphId}`, cs.summary);

	const status = accepted.length === 0 ? 'rejected' : accepted.length === cs.operations.length ? 'applied' : 'partially_applied';
	return { applied: accepted.length, total: cs.operations.length, status };
}

// --- undo (last applied change set) ---

export function undoLastApply(): string | null {
	const graphId = activeGraphId();
	const snapshot = getMeta(`undo_snapshot:${graphId}`);
	if (!snapshot) return 'Nothing to undo.';
	try {
		restore(graphId, JSON.parse(snapshot));
	} catch (e) {
		return e instanceof Error ? e.message : 'Undo failed.';
	}
	setMeta(`undo_snapshot:${graphId}`, null);
	setMeta(`undo_label:${graphId}`, null);
	return null;
}

// --- human revision (from the inspector) ---

export function reviseThought(
	thoughtId: string,
	fields: { title: string; statement: string; status: ThoughtStatus }
): string | null {
	const row = db
		.prepare('SELECT * FROM thoughts WHERE id = ? AND graph_id = ?')
		.get(thoughtId, activeGraphId()) as any;
	if (!row) return 'Unknown thought.';
	if (typeof fields.title !== 'string' || !fields.title.trim()) return 'Title is required.';
	if (typeof fields.statement !== 'string' || !fields.statement.trim())
		return 'Statement is required.';
	if (!THOUGHT_STATUSES.includes(fields.status)) return 'Invalid status.';
	if (fields.title.length > TITLE_LIMIT) return `Title is longer than ${TITLE_LIMIT} characters.`;
	if (fields.statement.length > STATEMENT_LIMIT)
		return `Statement is longer than ${STATEMENT_LIMIT} characters.`;
	if (row.title === fields.title && row.statement === fields.statement && row.status === fields.status)
		return null;

	const now = Date.now();
	db.transaction(() => {
		db.prepare(
			'UPDATE thoughts SET title = ?, statement = ?, status = ?, updated_at = ? WHERE id = ?'
		).run(fields.title, fields.statement, fields.status, now, thoughtId);
		db.prepare(
			`INSERT INTO thought_revisions
			   (id, thought_id, title, statement, status, actor_type, source_change_set_id, edited_from_proposal, created_at)
			 VALUES (?, ?, ?, ?, ?, 'human', NULL, 0, ?)`
		).run(id('rev'), thoughtId, fields.title, fields.statement, fields.status, now);
	})();
	return null;
}

// --- working-set membership (Phase 3) ---
// Membership is transient and binary: these functions only touch
// working_set_items, never the durable graph, and apply immediately without
// going through the proposal tray.

export function addToWorkingSet(
	items: { thoughtId: string; x?: number; y?: number }[]
): string | null {
	const graphId = activeGraphId();
	const activeSet = activeWorkingSetId(graphId);
	const exists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	const onCanvas = db.prepare(
		'SELECT 1 FROM working_set_items WHERE working_set_id = ? AND thought_id = ?'
	);
	const insert = db.prepare(
		'INSERT INTO working_set_items (working_set_id, thought_id, x, y) VALUES (?, ?, ?, ?)'
	);
	for (const item of items) {
		if (typeof item?.thoughtId !== 'string' || !exists.get(item.thoughtId, graphId)) {
			return `Unknown thought: ${item?.thoughtId}`;
		}
	}
	let fallbackY = 80;
	db.transaction(() => {
		for (const item of items) {
			if (onCanvas.get(activeSet, item.thoughtId)) continue;
			const x = Number.isFinite(item.x) ? item.x! : 80;
			const y = Number.isFinite(item.y) ? item.y! : ((fallbackY += 140), fallbackY);
			insert.run(activeSet, item.thoughtId, x, y);
		}
	})();
	return null;
}

export function removeFromWorkingSet(thoughtId: string): string | null {
	const res = db
		.prepare('DELETE FROM working_set_items WHERE working_set_id = ? AND thought_id = ?')
		.run(activeWorkingSetId(), thoughtId);
	return res.changes === 0 ? 'That thought is not in the working set.' : null;
}

export function clearWorkingSet(): void {
	db.prepare('DELETE FROM working_set_items WHERE working_set_id = ?').run(activeWorkingSetId());
}

// --- pins (Phase 6) ---
// Per-graph attention state, not knowledge: pinning marks a thought you keep
// returning to. Human-only and direct — never through the proposal tray, and
// never a mutation of the durable graph.

export function setPinned(thoughtId: string, pinned: boolean): string | null {
	const graphId = activeGraphId();
	if (!db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?').get(thoughtId, graphId))
		return 'Unknown thought.';
	if (pinned)
		db.prepare(
			'INSERT INTO pinned_thoughts (graph_id, thought_id, pinned_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
		).run(graphId, thoughtId, Date.now());
	else
		db.prepare('DELETE FROM pinned_thoughts WHERE graph_id = ? AND thought_id = ?').run(
			graphId,
			thoughtId
		);
	return null;
}

// --- multiple working sets (tabs) ---

const SET_NAME_LIMIT = 40;

export function createWorkingSet(name?: string): string | null {
	const graphId = activeGraphId();
	const count = (
		db.prepare('SELECT COUNT(*) AS n FROM working_sets WHERE graph_id = ?').get(graphId) as {
			n: number;
		}
	).n;
	const trimmed = typeof name === 'string' ? name.trim() : '';
	const finalName = trimmed || `Set ${count + 1}`;
	if (finalName.length > SET_NAME_LIMIT)
		return `Name is longer than ${SET_NAME_LIMIT} characters.`;
	const wsId = id('ws');
	db.transaction(() => {
		db.prepare('INSERT INTO working_sets (id, name, graph_id, created_at) VALUES (?, ?, ?, ?)').run(
			wsId,
			finalName,
			graphId,
			Date.now()
		);
		setMeta(`active_working_set:${graphId}`, wsId);
	})();
	return null;
}

export function switchWorkingSet(wsId: string): string | null {
	const graphId = activeGraphId();
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(wsId, graphId))
		return 'Unknown working set.';
	setMeta(`active_working_set:${graphId}`, wsId);
	return null;
}

export function renameWorkingSet(wsId: string, name: string): string | null {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (!trimmed) return 'A working set needs a name.';
	if (trimmed.length > SET_NAME_LIMIT) return `Name is longer than ${SET_NAME_LIMIT} characters.`;
	const res = db
		.prepare('UPDATE working_sets SET name = ? WHERE id = ? AND graph_id = ?')
		.run(trimmed, wsId, activeGraphId());
	return res.changes === 0 ? 'Unknown working set.' : null;
}

/** Spawn a new working set seeded with a thought plus its 1-hop neighbors and
 *  make it active (Phase 6): the hub centered, neighbors on a ring around it.
 *  Membership only — the durable graph is untouched. */
export function openNeighborhood(thoughtId: string): string | null {
	const graphId = activeGraphId();
	const hub = db
		.prepare('SELECT title FROM thoughts WHERE id = ? AND graph_id = ?')
		.get(thoughtId, graphId) as { title: string } | undefined;
	if (!hub) return 'Unknown thought.';
	const neighbors = (
		db
			.prepare(
				`SELECT DISTINCT CASE WHEN from_thought_id = ? THEN to_thought_id ELSE from_thought_id END AS id
				 FROM relations
				 WHERE graph_id = ? AND (from_thought_id = ? OR to_thought_id = ?)`
			)
			.all(thoughtId, graphId, thoughtId, thoughtId) as { id: string }[]
	)
		.map((r) => r.id)
		.filter((nid) => nid !== thoughtId);

	const name =
		hub.title.length > SET_NAME_LIMIT ? `${hub.title.slice(0, SET_NAME_LIMIT - 1)}…` : hub.title;
	const wsId = id('ws');
	// Ellipse sized to the neighbor count, kept inside the canvas surface.
	const rx = Math.min(720, Math.max(340, neighbors.length * 60));
	const ry = Math.min(500, Math.max(210, neighbors.length * 40));
	const cx = rx + 120;
	const cy = ry + 80;
	db.transaction(() => {
		db.prepare('INSERT INTO working_sets (id, name, graph_id, created_at) VALUES (?, ?, ?, ?)').run(
			wsId,
			name,
			graphId,
			Date.now()
		);
		const insert = db.prepare(
			'INSERT INTO working_set_items (working_set_id, thought_id, x, y) VALUES (?, ?, ?, ?)'
		);
		insert.run(wsId, thoughtId, cx, cy);
		neighbors.forEach((nid, i) => {
			const angle = (2 * Math.PI * i) / neighbors.length - Math.PI / 2;
			insert.run(
				wsId,
				nid,
				Math.max(0, Math.round(cx + rx * Math.cos(angle))),
				Math.max(0, Math.round(cy + ry * Math.sin(angle)))
			);
		});
		setMeta(`active_working_set:${graphId}`, wsId);
	})();
	return null;
}

/** Delete a working set (its membership only — thoughts stay in the graph). */
export function deleteWorkingSet(wsId: string): string | null {
	const graphId = activeGraphId();
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(wsId, graphId))
		return 'Unknown working set.';
	const count = (
		db.prepare('SELECT COUNT(*) AS n FROM working_sets WHERE graph_id = ?').get(graphId) as {
			n: number;
		}
	).n;
	if (count <= 1) return 'Cannot delete the only working set.';
	db.transaction(() => {
		db.prepare('DELETE FROM working_set_items WHERE working_set_id = ?').run(wsId);
		db.prepare('DELETE FROM working_sets WHERE id = ?').run(wsId);
		if (getMeta(`active_working_set:${graphId}`) === wsId)
			setMeta(`active_working_set:${graphId}`, null);
	})();
	// Re-resolve the pointer so the oldest remaining set becomes active.
	activeWorkingSetId(graphId);
	return null;
}

// --- multiple graphs (Phase 5) ---
// Each graph is a fully isolated knowledge base: thoughts, relations, working
// sets, scratch notes, and change sets never cross the boundary, and the agent
// only ever sees the active graph.

const GRAPH_NAME_LIMIT = 40;

/** Create a new, empty graph and make it active. */
export function createGraph(name?: string): string | null {
	const count = (db.prepare('SELECT COUNT(*) AS n FROM graphs').get() as { n: number }).n;
	const trimmed = typeof name === 'string' ? name.trim() : '';
	const finalName = trimmed || `Graph ${count + 1}`;
	if (finalName.length > GRAPH_NAME_LIMIT)
		return `Name is longer than ${GRAPH_NAME_LIMIT} characters.`;
	const graphId = id('g');
	db.transaction(() => {
		db.prepare('INSERT INTO graphs (id, name, created_at) VALUES (?, ?, ?)').run(
			graphId,
			finalName,
			Date.now()
		);
		setMeta('active_graph', graphId);
	})();
	// Give the new graph its first working set so the canvas has somewhere to be.
	activeWorkingSetId(graphId);
	return null;
}

/** Swap the entire workspace to another graph. */
export function switchGraph(graphId: string): string | null {
	if (!db.prepare('SELECT 1 FROM graphs WHERE id = ?').get(graphId)) return 'Unknown graph.';
	setMeta('active_graph', graphId);
	return null;
}

export function renameGraph(graphId: string, name: string): string | null {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (!trimmed) return 'A graph needs a name.';
	if (trimmed.length > GRAPH_NAME_LIMIT)
		return `Name is longer than ${GRAPH_NAME_LIMIT} characters.`;
	const res = db.prepare('UPDATE graphs SET name = ? WHERE id = ?').run(trimmed, graphId);
	return res.changes === 0 ? 'Unknown graph.' : null;
}

// --- working-set layout persistence ---

export function updatePositions(items: { thoughtId: string; x: number; y: number }[]): void {
	const activeSet = activeWorkingSetId();
	const update = db.prepare(
		'UPDATE working_set_items SET x = ?, y = ? WHERE working_set_id = ? AND thought_id = ?'
	);
	db.transaction(() => {
		for (const item of items) {
			if (Number.isFinite(item.x) && Number.isFinite(item.y))
				update.run(item.x, item.y, activeSet, item.thoughtId);
		}
	})();
}

// --- export / snapshot ---

/** JSON dump of one graph's persisted state (default: the active graph), for
 *  recovery, debugging, and undo snapshots. Per-graph, per docs/design.md Phase 5. */
export function exportState(graphId: string = activeGraphId()) {
	const graph = db.prepare('SELECT * FROM graphs WHERE id = ?').get(graphId) as any;
	return {
		exportedAt: Date.now(),
		graph: { id: graph.id, name: graph.name },
		thoughts: db.prepare('SELECT * FROM thoughts WHERE graph_id = ?').all(graphId),
		thought_revisions: db
			.prepare(
				`SELECT * FROM thought_revisions
				 WHERE thought_id IN (SELECT id FROM thoughts WHERE graph_id = ?)
				 ORDER BY created_at, rowid`
			)
			.all(graphId),
		relations: db
			.prepare('SELECT * FROM relations WHERE graph_id = ? ORDER BY created_at, rowid')
			.all(graphId),
		working_sets: db
			.prepare('SELECT * FROM working_sets WHERE graph_id = ? ORDER BY created_at, rowid')
			.all(graphId),
		working_set_items: db
			.prepare(
				'SELECT * FROM working_set_items WHERE working_set_id IN (SELECT id FROM working_sets WHERE graph_id = ?)'
			)
			.all(graphId),
		pinned_thoughts: db
			.prepare('SELECT * FROM pinned_thoughts WHERE graph_id = ? ORDER BY pinned_at, rowid')
			.all(graphId),
		change_sets: db
			.prepare('SELECT * FROM change_sets WHERE graph_id = ? ORDER BY created_at, rowid')
			.all(graphId),
		proposed_operations: db
			.prepare(
				`SELECT * FROM proposed_operations
				 WHERE change_set_id IN (SELECT id FROM change_sets WHERE graph_id = ?)
				 ORDER BY sequence`
			)
			.all(graphId),
		scratch_notes: db
			.prepare('SELECT * FROM scratch_notes WHERE graph_id = ? ORDER BY created_at, rowid')
			.all(graphId)
	};
}

/** Replace one graph's rows with a snapshot of that graph. Other graphs untouched. */
function restore(graphId: string, snapshot: ReturnType<typeof exportState>) {
	const insert = (table: string, rows: any[]) => {
		for (const row of rows) {
			const cols = Object.keys(row);
			db.prepare(
				`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
			).run(...cols.map((c) => row[c]));
		}
	};
	db.transaction(() => {
		// Pins are attention state no change set can touch, so undoing an apply
		// keeps the *current* pins rather than reverting to the snapshot's —
		// minus any pin whose thought does not survive the restore.
		const restoredThoughtIds = new Set((snapshot.thoughts as any[]).map((t) => t.id));
		const pins = (
			db.prepare('SELECT * FROM pinned_thoughts WHERE graph_id = ?').all(graphId) as any[]
		).filter((p) => restoredThoughtIds.has(p.thought_id));
		db.prepare('DELETE FROM pinned_thoughts WHERE graph_id = ?').run(graphId);
		db.prepare(
			'DELETE FROM proposed_operations WHERE change_set_id IN (SELECT id FROM change_sets WHERE graph_id = ?)'
		).run(graphId);
		db.prepare('DELETE FROM change_sets WHERE graph_id = ?').run(graphId);
		db.prepare(
			'DELETE FROM thought_revisions WHERE thought_id IN (SELECT id FROM thoughts WHERE graph_id = ?)'
		).run(graphId);
		db.prepare('DELETE FROM relations WHERE graph_id = ?').run(graphId);
		db.prepare(
			'DELETE FROM working_set_items WHERE working_set_id IN (SELECT id FROM working_sets WHERE graph_id = ?)'
		).run(graphId);
		db.prepare('DELETE FROM working_sets WHERE graph_id = ?').run(graphId);
		db.prepare('DELETE FROM scratch_notes WHERE graph_id = ?').run(graphId);
		db.prepare('DELETE FROM thoughts WHERE graph_id = ?').run(graphId);
		insert('thoughts', snapshot.thoughts as any[]);
		insert('thought_revisions', snapshot.thought_revisions as any[]);
		insert('relations', snapshot.relations as any[]);
		insert('working_sets', snapshot.working_sets as any[]);
		insert('working_set_items', snapshot.working_set_items as any[]);
		insert('change_sets', snapshot.change_sets as any[]);
		insert('proposed_operations', snapshot.proposed_operations as any[]);
		insert('scratch_notes', snapshot.scratch_notes as any[]);
		insert('pinned_thoughts', pins);
	})();
}
