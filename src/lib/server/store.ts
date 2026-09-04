// Canonical graph operations over SQLite. All mutations happen here, inside
// transactions; model (fixture) output never writes directly to accepted graph
// tables — applying a change set is a separate, explicitly-invoked transaction.

import crypto from 'node:crypto';
import { db } from './db';
import { runFixture } from '$lib/fixtures';
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

const TITLE_LIMIT = 300;
const STATEMENT_LIMIT = 4000;

const THOUGHT_TYPES = ['claim', 'question', 'concept', 'example'];
const THOUGHT_STATUSES = ['tentative', 'developing', 'believed', 'contested', 'retired'];
const RELATION_TYPES = [
	'supports',
	'contradicts',
	'depends_on',
	'example_of',
	'supersedes',
	'related_to'
];

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
	const row = db.prepare('SELECT * FROM change_sets WHERE id = ?').get(csId);
	if (!row) return null;
	const ops = (
		db
			.prepare('SELECT * FROM proposed_operations WHERE change_set_id = ? ORDER BY sequence')
			.all(csId) as any[]
	).map(rowToOperation);
	return rowToChangeSet(row, ops);
}

export function getState(): WorkspaceState {
	const thoughtRows = db.prepare('SELECT * FROM thoughts').all() as any[];
	const revisionRows = db
		.prepare('SELECT * FROM thought_revisions ORDER BY created_at, rowid')
		.all() as any[];
	const revsByThought = new Map<string, ThoughtRevision[]>();
	for (const r of revisionRows) {
		const list = revsByThought.get(r.thought_id) ?? [];
		list.push(rowToRevision(r));
		revsByThought.set(r.thought_id, list);
	}

	const thoughts: Record<string, Thought> = {};
	for (const r of thoughtRows) thoughts[r.id] = rowToThought(r, revsByThought.get(r.id) ?? []);

	const relations = (db.prepare('SELECT * FROM relations ORDER BY created_at, rowid').all() as any[]).map(
		rowToRelation
	);
	const workingSet = (db.prepare('SELECT * FROM working_set_items').all() as any[]).map((r) => ({
		thoughtId: r.thought_id,
		x: r.x,
		y: r.y
	})) as WorkingSetItem[];
	const scratchNotes = (
		db.prepare('SELECT * FROM scratch_notes ORDER BY created_at, rowid').all() as any[]
	).map(rowToScratch);

	const csRows = db.prepare('SELECT * FROM change_sets ORDER BY created_at, rowid').all() as any[];
	const opRows = db
		.prepare('SELECT * FROM proposed_operations ORDER BY sequence')
		.all() as any[];
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
		thoughts,
		relations,
		workingSet,
		scratchNotes,
		pendingChangeSets,
		decidedChangeSets,
		undoLabel: getMeta('undo_label')
	};
}

/** Compute the structural re-entry summary against the previous visit, then record this one. */
export function reentrySummary(): ReentrySummary {
	const lastVisitRaw = getMeta('last_visit_at');
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

	setMeta('last_visit_at', String(Date.now()));

	return {
		lastVisitAt,
		central,
		attention,
		newThoughts,
		revisedThoughts,
		newRelations,
		pendingChangeSets: state.pendingChangeSets.length
	};
}

// --- invoking agent operations (fixtures stand in for the model until Phase 2) ---

