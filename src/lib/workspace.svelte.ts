// Client workspace store. The server (SQLite behind /api/*) owns canonical
// state; this store mirrors it, keeps view-only state (selection, zoom, ghost
// positions), and refreshes from the state payload every mutation returns.

import { browser } from '$app/environment';
import {
	effectivePayload,
	type AgentAction,
	type ChangeSet,
	type OperationDecision,
	type OperationPayload,
	type ProposedOperation,
	type ReentrySummary,
	type Relation,
	type ScratchNote,
	type Thought,
	type ThoughtStatus,
	type WorkingSetItem,
	type WorkspaceState
} from './types';

export interface GhostPosition {
	x: number;
	y: number;
}

export const CARD_W = 240;
export const CARD_H = 92;

class Workspace {
	loading = $state(true);
	loadError = $state<string | null>(null);

	thoughts = $state<Record<string, Thought>>({});
	relations = $state<Relation[]>([]);
	workingSet = $state<WorkingSetItem[]>([]);
	scratchNotes = $state<ScratchNote[]>([]);
	scratchDraft = $state('');
	pendingChangeSets = $state<ChangeSet[]>([]);
	decidedChangeSets = $state<ChangeSet[]>([]);
	undoLabel = $state<string | null>(null);

	selectedIds = $state<string[]>([]);
	zoom = $state<'overview' | 'reading'>('overview');
	/** Preview positions for proposed cards, keyed `${changeSetId}:${ref}`. View-only, not persisted. */
	ghostPositions = $state<Record<string, GhostPosition>>({});
	notice = $state<string | null>(null);

	reentry = $state<ReentrySummary | null>(null);
	showReentry = $state(false);

	constructor() {
		if (browser) void this.load();
	}

	async load() {
		this.loading = true;
		this.loadError = null;
		try {
			const res = await fetch('/api/state');
			if (!res.ok) throw new Error(`Server responded ${res.status}`);
			const data = await res.json();
			this.applyState(data.state);
			this.reentry = data.reentry;
			// Structural summary instead of a replay — but only on an actual return visit.
			this.showReentry = data.reentry?.lastVisitAt != null;
		} catch (e) {
			this.loadError = e instanceof Error ? e.message : 'Could not reach the Trellis server.';
		} finally {
			this.loading = false;
		}
	}

	private applyState(s: WorkspaceState) {
		this.thoughts = s.thoughts;
		this.relations = s.relations;
		this.workingSet = s.workingSet;
		this.scratchNotes = s.scratchNotes;
		this.pendingChangeSets = s.pendingChangeSets;
		this.decidedChangeSets = s.decidedChangeSets;
		this.undoLabel = s.undoLabel;
		this.selectedIds = this.selectedIds.filter((id) => id in s.thoughts);
		for (const cs of s.pendingChangeSets) this.ensureGhosts(cs);
		for (const key of Object.keys(this.ghostPositions)) {
			const csId = key.slice(0, key.indexOf(':'));
			if (!s.pendingChangeSets.some((cs) => cs.id === csId)) delete this.ghostPositions[key];
		}
	}

