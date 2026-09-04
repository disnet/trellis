// In-memory workspace state for Phase 0. No persistence, no network —
// the fixture engine plays the model's role and everything else behaves
// as the real loop will: propose → review → ratify → graph.

import { runFixture } from './fixtures';
import { seedRelations, seedThoughts, seedWorkingSet } from './seed';
import {
	effectivePayload,
	type AgentAction,
	type ChangeSet,
	type OperationDecision,
	type OperationPayload,
	type ProposedOperation,
	type Relation,
	type ScratchNote,
	type Thought,
	type ThoughtStatus,
	type WorkingSetItem
} from './types';

export interface GhostPosition {
	x: number;
	y: number;
}

interface Snapshot {
	thoughts: Record<string, Thought>;
	relations: Relation[];
	workingSet: WorkingSetItem[];
	pendingChangeSets: ChangeSet[];
	decidedChangeSets: ChangeSet[];
	ghostPositions: Record<string, GhostPosition>;
	appliedChangeSetLabel: string;
}

export const CARD_W = 240;
export const CARD_H = 92;

class Workspace {
	thoughts = $state<Record<string, Thought>>({});
	relations = $state<Relation[]>([]);
	workingSet = $state<WorkingSetItem[]>([]);
	scratchNotes = $state<ScratchNote[]>([]);
	scratchDraft = $state('');
	pendingChangeSets = $state<ChangeSet[]>([]);
	decidedChangeSets = $state<ChangeSet[]>([]);
	selectedIds = $state<string[]>([]);
	zoom = $state<'overview' | 'reading'>('overview');
	/** Preview positions for proposed cards, keyed `${changeSetId}:${ref}`. */
	ghostPositions = $state<Record<string, GhostPosition>>({});
	notice = $state<string | null>(null);

	private undoSnapshot: Snapshot | null = null;
	undoLabel = $state<string | null>(null);
	private counter = 0;

	constructor() {
		for (const t of seedThoughts) this.thoughts[t.id] = t;
		this.relations = [...seedRelations];
		this.workingSet = [...seedWorkingSet];
	}

	nextId = (prefix: string) => `${prefix}-${++this.counter}`;

	// --- selection ---

	select(id: string, additive = false) {
		if (additive) {
			this.selectedIds = this.selectedIds.includes(id)
				? this.selectedIds.filter((s) => s !== id)
				: [...this.selectedIds, id];
		} else {
			this.selectedIds = [id];
		}
	}

	clearSelection() {
		this.selectedIds = [];
	}

	// --- canvas ---

	moveCard(thoughtId: string, x: number, y: number) {
		const item = this.workingSet.find((w) => w.thoughtId === thoughtId);
		if (item) {
			item.x = x;
			item.y = y;
		}
	}

	moveGhost(key: string, x: number, y: number) {
		if (this.ghostPositions[key]) this.ghostPositions[key] = { x, y };
	}

	position(thoughtId: string): GhostPosition | undefined {
		return this.workingSet.find((w) => w.thoughtId === thoughtId);
	}

	// --- invoking agent operations (fixtures) ---

	invoke(action: AgentAction): string | null {
		const fromScratch = action === 'decompose' && this.scratchDraft.trim().length > 0;
		if (!fromScratch && this.selectedIds.length === 0) {
			return action === 'decompose'
				? 'Decompose needs scratch text or a selected thought.'
				: `Select at least one thought to ${action}.`;
		}

		let scratchId: string | undefined;
		if (fromScratch) {
			scratchId = this.nextId('scratch');
			this.scratchNotes.push({ id: scratchId, body: this.scratchDraft, createdAt: Date.now() });
		}

		const cs = runFixture(action, {
			selectedIds: [...this.selectedIds],
			scratchId,
			nextId: this.nextId,
			now: Date.now(),
			thoughtTitle: (id) => this.thoughts[id]?.title ?? id,
			thoughtExists: (id) => id in this.thoughts
		});

		if (scratchId) {
			const note = this.scratchNotes.find((n) => n.id === scratchId);
			if (note) note.distilledChangeSetId = cs.id;
			this.scratchDraft = '';
		}

		this.placeGhosts(cs);
		this.pendingChangeSets.push(cs);
		return null;
	}

