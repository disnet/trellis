// Canonical graph operations over SQLite. All mutations happen here, inside
// transactions; model output never writes directly to accepted graph tables —
// a validated proposal is persisted as a *pending* change set, and applying it
// is a separate, explicitly-invoked transaction.

import crypto from 'node:crypto';
import { activeGraphId, activeWorkingSetId, db } from './db';
import { generateProposal, linkCallToChangeSet } from './agent';
import { generateTreatment, type ProseInput } from './agent/prose';
import { defaultSelection } from './agent/settings';
import { conversationsForGraph, conversationExcerpt, resolveTarget } from './conversations';
import type { ModelSelection } from '$lib/models';
import {
	RELATION_TYPES,
	SOURCE_LIMIT,
	STATEMENT_LIMIT,
	THOUGHT_STATUSES,
	THOUGHT_TYPES,
	TITLE_LIMIT,
	wireConfidenceToInternal,
	type WireCreateThought,
	type WireOperation,
	type WireReviseThought
} from './agent/wire';
import {
	effectivePayload,
	validateConfidence,
	type ActorType,
	type Confidence,
	type AgentAction,
	type ChangeSet,
	type OperationDecision,
	type OperationPayload,
	type ProposedOperation,
	type ProposedThoughtFields,
	type ReentrySummary,
	type Relation,
	type ScratchNote,
	type Thought,
	type ThoughtRevision,
	type ThoughtStatus,
	type ThoughtType,
	type CanvasNote,
	type CanvasPosition,
	type WorkspaceState,
	type ProseTreatment,
	type ProseStyle
} from '$lib/types';

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const proseGenerationSlots = new Map<string, symbol>();

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
		confidence: r.confidence ? JSON.parse(r.confidence) : undefined,
		source: r.source ?? undefined,
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
		confidence: r.confidence ? JSON.parse(r.confidence) : undefined,
		source: r.source ?? undefined,
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
		consulted: r.consulted ? JSON.parse(r.consulted) : [],
		conversationContext: r.conversation_context ? JSON.parse(r.conversation_context) : [],
		scratchId: r.scratch_id ?? undefined,
		noteId: r.note_id ?? undefined,
		operations,
		createdAt: r.created_at,
		appliedBy: r.applied_by ?? undefined,
		appliedAt: r.applied_at ?? undefined
	};
}

function rowToNote(r: any): CanvasNote {
	return {
		id: r.id,
		body: r.body,
		x: r.x,
		y: r.y,
		w: r.w ?? undefined,
		h: r.h ?? undefined,
		createdAt: r.created_at
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
	).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, size: r.size, members: [] as string[] }));
	const membersBySet = new Map(workingSets.map((s) => [s.id, s.members]));
	for (const r of db
		.prepare(
			`SELECT i.working_set_id, i.thought_id FROM working_set_items i
			 WHERE i.working_set_id IN (SELECT id FROM working_sets WHERE graph_id = ?)`
		)
		.all(graphId) as any[]) {
		membersBySet.get(r.working_set_id)?.push(r.thought_id);
	}
	const workingSet = activeSet
		? (
				db
					.prepare('SELECT thought_id FROM working_set_items WHERE working_set_id = ?')
					.all(activeSet) as any[]
			).map((r) => r.thought_id as string)
		: [];
	const canvas = (
		db.prepare('SELECT thought_id, x, y FROM canvas_positions WHERE graph_id = ?').all(graphId) as any[]
	).map((r) => ({ thoughtId: r.thought_id, x: r.x, y: r.y })) as CanvasPosition[];
	const notes = (
		db.prepare('SELECT * FROM canvas_notes WHERE graph_id = ? ORDER BY created_at, rowid').all(graphId) as any[]
	).map(rowToNote);
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
		canvas,
		notes,
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

	// Focus scope: the active lens when one is on, otherwise the whole graph.
	const inFocus = state.activeWorkingSetId
		? state.workingSet
				.map((tid) => state.thoughts[tid])
				.filter((t): t is Thought => t !== undefined)
		: Object.values(state.thoughts);

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

	const central = inFocus
		.filter((t) => t.type === 'claim' || t.type === 'question' || t.type === 'prediction')
		.map((t) => ({ ...ref(t), degree: degree.get(t.id) ?? 0 }))
		.sort((a, b) => b.degree - a.degree)
		.slice(0, 3);
	const centralIds = new Set(central.map((c) => c.id));

	const attention = inFocus
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

// Wire thought fields → internal form: nulls dropped, confidence camelCased.
function wireThoughtToInternal(
	t: WireCreateThought['thought'] | WireReviseThought['thought']
): Partial<ProposedThoughtFields> {
	const out: Partial<ProposedThoughtFields> = {};
	if (t.type != null) out.type = t.type;
	if (t.status != null) out.status = t.status;
	if (t.title != null) out.title = t.title;
	if (t.statement != null) out.statement = t.statement;
	const confidence = wireConfidenceToInternal(t.confidence);
	if (confidence) out.confidence = confidence;
	if (t.source != null) out.source = t.source;
	return out;
}