	private async post(url: string, body?: unknown): Promise<string | null> {
		await this.flushMoves();
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body ?? {})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return data.error ?? `Request failed (${res.status}).`;
			if (data.state) this.applyState(data.state);
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
		}
	}

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

	// --- canvas (positions update locally, persisted with a debounce) ---

	private pendingMoves = new Map<string, GhostPosition>();
	private moveTimer: ReturnType<typeof setTimeout> | null = null;

	moveCard(thoughtId: string, x: number, y: number) {
		const item = this.workingSet.find((w) => w.thoughtId === thoughtId);
		if (!item) return;
		item.x = x;
		item.y = y;
		this.pendingMoves.set(thoughtId, { x, y });
		if (this.moveTimer) clearTimeout(this.moveTimer);
		this.moveTimer = setTimeout(() => void this.flushMoves(), 400);
	}

	private async flushMoves() {
		if (this.moveTimer) {
			clearTimeout(this.moveTimer);
			this.moveTimer = null;
		}
		if (this.pendingMoves.size === 0) return;
		const items = [...this.pendingMoves.entries()].map(([thoughtId, p]) => ({
			thoughtId,
			...p
		}));
		this.pendingMoves.clear();
		try {
			await fetch('/api/workingset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items })
			});
		} catch {
			// Position persistence is best-effort; the next successful save wins.
		}
	}

	moveGhost(key: string, x: number, y: number) {
		if (this.ghostPositions[key]) this.ghostPositions[key] = { x, y };
	}

	position(thoughtId: string): GhostPosition | undefined {
		return this.workingSet.find((w) => w.thoughtId === thoughtId);
	}

	// --- invoking agent operations ---

	/** The action currently generating a proposal, if any (live calls take seconds). */
	invoking = $state<AgentAction | null>(null);

	async invoke(action: AgentAction): Promise<string | null> {
		if (this.invoking) return null;
		const scratchBody =
			action === 'decompose' && this.scratchDraft.trim().length > 0
				? this.scratchDraft
				: undefined;
		if (!scratchBody && this.selectedIds.length === 0) {
			return action === 'decompose'
				? 'Decompose needs scratch text or a selected thought.'
				: `Select at least one thought to ${action}.`;
		}
		this.invoking = action;
		try {
			const err = await this.post('/api/invoke', {
				action,
				selectedIds: [...this.selectedIds],
				scratchBody
			});
			if (!err && scratchBody) this.scratchDraft = '';
			return err;
		} finally {
			this.invoking = null;
		}
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

	private ensureGhosts(cs: ChangeSet) {
		const missing = this.previewRefs(cs).filter(
			({ ref }) => !this.ghostPositions[`${cs.id}:${ref}`]
		);
		if (missing.length === 0) return;
		const maxX = Math.max(0, ...this.workingSet.map((w) => w.x));
		const baseX = maxX + CARD_W + 80;
		let y = 60;
		const taken = new Set(
			Object.entries(this.ghostPositions)
				.filter(([key]) => key.startsWith(`${cs.id}:`))
				.map(([, p]) => p.y)
		);
		for (const { ref } of missing) {
			while (taken.has(y)) y += CARD_H + 48;
			taken.add(y);
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

	async setDecision(
		cs: ChangeSet,
		op: ProposedOperation,
		decision: OperationDecision
	): Promise<string | null> {
		if (decision === 'accepted') {
			const blocked = this.acceptBlockReason(cs, op);
			if (blocked) return blocked;
		}
		return this.post(`/api/changesets/${cs.id}/decide`, { opId: op.id, decision });
	}

	async saveEdit(cs: ChangeSet, op: ProposedOperation, edited: OperationPayload): Promise<string | null> {
		return this.post(`/api/changesets/${cs.id}/edit`, { opId: op.id, editedPayload: edited });
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
			if (!cs.operations.some((o) => o.id === op.id)) continue;
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

	async applyChangeSet(cs: ChangeSet): Promise<string | null> {
		if (!this.allDecided(cs)) return 'Decide every operation before applying.';
		// Ghost preview positions become the real card positions.
		const positions: Record<string, GhostPosition> = {};
		for (const [key, pos] of Object.entries(this.ghostPositions)) {
			if (key.startsWith(`${cs.id}:`)) positions[key.slice(cs.id.length + 1)] = pos;
		}
		const accepted = cs.operations.filter((o) => o.decision === 'accepted').length;
		const err = await this.post(`/api/changesets/${cs.id}/apply`, { positions });
		if (err) return err;
		this.notice =
			accepted === 0
				? 'Change set rejected — nothing entered the graph.'
				: `Applied ${accepted} of ${cs.operations.length} operations.`;
		return null;
	}

	// --- human revision (from the inspector) ---

	async reviseThought(
		id: string,
		fields: { title: string; statement: string; status: ThoughtStatus }
	): Promise<string | null> {
		const t = this.thoughts[id];
		if (!t) return null;
		if (t.title === fields.title && t.statement === fields.statement && t.status === fields.status)
			return null;
		return this.post(`/api/thoughts/${id}/revise`, fields);
	}

	// --- undo ---

	async undoLastApply(): Promise<string | null> {
		const err = await this.post('/api/undo');
		if (!err) this.notice = 'Reverted the last applied change set; it is back in the tray.';
		return err;
	}

	dismissReentry() {
		this.showReentry = false;
	}
}

export const workspace = new Workspace();