	/** Cards a pending change set will add to the canvas: new thoughts plus
	 *  existing off-canvas thoughts referenced by proposed relations. */
	previewRefs(cs: ChangeSet): { ref: string; existingId?: string }[] {
		const out: { ref: string; existingId?: string }[] = [];
		const seen = new Set<string>();
		for (const op of cs.operations) {
			const p = effectivePayload(op);
			if (p.op === 'create_thought') {
				if (!seen.has(op.clientRef)) {
					seen.add(op.clientRef);
					out.push({ ref: op.clientRef });
				}
			} else if (p.op === 'add_relation') {
				if (op.decision === 'rejected') continue;
				for (const end of [p.from, p.to]) {
					const isExisting = end in this.thoughts;
					const onCanvas = isExisting && this.workingSet.some((w) => w.thoughtId === end);
					if (isExisting && !onCanvas && !seen.has(end)) {
						seen.add(end);
						out.push({ ref: end, existingId: end });
					}
				}
			}
		}
		return out;
	}

	private placeGhosts(cs: ChangeSet) {
		const maxX = Math.max(0, ...this.workingSet.map((w) => w.x));
		const baseX = maxX + CARD_W + 80;
		let y = 60;
		for (const { ref } of this.previewRefs(cs)) {
			this.ghostPositions[`${cs.id}:${ref}`] = { x: baseX, y };
			y += CARD_H + 48;
		}
	}

	// --- review decisions ---

	private opByRef(cs: ChangeSet, ref: string): ProposedOperation | undefined {
		return cs.operations.find((o) => o.clientRef === ref);
	}

	/** null if acceptable, else the reason it is blocked. */
	acceptBlockReason(cs: ChangeSet, op: ProposedOperation): string | null {
		for (const ref of op.dependsOn) {
			const dep = this.opByRef(cs, ref);
			if (dep && dep.decision === 'rejected') {
				return `Blocked: depends on rejected operation “${this.opLabel(dep)}”.`;
			}
		}
		return null;
	}

	setDecision(cs: ChangeSet, op: ProposedOperation, decision: OperationDecision): string | null {
		if (decision === 'accepted') {
			const blocked = this.acceptBlockReason(cs, op);
			if (blocked) return blocked;
		}
		op.decision = decision;
		op.decidedAt = Date.now();
		if (decision === 'rejected') {
			// Cascade: anything depending on this operation cannot stand.
			for (const other of cs.operations) {
				if (other.dependsOn.includes(op.clientRef) && other.decision !== 'rejected') {
					other.decision = 'rejected';
					other.decidedAt = Date.now();
				}
			}
		}
		return null;
	}

	saveEdit(op: ProposedOperation, edited: OperationPayload) {
		op.editedPayload = edited;
	}

	opLabel(op: ProposedOperation): string {
		const p = effectivePayload(op);
		if (p.op === 'create_thought') return `New ${p.thought.type}: ${p.thought.title}`;
		if (p.op === 'revise_thought')
			return `Revise: ${this.thoughts[p.thoughtId]?.title ?? p.thoughtId}`;
		const name = (id: string) => this.thoughts[id]?.title ?? this.refTitle(op, id) ?? id;
		return `${name(p.from)} —${p.relationType}→ ${name(p.to)}`;
	}

	private refTitle(op: ProposedOperation, ref: string): string | null {
		// Look up a clientRef inside the same pending change set.
		for (const cs of this.pendingChangeSets) {
			if (!cs.operations.includes(op)) continue;
			const target = this.opByRef(cs, ref);
			if (target) {
				const p = effectivePayload(target);
				if (p.op === 'create_thought') return p.thought.title;
			}
		}
		return null;
	}

	allDecided(cs: ChangeSet): boolean {
		return cs.operations.every((o) => o.decision !== 'pending');
	}

	// --- applying ---

