// Client workspace store. The server (SQLite behind /api/*) owns canonical
// state; this store mirrors it, keeps view-only state (selection, zoom, ghost
// positions), and refreshes from the state payload every mutation returns.

import { browser } from '$app/environment';
import { isModelSelection, type ModelSelection } from './models';
import {
	effectivePayload,
	type AgentAction,
	type ChangeSet,
	type Confidence,
	type GraphInfo,
	type OperationDecision,
	type OperationPayload,
	type ProposedOperation,
	type ReentrySummary,
	type Relation,
	type ScratchNote,
	type Thought,
	type ThoughtStatus,
	type WorkingSetInfo,
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
	modelSelection = $state<ModelSelection>({ provider: 'live', model: '' });
	private selectionLoaded = false;

	selectModel(selection: ModelSelection) {
		if (this.invoking || !isModelSelection(selection)) return;
		this.modelSelection = selection;
		try { localStorage.setItem('trellis:model', JSON.stringify(selection)); } catch { /* Optional persistence. */ }
	}

	graphs = $state<GraphInfo[]>([]);
	activeGraphId = $state('');
	thoughts = $state<Record<string, Thought>>({});
	relations = $state<Relation[]>([]);
	workingSets = $state<WorkingSetInfo[]>([]);
	activeWorkingSetId = $state('');
	workingSet = $state<WorkingSetItem[]>([]);
	pinnedThoughtIds = $state<string[]>([]);
	scratchNotes = $state<ScratchNote[]>([]);
	scratchDraft = $state('');
	pendingChangeSets = $state<ChangeSet[]>([]);
	decidedChangeSets = $state<ChangeSet[]>([]);
	undoLabel = $state<string | null>(null);

	selectedIds = $state<string[]>([]);
	zoom = $state<'overview' | 'reading'>('overview');
	/** What the center pane shows: two projections of the working set, plus a
	 *  graph-wide browse table. View-only, never persisted. */
	view = $state<'canvas' | 'outline' | 'browse'>('canvas');
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
			if (!this.selectionLoaded) {
				if (isModelSelection(data.modelSelection)) this.modelSelection = data.modelSelection;
				try {
					const saved = JSON.parse(localStorage.getItem('trellis:model') ?? 'null');
					if (isModelSelection(saved)) this.modelSelection = saved;
				} catch { /* Use the server default. */ }
				this.selectionLoaded = true;
			}
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
		this.graphs = s.graphs;
		this.activeGraphId = s.activeGraphId;
		this.thoughts = s.thoughts;
		this.relations = s.relations;
		this.workingSets = s.workingSets;
		this.activeWorkingSetId = s.activeWorkingSetId;
		this.workingSet = s.workingSet;
		this.pinnedThoughtIds = s.pinnedThoughtIds;
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

	// --- working-set membership (Phase 3) ---
	// Membership is transient and binary: adding or removing never mutates the
	// durable graph, so it applies immediately, not through the proposal tray.

	inWorkingSet(thoughtId: string): boolean {
		return this.workingSet.some((w) => w.thoughtId === thoughtId);
	}

	/** First position not overlapping `taken`, scanning near `near` first, else a grid. */
	private freePosition(taken: GhostPosition[], near?: GhostPosition): GhostPosition {
		const stepX = CARD_W + 80;
		const stepY = CARD_H + 56;
		const collides = (x: number, y: number) =>
			taken.some((p) => Math.abs(p.x - x) < CARD_W + 24 && Math.abs(p.y - y) < CARD_H + 24);
		if (near) {
			const candidates = [
				[near.x + stepX, near.y],
				[near.x, near.y + stepY],
				[near.x + stepX, near.y + stepY],
				[near.x - stepX, near.y],
				[near.x, near.y - stepY],
				[near.x + stepX, near.y - stepY],
				[near.x - stepX, near.y + stepY],
				[near.x + 2 * stepX, near.y]
			];
			for (const [x, y] of candidates) {
				if (x >= 0 && y >= 0 && !collides(x, y)) return { x, y };
			}
		}
		for (let row = 0; row < 12; row++) {
			for (let col = 0; col < 7; col++) {
				const x = 80 + col * stepX;
				const y = 60 + row * stepY;
				if (!collides(x, y)) return { x, y };
			}
		}
		return { x: 80, y: 60 };
	}

	/** Add existing thoughts to the working set, placed near `near` when given. */
	async addToSet(thoughtIds: string[], near?: GhostPosition): Promise<string | null> {
		const ids = thoughtIds.filter((id) => id in this.thoughts && !this.inWorkingSet(id));
		if (ids.length === 0) return null;
		const taken: GhostPosition[] = [
			...this.workingSet.map((w) => ({ x: w.x, y: w.y })),
			...Object.values(this.ghostPositions)
		];
		const items = ids.map((thoughtId) => {
			const pos = this.freePosition(taken, near);
			taken.push(pos);
			return { thoughtId, ...pos };
		});
		return this.post('/api/workingset', { action: 'add', items });
	}

	/** Add one thought at an exact position (e.g. where its surfaced ghost sits). */
	async addToSetAt(thoughtId: string, pos: GhostPosition): Promise<string | null> {
		if (!(thoughtId in this.thoughts) || this.inWorkingSet(thoughtId)) return null;
		return this.post('/api/workingset', {
			action: 'add',
			items: [{ thoughtId, x: pos.x, y: pos.y }]
		});
	}

	/** Drop a thought from the working set; the durable graph is untouched. */
	async removeFromSet(thoughtId: string): Promise<string | null> {
		const err = await this.post('/api/workingset', { action: 'remove', thoughtId });
		if (!err) this.selectedIds = this.selectedIds.filter((id) => id !== thoughtId);
		return err;
	}

	// --- multiple working sets (tabs) ---

	/** Create a new (empty) working set and make it active. */
	async createSet(name?: string): Promise<string | null> {
		const err = await this.post('/api/workingset', { action: 'create', name });
		if (!err) this.selectedIds = [];
		return err;
	}

	/** Promote a set of existing thoughts (e.g. a browse filter's results) into
	 *  a new working set and make it active. Membership only — graph untouched. */
	async createSetFrom(name: string, thoughtIds: string[]): Promise<string | null> {
		const ids = thoughtIds.filter((id) => id in this.thoughts);
		if (ids.length === 0) return 'Nothing to promote — the filter matched no thoughts.';
		const err = await this.post('/api/workingset', { action: 'create', name, thoughtIds: ids });
		if (!err) {
			this.selectedIds = [];
			this.notice = `Opened ${ids.length} thought${ids.length === 1 ? '' : 's'} in the new working set “${name}”.`;
		}
		return err;
	}

	async switchSet(workingSetId: string): Promise<string | null> {
		if (workingSetId === this.activeWorkingSetId) return null;
		const err = await this.post('/api/workingset', { action: 'switch', workingSetId });
		if (!err) this.selectedIds = [];
		return err;
	}

	async renameSet(workingSetId: string, name: string): Promise<string | null> {
		return this.post('/api/workingset', { action: 'rename', workingSetId, name });
	}

	/** Delete a working set — membership only, the graph is untouched. */
	async deleteSet(workingSetId: string): Promise<string | null> {
		const wasActive = workingSetId === this.activeWorkingSetId;
		const err = await this.post('/api/workingset', { action: 'delete', workingSetId });
		if (!err && wasActive) this.selectedIds = [];
		return err;
	}

	/** Empty the working set entirely — an explicit start-fresh action. */
	async startFresh(): Promise<string | null> {
		const err = await this.post('/api/workingset', { action: 'clear' });
		if (!err) {
			this.selectedIds = [];
			this.notice = 'Working set emptied. The graph is untouched — search to rebuild.';
		}
		return err;
	}

	// --- multiple graphs (Phase 5) ---
	// A graph is a fully isolated knowledge base. Entering one (create or
	// switch) swaps the entire workspace — thoughts, working sets, scratch,
	// tray, and the re-entry summary all come from the target graph.

	/** Create a new, empty, isolated graph and switch into it. */
	async createGraph(name?: string): Promise<string | null> {
		return this.enterGraph({ action: 'create', name });
	}

	async switchGraph(graphId: string): Promise<string | null> {
		if (graphId === this.activeGraphId) return null;
		return this.enterGraph({ action: 'switch', graphId });
	}

	async renameGraph(graphId: string, name: string): Promise<string | null> {
		return this.post('/api/graphs', { action: 'rename', graphId, name });
	}

	private async enterGraph(body: unknown): Promise<string | null> {
		// Flush pending drags first so they land in the graph they belong to.
		await this.flushMoves();
		try {
			const res = await fetch('/api/graphs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return data.error ?? `Request failed (${res.status}).`;
			this.selectedIds = [];
			if (data.state) this.applyState(data.state);
			this.reentry = data.reentry ?? null;
			this.showReentry = data.reentry?.lastVisitAt != null;
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
		}
	}

	// --- pins (Phase 6) ---
	// Per-graph attention state: landmarks you keep returning to. Direct and
	// human-only — pinning never touches the durable graph.

	isPinned(thoughtId: string): boolean {
		return this.pinnedThoughtIds.includes(thoughtId);
	}

	async togglePin(thoughtId: string): Promise<string | null> {
		const action = this.isPinned(thoughtId) ? 'unpin' : 'pin';
		return this.post('/api/pins', { action, thoughtId });
	}

	/** Spawn a new working set around a thought and its 1-hop neighbors. */
	async openNeighborhood(thoughtId: string): Promise<string | null> {
		const title = this.thoughts[thoughtId]?.title ?? thoughtId;
		const err = await this.post('/api/workingset', { action: 'neighborhood', thoughtId });
		if (!err) {
			this.selectedIds = [thoughtId];
			const n = this.workingSet.length - 1;
			this.notice = `Opened “${title}” and ${n} neighbor${n === 1 ? '' : 's'} in a new working set.`;
		}
		return err;
	}

	/** 1-hop neighbors of the given thoughts that are not in the working set. */
	neighborIds(thoughtIds: string[]): string[] {
		const of = new Set(thoughtIds);
		const out = new Set<string>();
		for (const r of this.relations) {
			if (of.has(r.fromThoughtId) && !this.inWorkingSet(r.toThoughtId)) out.add(r.toThoughtId);
			if (of.has(r.toThoughtId) && !this.inWorkingSet(r.fromThoughtId)) out.add(r.fromThoughtId);
		}
		return [...out];
	}

	/** Pull a thought's 1-hop neighbors onto the canvas, near its card. */
	async pullNeighbors(thoughtId: string): Promise<string | null> {
		const ids = this.neighborIds([thoughtId]);
		if (ids.length === 0) {
			return 'No neighbors outside the working set.';
		}
		const err = await this.addToSet(ids, this.position(thoughtId));
		if (!err)
			this.notice = `Added ${ids.length} neighbor${ids.length === 1 ? '' : 's'} to the working set.`;
		return err;
	}

	/** Search the full graph by title + statement; pinned thoughts rank first,
	 *  then title matches. */
	searchGraph(query: string): Thought[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return Object.values(this.thoughts)
			.filter(
				(t) => t.title.toLowerCase().includes(q) || t.statement.toLowerCase().includes(q)
			)
			.sort((a, b) => {
				const aPin = this.isPinned(a.id) ? 0 : 1;
				const bPin = this.isPinned(b.id) ? 0 : 1;
				const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1;
				const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1;
				return aPin - bPin || aTitle - bTitle || b.updatedAt - a.updatedAt;
			});
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
				scratchBody,
				selection: { ...this.modelSelection }
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
		fields: {
			title: string;
			statement: string;
			status: ThoughtStatus;
			/** undefined = unchanged, null = clear. */
			confidence?: Confidence | null;
			source?: string | null;
		}
	): Promise<string | null> {
		const t = this.thoughts[id];
		if (!t) return null;
		const sameConfidence =
			fields.confidence === undefined ||
			JSON.stringify(fields.confidence) === JSON.stringify(t.confidence ?? null);
		const sameSource =
			fields.source === undefined || (fields.source ?? null) === (t.source ?? null);
		if (
			t.title === fields.title &&
			t.statement === fields.statement &&
			t.status === fields.status &&
			sameConfidence &&
			sameSource
		)
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