export function invoke(
	action: AgentAction,
	selectedIds: string[],
	scratchBody?: string
): { error: string } | { changeSetId: string } {
	const fromScratch = action === 'decompose' && !!scratchBody?.trim();
	if (!fromScratch && selectedIds.length === 0) {
		return {
			error:
				action === 'decompose'
					? 'Decompose needs scratch text or a selected thought.'
					: `Select at least one thought to ${action}.`
		};
	}
	const exists = db.prepare('SELECT 1 FROM thoughts WHERE id = ?');
	for (const tid of selectedIds) {
		if (!exists.get(tid)) return { error: `Unknown thought in selection: ${tid}` };
	}

	const now = Date.now();
	const titleOf = db.prepare('SELECT title FROM thoughts WHERE id = ?');

	const changeSetId = db.transaction(() => {
		let scratchId: string | undefined;
		if (fromScratch) {
			scratchId = id('scratch');
			db.prepare('INSERT INTO scratch_notes (id, body, created_at) VALUES (?, ?, ?)').run(
				scratchId,
				scratchBody!,
				now
			);
		}

		const cs = runFixture(action, {
			selectedIds,
			scratchId,
			nextId: id,
			now,
			thoughtTitle: (tid) => (titleOf.get(tid) as { title: string } | undefined)?.title ?? tid,
			thoughtExists: (tid) => !!exists.get(tid)
		});

		db.prepare(
			`INSERT INTO change_sets (id, action, status, summary, invoked_on, scratch_id, created_at)
			 VALUES (?, ?, 'pending', ?, ?, ?, ?)`
		).run(cs.id, cs.action, cs.summary, JSON.stringify(cs.invokedOn), scratchId ?? null, now);

		const insertOp = db.prepare(
			`INSERT INTO proposed_operations
			   (id, change_set_id, client_ref, sequence, depends_on, evidence_refs, payload, rationale, decision)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
		);
		for (const op of cs.operations) {
			insertOp.run(
				op.id,
				cs.id,
				op.clientRef,
				op.sequence,
				JSON.stringify(op.dependsOn),
				JSON.stringify(op.evidenceRefs),
				JSON.stringify(op.payload),
				op.rationale
			);
		}

		if (scratchId) {
			db.prepare('UPDATE scratch_notes SET distilled_change_set_id = ? WHERE id = ?').run(
				cs.id,
				scratchId
			);
		}
		return cs.id;
	})();

	return { changeSetId };
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

	// Snapshot for change-set-granularity undo (survives restarts).
	const snapshot = JSON.stringify(exportState());

	const now = Date.now();
	const thoughtExists = db.prepare('SELECT 1 FROM thoughts WHERE id = ?');
	const onCanvas = db.prepare('SELECT 1 FROM working_set_items WHERE thought_id = ?');
	const insertItem = db.prepare('INSERT INTO working_set_items (thought_id, x, y) VALUES (?, ?, ?)');
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
						`INSERT INTO thoughts (id, type, status, title, statement, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?)`
					).run(tid, p.thought.type, p.thought.status, p.thought.title, p.thought.statement, now, now);
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
					insertItem.run(tid, pos.x, pos.y);
				} else if (p.op === 'revise_thought') {
					const row = db.prepare('SELECT * FROM thoughts WHERE id = ?').get(p.thoughtId) as any;
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
					if (!thoughtExists.get(from) || !thoughtExists.get(to)) {
						throw new Error('Cannot apply: relation endpoint does not exist.');
					}
					db.prepare(
						`INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, source_change_set_id, created_at)
						 VALUES (?, ?, ?, ?, 'agent', ?, ?)`
					).run(id('r'), from, to, p.relationType, cs.id, now);
					// Surfaced existing thoughts join the working set so the relation is visible.
					for (const end of [from, to]) {
						if (!onCanvas.get(end)) {
							const pos = place(end, 80);
							insertItem.run(end, pos.x, pos.y);
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

	setMeta('undo_snapshot', snapshot);
	setMeta('undo_label', cs.summary);

	const status = accepted.length === 0 ? 'rejected' : accepted.length === cs.operations.length ? 'applied' : 'partially_applied';
	return { applied: accepted.length, total: cs.operations.length, status };
}

// --- undo (last applied change set) ---

export function undoLastApply(): string | null {
	const snapshot = getMeta('undo_snapshot');
	if (!snapshot) return 'Nothing to undo.';
	try {
		restore(JSON.parse(snapshot));
	} catch (e) {
		return e instanceof Error ? e.message : 'Undo failed.';
	}
	setMeta('undo_snapshot', null);
	setMeta('undo_label', null);
	return null;
}

// --- human revision (from the inspector) ---

export function reviseThought(
	thoughtId: string,
	fields: { title: string; statement: string; status: ThoughtStatus }
): string | null {
	const row = db.prepare('SELECT * FROM thoughts WHERE id = ?').get(thoughtId) as any;
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

// --- working-set layout persistence ---

export function updatePositions(items: { thoughtId: string; x: number; y: number }[]): void {
	const update = db.prepare('UPDATE working_set_items SET x = ?, y = ? WHERE thought_id = ?');
	db.transaction(() => {
		for (const item of items) {
			if (Number.isFinite(item.x) && Number.isFinite(item.y)) update.run(item.x, item.y, item.thoughtId);
		}
	})();
}

// --- export / snapshot ---

/** Full JSON dump of persisted state, for recovery, debugging, and undo snapshots. */
export function exportState() {
	return {
		exportedAt: Date.now(),
		thoughts: db.prepare('SELECT * FROM thoughts').all(),
		thought_revisions: db.prepare('SELECT * FROM thought_revisions ORDER BY created_at, rowid').all(),
		relations: db.prepare('SELECT * FROM relations ORDER BY created_at, rowid').all(),
		working_set_items: db.prepare('SELECT * FROM working_set_items').all(),
		change_sets: db.prepare('SELECT * FROM change_sets ORDER BY created_at, rowid').all(),
		proposed_operations: db.prepare('SELECT * FROM proposed_operations ORDER BY sequence').all(),
		scratch_notes: db.prepare('SELECT * FROM scratch_notes ORDER BY created_at, rowid').all()
	};
}

function restore(snapshot: ReturnType<typeof exportState>) {
	const insert = (table: string, rows: any[]) => {
		for (const row of rows) {
			const cols = Object.keys(row);
			db.prepare(
				`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
			).run(...cols.map((c) => row[c]));
		}
	};
	db.transaction(() => {
		for (const table of [
			'proposed_operations',
			'change_sets',
			'thought_revisions',
			'relations',
			'working_set_items',
			'scratch_notes',
			'thoughts'
		]) {
			db.prepare(`DELETE FROM ${table}`).run();
		}
		insert('thoughts', snapshot.thoughts as any[]);
		insert('thought_revisions', snapshot.thought_revisions as any[]);
		insert('relations', snapshot.relations as any[]);
		insert('working_set_items', snapshot.working_set_items as any[]);
		insert('change_sets', snapshot.change_sets as any[]);
		insert('proposed_operations', snapshot.proposed_operations as any[]);
		insert('scratch_notes', snapshot.scratch_notes as any[]);
	})();
}