	applyChangeSet(cs: ChangeSet): string | null {
		if (!this.allDecided(cs)) return 'Decide every operation before applying.';
		const accepted = cs.operations.filter((o) => o.decision === 'accepted');

		// Server-side style re-validation of the chosen subset.
		for (const op of accepted) {
			for (const ref of op.dependsOn) {
				const dep = this.opByRef(cs, ref);
				if (dep && dep.decision !== 'accepted') {
					return `Cannot apply: “${this.opLabel(op)}” depends on an operation that was not accepted.`;
				}
			}
		}

		this.undoSnapshot = this.takeSnapshot(cs.summary);
		this.undoLabel = cs.summary;

		const now = Date.now();
		const refToId: Record<string, string> = {};

		for (const op of accepted.sort((a, b) => a.sequence - b.sequence)) {
			const p = effectivePayload(op);
			const edited = op.editedPayload !== undefined;
			if (p.op === 'create_thought') {
				const id = this.nextId('t');
				refToId[op.clientRef] = id;
				this.thoughts[id] = {
					id,
					...p.thought,
					createdAt: now,
					updatedAt: now,
					revisions: [
						{
							id: this.nextId('rev'),
							title: p.thought.title,
							statement: p.thought.statement,
							status: p.thought.status,
							actorType: edited ? 'human' : 'agent',
							editedFromProposal: edited,
							sourceChangeSetId: cs.id,
							createdAt: now
						}
					]
				};
				const ghost = this.ghostPositions[`${cs.id}:${op.clientRef}`];
				this.workingSet.push({ thoughtId: id, x: ghost?.x ?? 80, y: ghost?.y ?? 80 });
			} else if (p.op === 'revise_thought') {
				const t = this.thoughts[p.thoughtId];
				if (!t) return `Cannot apply: unknown thought ${p.thoughtId}.`;
				const fields = { ...t, ...p.thought };
				t.title = fields.title;
				t.statement = fields.statement;
				t.status = fields.status;
				t.updatedAt = now;
				t.revisions.push({
					id: this.nextId('rev'),
					title: t.title,
					statement: t.statement,
					status: t.status,
					actorType: edited ? 'human' : 'agent',
					editedFromProposal: edited,
					sourceChangeSetId: cs.id,
					createdAt: now
				});
			} else {
				const from = refToId[p.from] ?? p.from;
				const to = refToId[p.to] ?? p.to;
				if (!this.thoughts[from] || !this.thoughts[to]) {
					return 'Cannot apply: relation endpoint does not exist.';
				}
				this.relations.push({
					id: this.nextId('r'),
					fromThoughtId: from,
					toThoughtId: to,
					type: p.relationType,
					createdBy: 'agent',
					sourceChangeSetId: cs.id,
					createdAt: now
				});
				// Surfaced existing thoughts join the working set so the relation is visible.
				for (const end of [from, to]) {
					if (!this.workingSet.some((w) => w.thoughtId === end)) {
						const ghost = this.ghostPositions[`${cs.id}:${end}`];
						this.workingSet.push({ thoughtId: end, x: ghost?.x ?? 80, y: ghost?.y ?? 400 });
					}
				}
			}
		}

		cs.status =
			accepted.length === 0
				? 'rejected'
				: accepted.length === cs.operations.length
					? 'applied'
					: 'partially_applied';
		cs.appliedAt = now;
		this.pendingChangeSets = this.pendingChangeSets.filter((c) => c.id !== cs.id);
		this.decidedChangeSets.push(cs);
		for (const key of Object.keys(this.ghostPositions)) {
			if (key.startsWith(`${cs.id}:`)) delete this.ghostPositions[key];
		}
		this.notice =
			cs.status === 'rejected'
				? 'Change set rejected — nothing entered the graph.'
				: `Applied ${accepted.length} of ${cs.operations.length} operations.`;
		return null;
	}

	// --- human revision (from the inspector) ---

	reviseThought(id: string, fields: { title: string; statement: string; status: ThoughtStatus }) {
		const t = this.thoughts[id];
		if (!t) return;
		if (t.title === fields.title && t.statement === fields.statement && t.status === fields.status)
			return;
		t.title = fields.title;
		t.statement = fields.statement;
		t.status = fields.status;
		t.updatedAt = Date.now();
		t.revisions.push({
			id: this.nextId('rev'),
			...fields,
			actorType: 'human',
			createdAt: Date.now()
		});
	}

	// --- undo ---

	private takeSnapshot(label: string): Snapshot {
		return structuredClone({
			thoughts: $state.snapshot(this.thoughts),
			relations: $state.snapshot(this.relations),
			workingSet: $state.snapshot(this.workingSet),
			pendingChangeSets: $state.snapshot(this.pendingChangeSets),
			decidedChangeSets: $state.snapshot(this.decidedChangeSets),
			ghostPositions: $state.snapshot(this.ghostPositions),
			appliedChangeSetLabel: label
		}) as Snapshot;
	}

	undoLastApply() {
		if (!this.undoSnapshot) return;
		const s = this.undoSnapshot;
		this.thoughts = s.thoughts;
		this.relations = s.relations;
		this.workingSet = s.workingSet;
		this.pendingChangeSets = s.pendingChangeSets;
		this.decidedChangeSets = s.decidedChangeSets;
		this.ghostPositions = s.ghostPositions;
		this.undoSnapshot = null;
		this.undoLabel = null;
		this.notice = 'Reverted the last applied change set; it is back in the tray.';
		this.selectedIds = this.selectedIds.filter((id) => id in this.thoughts);
	}
}

export const workspace = new Workspace();