function wireToPayload(op: WireOperation): OperationPayload {
	if (op.op === 'create_thought')
		return { op: 'create_thought', thought: wireThoughtToInternal(op.thought) as ProposedThoughtFields };
	if (op.op === 'revise_thought')
		return { op: 'revise_thought', thoughtId: op.thought_id, thought: wireThoughtToInternal(op.thought) };
	return { op: 'add_relation', from: op.from, to: op.to, relationType: op.relation_type };
}

export async function invoke(
	action: AgentAction,
	selectedIds: string[],
	scratchBody?: string,
	selection?: ModelSelection,
	/** The canvas note a decompose was invoked on, so staging can anchor there. */
	sourceNoteId?: string,
	conversationId?: string
): Promise<{ error: string; generationFailed?: boolean } | { changeSetId: string }> {
	const conversation = conversationId ? conversationsForGraph().find(c => c.id === conversationId) : undefined;
	if (conversationId) {
		if (!conversation?.messages.length) return { error: 'Unknown or empty discussion.' };
		if (action !== 'decompose') return { error: 'Use Propose thoughts to distill a discussion.' };
		try {
			const target = resolveTarget(conversation.thoughtId ? { thoughtId: conversation.thoughtId } : { operationId: conversation.operationId! });
			selectedIds = conversation.thoughtId ? [conversation.thoughtId] : [];
			scratchBody = `Distill this discussion into a small change set. Prefer revising its existing thought when appropriate. A proposed subject is not yet in the graph and cannot be referenced as an existing thought. Preserve authorship and uncertainty; suggestions in the discussion are not accepted beliefs.\nSubject: ${JSON.stringify(target.material)}\nDiscussion: ${JSON.stringify(conversationExcerpt(conversation))}`;
		} catch (e) { return { error: (e as Error).message }; }
	}
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
	// A stale or foreign note id degrades to unanchored staging, never an error.
	const noteId =
		fromScratch && sourceNoteId &&
		db.prepare('SELECT 1 FROM canvas_notes WHERE id = ? AND graph_id = ?').get(sourceNoteId, graphId)
			? sourceNoteId
			: null;

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

	const outcome = await generateProposal(action, selectedIds, scratch, selection, conversation ? conversationExcerpt(conversation) : undefined);
	if (!outcome.ok) return { error: outcome.error, generationFailed: true };

	const now = Date.now();
	const csId = db.transaction(() => {
		const changeSetId = id('cs');
		db.prepare(
			`INSERT INTO change_sets (id, action, status, summary, invoked_on, consulted, scratch_id, note_id, graph_id, created_at)
			 VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
		).run(
			changeSetId,
			action,
			outcome.proposal.summary,
			JSON.stringify(selectedIds),
			JSON.stringify(outcome.consulted),
			scratch?.id ?? null,
			noteId,
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
		db.prepare('UPDATE change_sets SET conversation_context = ? WHERE id = ?').run(JSON.stringify(outcome.conversationContext), changeSetId);
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
		if (t.confidence !== undefined && t.confidence !== null) {
			if (edited.op === 'create_thought' && t.type !== 'prediction')
				return 'Confidence is only valid on a prediction.';
			const err = validateConfidence(t.confidence);
			if (err) return err;
		}
		if (t.source !== undefined && t.source !== null) {
			if (typeof t.source !== 'string') return 'Invalid source.';
			if (t.source.length > SOURCE_LIMIT)
				return `Source is longer than ${SOURCE_LIMIT} characters.`;
		}
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
	positions: Record<string, { x: number; y: number }>,
	existingPositions: Record<string, { x: number; y: number }> = {}
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
	// Validate the entire layout adjustment before mutating anything.
	if (!existingPositions || typeof existingPositions !== 'object' || Array.isArray(existingPositions)) return { error: 'Invalid layout adjustment.' };
	for (const [thoughtId, pos] of Object.entries(existingPositions)) {
		if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) ||
			!db.prepare('SELECT 1 FROM canvas_positions WHERE graph_id = ? AND thought_id = ?').get(graphId, thoughtId)) {
			return { error: 'Invalid layout adjustment.' };
		}
	}
	const snapshot = JSON.stringify(exportState(graphId, { includeProse: false }));

	const now = Date.now();
	const activeSet = activeWorkingSetId(graphId);
	const thoughtExists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	const insertPosition = db.prepare(
		'INSERT INTO canvas_positions (graph_id, thought_id, x, y) VALUES (?, ?, ?, ?)'
	);
	// Accepted results join the active lens (membership only) so the outcome of
	// the operation lands in the person's current focus, not outside it.
	const joinLens = (thoughtId: string) => {
		if (activeSet)
			db.prepare(
				'INSERT INTO working_set_items (working_set_id, thought_id) VALUES (?, ?) ON CONFLICT DO NOTHING'
			).run(activeSet, thoughtId);
	};
	const insertRevision = db.prepare(
		`INSERT INTO thought_revisions
		   (id, thought_id, title, statement, status, confidence, source, actor_type, source_change_set_id, edited_from_proposal, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
			if (accepted.some(op => effectivePayload(op).op === 'create_thought')) {
				const move = db.prepare('UPDATE canvas_positions SET x = ?, y = ? WHERE graph_id = ? AND thought_id = ?');
				for (const [thoughtId, pos] of Object.entries(existingPositions)) move.run(pos.x, pos.y, graphId, thoughtId);
			}
			const refToId: Record<string, string> = {};
			for (const op of accepted) {
				const p = effectivePayload(op);
				const edited = op.editedPayload !== undefined;
				const actor: ActorType = edited ? 'human' : 'agent';

				if (p.op === 'create_thought') {
					const tid = id('t');
					refToId[op.clientRef] = tid;
					const confidence = p.thought.confidence ? JSON.stringify(p.thought.confidence) : null;
					const source = p.thought.source ?? null;
					db.prepare(
						`INSERT INTO thoughts (id, type, status, title, statement, confidence, source, graph_id, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					).run(tid, p.thought.type, p.thought.status, p.thought.title, p.thought.statement, confidence, source, graphId, now, now);
					insertRevision.run(
						id('rev'),
						tid,
						p.thought.title,
						p.thought.statement,
						p.thought.status,
						confidence,
						source,
						actor,
						cs.id,
						edited ? 1 : 0,
						now
					);
					const pos = place(op.clientRef, 80);
					insertPosition.run(graphId, tid, pos.x, pos.y);
					joinLens(tid);
					db.prepare('UPDATE proposed_operations SET applied_thought_id = ? WHERE id = ?').run(tid, op.id);
					db.prepare('UPDATE conversations SET thought_id = ? WHERE operation_id = ? AND graph_id = ?').run(tid, op.id, graphId);
				} else if (p.op === 'revise_thought') {
					const row = db
						.prepare('SELECT * FROM thoughts WHERE id = ? AND graph_id = ?')
						.get(p.thoughtId, graphId) as any;
					if (!row) throw new Error(`Cannot apply: unknown thought ${p.thoughtId}.`);
					const fields = {
						title: p.thought.title ?? row.title,
						statement: p.thought.statement ?? row.statement,
						status: p.thought.status ?? row.status,
						confidence: p.thought.confidence
							? JSON.stringify(p.thought.confidence)
							: (row.confidence ?? null),
						source: p.thought.source ?? row.source ?? null
					};
					db.prepare(
						'UPDATE thoughts SET title = ?, statement = ?, status = ?, confidence = ?, source = ?, updated_at = ? WHERE id = ?'
					).run(fields.title, fields.statement, fields.status, fields.confidence, fields.source, now, p.thoughtId);
					insertRevision.run(
						id('rev'),
						p.thoughtId,
						fields.title,
						fields.statement,
						fields.status,
						fields.confidence,
						fields.source,
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
					// Both endpoints are already on the whole-graph canvas; pull them
					// into the active lens so the new relation lands in focus.
					for (const end of [from, to]) joinLens(end);
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
	setMeta(`undo_kind:${graphId}`, 'apply');

	const status = accepted.length === 0 ? 'rejected' : accepted.length === cs.operations.length ? 'applied' : 'partially_applied';
	return { applied: accepted.length, total: cs.operations.length, status };
}

// --- undo (last applied change set) ---

/** Undo the last snapshotted change — an applied change set, or a deletion.
 *  Reports which, so the caller can say what came back. */
export function undoLast(): { error: string } | { label: string; kind: 'apply' | 'delete' } {
	const graphId = activeGraphId();
	const snapshot = getMeta(`undo_snapshot:${graphId}`);
	if (!snapshot) return { error: 'Nothing to undo.' };
	const label = getMeta(`undo_label:${graphId}`) ?? '';
	const kind = getMeta(`undo_kind:${graphId}`) === 'delete' ? 'delete' : 'apply';
	try {
		restore(graphId, JSON.parse(snapshot));
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Undo failed.' };
	}
	setMeta(`undo_snapshot:${graphId}`, null);
	setMeta(`undo_label:${graphId}`, null);
	setMeta(`undo_kind:${graphId}`, null);
	return { label, kind };
}

// --- manual creation (from the composer) ---
// The one write path that puts a thought into the graph without a change set:
// human-authored from the start, so its initial revision carries actor_type
// 'human' and no source change set. Not covered by undo-last-apply, which only
// snapshots on change-set apply.

export function createThought(fields: {
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	confidence?: Confidence | null;
	source?: string | null;
	x?: number;
	y?: number;
}): { error: string } | { thoughtId: string } {
	if (!THOUGHT_TYPES.includes(fields.type)) return { error: 'Invalid thought type.' };
	if (!THOUGHT_STATUSES.includes(fields.status)) return { error: 'Invalid thought status.' };
	if (typeof fields.title !== 'string' || !fields.title.trim())
		return { error: 'Title is required.' };
	if (typeof fields.statement !== 'string' || !fields.statement.trim())
		return { error: 'Statement is required.' };
	if (fields.title.length > TITLE_LIMIT)
		return { error: `Title is longer than ${TITLE_LIMIT} characters.` };
	if (fields.statement.length > STATEMENT_LIMIT)
		return { error: `Statement is longer than ${STATEMENT_LIMIT} characters.` };

	let confidence: string | null = null;
	if (fields.confidence != null) {
		if (fields.type !== 'prediction') return { error: 'Confidence is only valid on a prediction.' };
		const err = validateConfidence(fields.confidence);
		if (err) return { error: err };
		confidence = JSON.stringify(fields.confidence);
	}
	let source: string | null = null;
	if (fields.source != null) {
		if (typeof fields.source !== 'string') return { error: 'Invalid source.' };
		source = fields.source.trim() || null;
		if (source && source.length > SOURCE_LIMIT)
			return { error: `Source is longer than ${SOURCE_LIMIT} characters.` };
	}

	const graphId = activeGraphId();
	const activeSet = activeWorkingSetId(graphId);
	const now = Date.now();
	const tid = id('t');
	const x = Number.isFinite(fields.x) ? fields.x! : 80;
	const y = Number.isFinite(fields.y) ? fields.y! : 80;
	db.transaction(() => {
		db.prepare(
			`INSERT INTO thoughts (id, type, status, title, statement, confidence, source, graph_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(tid, fields.type, fields.status, fields.title, fields.statement, confidence, source, graphId, now, now);
		db.prepare(
			`INSERT INTO thought_revisions
			   (id, thought_id, title, statement, status, confidence, source, actor_type, source_change_set_id, edited_from_proposal, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'human', NULL, 0, ?)`
		).run(id('rev'), tid, fields.title, fields.statement, fields.status, confidence, source, now);
		db.prepare(
			'INSERT INTO canvas_positions (graph_id, thought_id, x, y) VALUES (?, ?, ?, ?)'
		).run(graphId, tid, x, y);
		// A thought written while a lens is on belongs to that focus.
		if (activeSet)
			db.prepare(
				'INSERT INTO working_set_items (working_set_id, thought_id) VALUES (?, ?)'
			).run(activeSet, tid);
	})();
	return { thoughtId: tid };
}

// --- deletion (from the inspector or the canvas selection) ---
// Retiring a thought is the usual move — the graph keeps what it once believed.
// Deleting is for what should never have been written down at all: it takes the
// thought, its revision history, and every relation touching it. Human-only and
// immediate, like every other direct edit, but it snapshots the graph first, so
// the one Undo covers a deletion exactly as it covers an apply.

export function deleteThoughts(thoughtIds: unknown): { error: string } | { deleted: number } {
	if (!Array.isArray(thoughtIds) || thoughtIds.some((t) => typeof t !== 'string'))
		return { error: 'Invalid thought ids.' };
	const graphId = activeGraphId();
	const rows = (thoughtIds as string[]).filter((tid) =>
		db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?').get(tid, graphId)
	);
	if (rows.length === 0) return { error: 'Unknown thought.' };

	const first = db.prepare('SELECT title FROM thoughts WHERE id = ?').get(rows[0]) as {
		title: string;
	};
	const snapshot = JSON.stringify(exportState(graphId, { includeProse: false }));
	const list = rows.map(() => '?').join(', ');
	try {
		db.transaction(() => {
			db.prepare(`DELETE FROM pinned_thoughts WHERE graph_id = ? AND thought_id IN (${list})`).run(graphId, ...rows);
			db.prepare(`DELETE FROM working_set_items WHERE thought_id IN (${list})`).run(...rows);
			db.prepare(`DELETE FROM canvas_positions WHERE graph_id = ? AND thought_id IN (${list})`).run(graphId, ...rows);
			db.prepare(
				`DELETE FROM relations WHERE graph_id = ? AND (from_thought_id IN (${list}) OR to_thought_id IN (${list}))`
			).run(graphId, ...rows, ...rows);
			db.prepare(`DELETE FROM thought_revisions WHERE thought_id IN (${list})`).run(...rows);
			db.prepare(`DELETE FROM thoughts WHERE id IN (${list})`).run(...rows);
			// Discussions are left pointing at the gone thought, exactly as undo
			// leaves them: they carry no foreign key, stay out of every query while
			// the thought is absent, and come back with it.
		})();
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Deleting failed.' };
	}

	setMeta(`undo_snapshot:${graphId}`, snapshot);
	setMeta(
		`undo_label:${graphId}`,
		rows.length === 1 ? `Deleted “${first.title}”` : `Deleted ${rows.length} thoughts`
	);
	setMeta(`undo_kind:${graphId}`, 'delete');
	return { deleted: rows.length };
}

// --- canvas notes ---
// Free-text boxes on the canvas: the default thing you create there. Not
// knowledge — direct and human-only, never through the proposal tray. A note
// graduates by being converted into a thought, or feeds decompose as scratch.

const NOTE_LIMIT = 20000;

export function createNote(fields: {
	body?: unknown;
	x?: number;
	y?: number;
}): { error: string } | { noteId: string } {
	const body = typeof fields.body === 'string' ? fields.body : '';
	if (body.length > NOTE_LIMIT) return { error: `Note is longer than ${NOTE_LIMIT} characters.` };
	if (!Number.isFinite(fields.x) || !Number.isFinite(fields.y))
		return { error: 'A note needs a canvas position.' };
	const noteId = id('note');
	db.prepare(
		'INSERT INTO canvas_notes (id, body, graph_id, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(noteId, body, activeGraphId(), fields.x, fields.y, Date.now());
	return { noteId };
}

export function deleteNote(noteId: string): string | null {
	const res = db
		.prepare('DELETE FROM canvas_notes WHERE id = ? AND graph_id = ?')
		.run(noteId, activeGraphId());
	return res.changes === 0 ? 'Unknown note.' : null;
}

/** Turn a note into a human-authored thought at the note's spot: the thought
 *  is created and the note removed in one transaction, so the text never
 *  exists twice (or vanishes) on failure. */
export function convertNote(
	noteId: string,
	fields: { type: ThoughtType; status: ThoughtStatus; title: string; statement: string }
): { error: string } | { thoughtId: string } {
	const note = db
		.prepare('SELECT * FROM canvas_notes WHERE id = ? AND graph_id = ?')
		.get(noteId, activeGraphId()) as any;
	if (!note) return { error: 'Unknown note.' };
	let result: { error: string } | { thoughtId: string } = { error: 'Converting the note failed.' };
	try {
		db.transaction(() => {
			result = createThought({ ...fields, x: note.x, y: note.y });
			if ('error' in result) throw new Error(result.error);
			db.prepare('DELETE FROM canvas_notes WHERE id = ?').run(noteId);
		})();
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Converting the note failed.' };
	}
	return result;
}

// --- human revision (from the inspector) ---

export function reviseThought(
	thoughtId: string,
	fields: {
		title: string;
		statement: string;
		status: ThoughtStatus;
		/** undefined = unchanged, null = clear. */
		confidence?: Confidence | null;
		source?: string | null;
	}
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

	const confidence =
		fields.confidence === undefined
			? (row.confidence as string | null)
			: fields.confidence === null
				? null
				: JSON.stringify(fields.confidence);
	if (fields.confidence != null) {
		if (row.type !== 'prediction') return 'Confidence is only valid on a prediction.';
		const err = validateConfidence(fields.confidence);
		if (err) return err;
	}
	let source =
		fields.source === undefined ? ((row.source as string | null) ?? null) : fields.source;
	if (source !== null) {
		if (typeof source !== 'string') return 'Invalid source.';
		source = source.trim() || null;
		if (source && source.length > SOURCE_LIMIT)
			return `Source is longer than ${SOURCE_LIMIT} characters.`;
	}

	if (
		row.title === fields.title &&
		row.statement === fields.statement &&
		row.status === fields.status &&
		(row.confidence ?? null) === confidence &&
		(row.source ?? null) === source
	)
		return null;

	const now = Date.now();
	db.transaction(() => {
		db.prepare(
			'UPDATE thoughts SET title = ?, statement = ?, status = ?, confidence = ?, source = ?, updated_at = ? WHERE id = ?'
		).run(fields.title, fields.statement, fields.status, confidence, source, now, thoughtId);
		db.prepare(
			`INSERT INTO thought_revisions
			   (id, thought_id, title, statement, status, confidence, source, actor_type, source_change_set_id, edited_from_proposal, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'human', NULL, 0, ?)`
		).run(id('rev'), thoughtId, fields.title, fields.statement, fields.status, confidence, source, now);
	})();
	return null;
}

// --- working-set membership (Phase 3) ---
// Membership is transient and binary: these functions only touch
// working_set_items, never the durable graph or its canvas layout, and apply
// immediately without going through the proposal tray.

export function addToWorkingSet(thoughtIds: string[]): string | null {
	const graphId = activeGraphId();
	const activeSet = activeWorkingSetId(graphId);
	if (!activeSet) return 'No group is active — create one first.';
	const exists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	const insert = db.prepare(
		'INSERT INTO working_set_items (working_set_id, thought_id) VALUES (?, ?) ON CONFLICT DO NOTHING'
	);
	for (const tid of thoughtIds) {
		if (typeof tid !== 'string' || !exists.get(tid, graphId)) return `Unknown thought: ${tid}`;
	}
	db.transaction(() => {
		for (const tid of thoughtIds) insert.run(activeSet, tid);
	})();
	return null;
}

export function removeFromWorkingSet(thoughtId: string): string | null {
	const activeSet = activeWorkingSetId();
	if (!activeSet) return 'No group is active.';
	const res = db
		.prepare('DELETE FROM working_set_items WHERE working_set_id = ? AND thought_id = ?')
		.run(activeSet, thoughtId);
	return res.changes === 0 ? 'That thought is not in the group.' : null;
}

export function clearWorkingSet(): string | null {
	const activeSet = activeWorkingSetId();
	if (!activeSet) return 'No group is active.';
	db.prepare('DELETE FROM working_set_items WHERE working_set_id = ?').run(activeSet);
	return null;
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

/** Create a working set (lens) and make it active, optionally seeded with
 *  existing thoughts (used to promote a browse filter to a set). Membership
 *  only — the canvas layout is untouched. */
export function createWorkingSet(name?: string, thoughtIds?: string[]): string | null {
	const graphId = activeGraphId();
	const count = (
		db.prepare('SELECT COUNT(*) AS n FROM working_sets WHERE graph_id = ?').get(graphId) as {
			n: number;
		}
	).n;
	const trimmed = typeof name === 'string' ? name.trim() : '';
	let finalName = trimmed || `Group ${count + 1}`;
	if (finalName.length > SET_NAME_LIMIT) finalName = `${finalName.slice(0, SET_NAME_LIMIT - 1)}…`;
	const seeds = [...new Set(Array.isArray(thoughtIds) ? thoughtIds : [])];
	const exists = db.prepare('SELECT 1 FROM thoughts WHERE id = ? AND graph_id = ?');
	for (const tid of seeds) {
		if (typeof tid !== 'string' || !exists.get(tid, graphId)) return `Unknown thought: ${tid}`;
	}
	const wsId = id('ws');
	db.transaction(() => {
		db.prepare('INSERT INTO working_sets (id, name, graph_id, created_at) VALUES (?, ?, ?, ?)').run(
			wsId,
			finalName,
			graphId,
			Date.now()
		);
		const insert = db.prepare(
			'INSERT INTO working_set_items (working_set_id, thought_id) VALUES (?, ?)'
		);
		for (const tid of seeds) insert.run(wsId, tid);
		setMeta(`active_working_set:${graphId}`, wsId);
	})();
	return null;
}

/** Change which lens is active; null returns to the base state (whole graph). */
export function switchWorkingSet(wsId: string | null): string | null {
	const graphId = activeGraphId();
	if (wsId === null) {
		setMeta(`active_working_set:${graphId}`, null);
		return null;
	}
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(wsId, graphId))
		return 'Unknown group.';
	setMeta(`active_working_set:${graphId}`, wsId);
	return null;
}

export function renameWorkingSet(wsId: string, name: string): string | null {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (!trimmed) return 'A group needs a name.';
	if (trimmed.length > SET_NAME_LIMIT) return `Name is longer than ${SET_NAME_LIMIT} characters.`;
	const res = db
		.prepare('UPDATE working_sets SET name = ? WHERE id = ? AND graph_id = ?')
		.run(trimmed, wsId, activeGraphId());
	return res.changes === 0 ? 'Unknown group.' : null;
}

/** Spawn a new working set (lens) holding a thought plus its 1-hop neighbors
 *  and make it active (Phase 6). Membership only — the durable graph and its
 *  canvas layout are untouched; the cards light up where they already live. */
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
	db.transaction(() => {
		db.prepare('INSERT INTO working_sets (id, name, graph_id, created_at) VALUES (?, ?, ?, ?)').run(
			wsId,
			name,
			graphId,
			Date.now()
		);
		const insert = db.prepare(
			'INSERT INTO working_set_items (working_set_id, thought_id) VALUES (?, ?)'
		);
		insert.run(wsId, thoughtId);
		for (const nid of neighbors) insert.run(wsId, nid);
		setMeta(`active_working_set:${graphId}`, wsId);
	})();
	return null;
}

/** Load only the requested group's drafts; canvas mutations never carry prose bodies. */
export function getProseTreatments(workingSetId: string): ProseTreatment[] {
	const graphId = activeGraphId();
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(workingSetId, graphId))
		return [];
	const fingerprint = proseFingerprint(graphId, workingSetId);
	return (
		// rowid breaks generated_at ties (drafts can land in the same millisecond).
		db.prepare('SELECT * FROM prose_treatments WHERE graph_id = ? AND working_set_id = ? ORDER BY generated_at DESC, rowid DESC')
			.all(graphId, workingSetId) as any[]
	).map((row): ProseTreatment => ({
		id: row.id,
		graphId: row.graph_id,
		workingSetId: row.working_set_id,
		style: row.style,
		title: row.title,
		body: row.body,
		model: row.model,
		guidance: row.guidance ?? '',
		generatedAt: row.generated_at,
		sourceFingerprint: row.source_fingerprint,
		sourceThoughtIds: JSON.parse(row.source_thought_ids),
		stale: fingerprint !== row.source_fingerprint
	}));

}

/** Lightweight graph-scoped index for reopening saved drafts. */
export function listProseDrafts(): { id: string; workingSetId: string; style: ProseStyle; title: string; generatedAt: number }[] {
	const graphId = activeGraphId();
	return (db.prepare(
		'SELECT id, working_set_id, style, title, generated_at FROM prose_treatments WHERE graph_id = ? ORDER BY generated_at DESC, rowid DESC'
	).all(graphId) as any[]).map((row) => ({
		id: row.id, workingSetId: row.working_set_id, style: row.style as ProseStyle,
		title: row.title, generatedAt: row.generated_at
	}));
}

// Prose is derived from a captured source snapshot, separate from graph edits.
function proseSource(graphId: string, workingSetId: string) {
	const rows = db.prepare(`
		SELECT t.id, t.type, t.status, t.title, t.statement, t.confidence, t.source
		FROM thoughts t JOIN working_set_items w ON w.thought_id = t.id
		WHERE w.working_set_id = ? AND t.graph_id = ? ORDER BY t.id
	`).all(workingSetId, graphId) as (Pick<Thought, 'id' | 'type' | 'status' | 'title' | 'statement'> & {
		confidence: string | null; source: string | null;
	})[];
	const thoughts: ProseInput['thoughts'] = rows.map((row) => ({
		...row,
		confidence: row.confidence ? JSON.parse(row.confidence) : undefined,
		source: row.source ?? undefined
	}));
	const relations = db.prepare(`
		SELECT r.from_thought_id AS "from", r.to_thought_id AS "to", r.type
		FROM relations r
		JOIN working_set_items a ON a.thought_id = r.from_thought_id AND a.working_set_id = ?
		JOIN working_set_items b ON b.thought_id = r.to_thought_id AND b.working_set_id = ?
		WHERE r.graph_id = ? ORDER BY r.from_thought_id, r.to_thought_id, r.type
	`).all(workingSetId, workingSetId, graphId) as ProseInput['relations'];
	const group = db.prepare('SELECT name FROM working_sets WHERE id = ? AND graph_id = ?').get(workingSetId, graphId) as { name: string } | undefined;
	return { thoughts, relations, groupName: group?.name ?? '' };
}

function fingerprintSource(source: ReturnType<typeof proseSource>): string {
	return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function proseFingerprint(graphId: string, workingSetId: string): string {
	return fingerprintSource(proseSource(graphId, workingSetId));
}

/** Persist the latest requested draft in its original graph/group/style slot. */
export async function generateProse(
	workingSetId: string,
	style: ProseStyle,
	selection?: ModelSelection,
	guidance = ''
): Promise<{ error: string } | { treatment: ProseTreatment }> {
	const graphId = activeGraphId();
	if (!['overview', 'paper', 'blog', 'polemic'].includes(style))
		return { error: 'Unknown prose style.' };
	const group = db.prepare('SELECT name FROM working_sets WHERE id = ? AND graph_id = ?')
		.get(workingSetId, graphId) as { name: string } | undefined;
	if (!group) return { error: 'Unknown group.' };
	const source = proseSource(graphId, workingSetId);
	if (!source.thoughts.length) return { error: 'This group has no thoughts to write from.' };

	const fingerprint = fingerprintSource(source);
	const slot = JSON.stringify([graphId, workingSetId, style]);
	const generation = Symbol();
	proseGenerationSlots.set(slot, generation);
	try {
		const generated = await generateTreatment(
			{ style, guidance, ...source }, selection ?? defaultSelection()
		);
		if (proseGenerationSlots.get(slot) !== generation)
			return { error: 'A newer prose request replaced this one.' };
		if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(workingSetId, graphId))
			return { error: 'This group was removed while prose was generating.' };

		const treatment: ProseTreatment = {
			id: id('prose'), graphId, workingSetId, style,
			title: generated.title, body: generated.body,
			model: `${generated.adapter}:${generated.model}`,
			guidance,
			generatedAt: Date.now(),
			sourceFingerprint: fingerprint,
			sourceThoughtIds: source.thoughts.map((thought) => thought.id),
			stale: proseFingerprint(graphId, workingSetId) !== fingerprint
		};
		// Append-only: every generation adds a draft and the slot keeps its history.
		db.prepare(`
			INSERT INTO prose_treatments
				(id, graph_id, working_set_id, style, title, body, model, generated_at, source_fingerprint, source_thought_ids, guidance)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			treatment.id, graphId, workingSetId, style, treatment.title, treatment.body,
			treatment.model, treatment.generatedAt, fingerprint, JSON.stringify(treatment.sourceThoughtIds), guidance
		);
		return { treatment };
	} catch (error) {
		return { error: error instanceof Error ? error.message : 'Prose generation failed.' };
	} finally {
		if (proseGenerationSlots.get(slot) === generation) proseGenerationSlots.delete(slot);
	}
}

/** Delete one saved draft — pruning history never touches the graph. */
export function deleteProseDraft(draftId: string): string | null {
	const changed = db
		.prepare('DELETE FROM prose_treatments WHERE id = ? AND graph_id = ?')
		.run(draftId, activeGraphId()).changes;
	return changed ? null : 'Unknown draft.';
}

/** Delete a working set and its derived prose; thoughts stay in the graph.
 * Deleting the active group returns to All thoughts. */
export function deleteWorkingSet(wsId: string): string | null {
	const graphId = activeGraphId();
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(wsId, graphId))
		return 'Unknown group.';
	db.transaction(() => {
		db.prepare('DELETE FROM prose_treatments WHERE graph_id = ? AND working_set_id = ?').run(graphId, wsId);
		db.prepare('DELETE FROM working_set_items WHERE working_set_id = ?').run(wsId);
		db.prepare('DELETE FROM working_sets WHERE id = ?').run(wsId);
		if (getMeta(`active_working_set:${graphId}`) === wsId)
			setMeta(`active_working_set:${graphId}`, null);
	})();
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
	// No working set: a new graph starts in the base state — an empty canvas.
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

// --- canvas layout persistence ---

/** Persist card drags on the whole-graph canvas, plus note drags, text, and
 *  user-set sizes (best-effort, debounced by the client). Only updates rows
 *  that exist. */
export function updateCanvasPositions(
	items: { thoughtId: string; x: number; y: number }[],
	notes: { id: string; x: number; y: number; body: string; w?: number | null; h?: number | null }[] = []
): void {
	const graphId = activeGraphId();
	const update = db.prepare(
		'UPDATE canvas_positions SET x = ?, y = ? WHERE graph_id = ? AND thought_id = ?'
	);
	const updateNote = db.prepare(
		'UPDATE canvas_notes SET x = ?, y = ?, body = ?, w = ?, h = ? WHERE graph_id = ? AND id = ?'
	);
	// A dimension is either a sane finite number or null (back to the default).
	const dim = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 80 && v <= 4000 ? v : null);
	db.transaction(() => {
		for (const item of items) {
			if (Number.isFinite(item.x) && Number.isFinite(item.y))
				update.run(item.x, item.y, graphId, item.thoughtId);
		}
		for (const note of notes) {
			if (Number.isFinite(note.x) && Number.isFinite(note.y) && typeof note.body === 'string' && note.body.length <= NOTE_LIMIT)
				updateNote.run(note.x, note.y, note.body, dim(note.w), dim(note.h), graphId, note.id);
		}
	})();
}

// --- export / snapshot ---

/** JSON dump of one graph's persisted state (default: the active graph), for
 *  recovery, debugging, and undo snapshots. Per-graph, per docs/design.md Phase 5. */
export function exportState(graphId: string = activeGraphId(), { includeProse = true } = {}) {
	const graph = db.prepare('SELECT * FROM graphs WHERE id = ?').get(graphId) as any;
	return {
		exportedAt: Date.now(),
		graph: { id: graph.id, name: graph.name },
		conversations: includeProse ? conversationsForGraph(graphId) : [],
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
		canvas_positions: db
			.prepare('SELECT * FROM canvas_positions WHERE graph_id = ?')
			.all(graphId),
		// Present in exports for completeness; restore() leaves notes alone —
		// like pins, they are annotation state no change set can touch.
		canvas_notes: db
			.prepare('SELECT * FROM canvas_notes WHERE graph_id = ? ORDER BY created_at, rowid')
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
			.all(graphId),
		// Undo preserves live drafts, so internal snapshots can omit these bodies.
		prose_treatments: includeProse
			? db.prepare('SELECT * FROM prose_treatments WHERE graph_id = ? ORDER BY generated_at, rowid').all(graphId)
			: []
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
		// Treatments are derived reading artifacts, not part of a ratified graph
		// change. Preserve those whose group still exists after restore; a missing
		// group makes its treatment impossible to open, so clean it up explicitly.
		const treatmentRows = db.prepare('SELECT * FROM prose_treatments WHERE graph_id = ?').all(graphId) as any[];
		// Pins are attention state no change set can touch, so undoing an apply
		// keeps the *current* pins rather than reverting to the snapshot's —
		// minus any pin whose thought does not survive the restore. A thought that
		// is absent right now has no current pin state to keep, so it comes back
		// pinned as the snapshot had it — undoing a deletion restores the pin too.
		const restoredThoughtIds = new Set((snapshot.thoughts as any[]).map((t) => t.id));
		const presentThoughtIds = new Set(
			(db.prepare('SELECT id FROM thoughts WHERE graph_id = ?').all(graphId) as any[]).map((t) => t.id)
		);
		const pins = (
			db.prepare('SELECT * FROM pinned_thoughts WHERE graph_id = ?').all(graphId) as any[]
		).filter((p) => restoredThoughtIds.has(p.thought_id));
		for (const p of snapshot.pinned_thoughts as any[])
			if (restoredThoughtIds.has(p.thought_id) && !presentThoughtIds.has(p.thought_id)) pins.push(p);
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
		db.prepare('DELETE FROM canvas_positions WHERE graph_id = ?').run(graphId);
		db.prepare('DELETE FROM scratch_notes WHERE graph_id = ?').run(graphId);
		db.prepare('DELETE FROM thoughts WHERE graph_id = ?').run(graphId);
		insert('thoughts', snapshot.thoughts as any[]);
		// Keep transcripts, but return conversations to their proposal after undo.
		db.prepare('UPDATE conversations SET thought_id = NULL WHERE graph_id = ? AND thought_id NOT IN (SELECT id FROM thoughts WHERE graph_id = ?)').run(graphId, graphId);
		insert('thought_revisions', snapshot.thought_revisions as any[]);
		insert('relations', snapshot.relations as any[]);
		insert('working_sets', snapshot.working_sets as any[]);
		insert('working_set_items', snapshot.working_set_items as any[]);
		const restoredSets = new Set((snapshot.working_sets as any[]).map((s) => s.id));
		for (const prose of treatmentRows) if (!restoredSets.has(prose.working_set_id)) db.prepare('DELETE FROM prose_treatments WHERE id = ?').run(prose.id);
		insert('canvas_positions', snapshot.canvas_positions as any[]);
		insert('change_sets', snapshot.change_sets as any[]);
		insert('proposed_operations', snapshot.proposed_operations as any[]);
		insert('scratch_notes', snapshot.scratch_notes as any[]);
		insert('pinned_thoughts', pins);
	})();
}
