// Client workspace store. The server (SQLite behind /api/*) owns canonical
// state; this store mirrors it, keeps view-only state (selection, zoom, ghost
// positions), and refreshes from the state payload every mutation returns.

import { browser } from '$app/environment';
import { tick } from 'svelte';
import { appearance } from './appearance.svelte';
import { expandLayout, openPosition, stageBeside, type LayoutRect } from './incremental-layout';
import { isModelSelection, type ModelSelection } from './models';
import {
	effectivePayload,
	type AgentAction,
	type CanvasNote,
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
	type ThoughtType,
	type WorkingSetInfo,
	type ProseTreatment,
	type ProseDraftSummary,
	type ProseStyle,
	type WorkspaceState
} from './types';

export interface GhostPosition {
	x: number;
	y: number;
}

/** What kind of thing a canvas item is: a thought's card, a note, or a
 *  proposal's preview card (addressed by its operation id). */
export type CanvasKind = 'card' | 'note' | 'ghost';

export const CARD_W = 240;
export const CARD_H = 92;

class Workspace {
	loading = $state(true);
	loadError = $state<string | null>(null);
	modelSelection = $state<ModelSelection>({ provider: 'live', model: '' });
	private selectionLoaded = false;
	private desktop = false;
	needsAgentSetup = $state(false);
	private selectionSave: Promise<unknown> = Promise.resolve();

	selectModel(selection: ModelSelection) {
		if (this.invoking || !isModelSelection(selection)) return;
		this.modelSelection = selection;
		this.needsAgentSetup = false;
		try { localStorage.setItem('trellis:model', JSON.stringify(selection)); } catch { /* Optional persistence. */ }
		if (this.desktop) this.selectionSave = this.selectionSave.then(async () => {
			const error = await this.post('/api/local-agents', { action: 'selection', selection });
			if (error) this.notice = error;
		});
	}

	graphs = $state<GraphInfo[]>([]);
	activeGraphId = $state('');
	thoughts = $state<Record<string, Thought>>({});
	relations = $state<Relation[]>([]);
	/** Whole-graph canvas layout: one position per thought. */
	positions = $state<Record<string, GhostPosition>>({});
	workingSets = $state<WorkingSetInfo[]>([]);
	/** The active working set (lens), or null: the whole graph, no lens. */
	activeWorkingSetId = $state<string | null>(null);
	/** Member thought ids of the active working set (empty when none active). */
	workingSet = $state<string[]>([]);
	pinnedThoughtIds = $state<string[]>([]);
	/** Free-text boxes on the canvas: the default thing you create there. */
	notes = $state<CanvasNote[]>([]);
	scratchNotes = $state<ScratchNote[]>([]);
	pendingChangeSets = $state<ChangeSet[]>([]);
	decidedChangeSets = $state<ChangeSet[]>([]);
	undoLabel = $state<string | null>(null);

	selectedIds = $state<string[]>([]);
	/** Canvas notes in the selection. */
	selectedNoteIds = $state<string[]>([]);
	/** Operation ids of the proposals in the selection. */
	selectedProposalIds = $state<string[]>([]);
	zoom = $state<'overview' | 'reading'>('overview');
	/** What the center pane shows: two projections of the working set, a
	 *  graph-wide browse table, prose, and the agent activity log. View-only,
	 *  never persisted. */
	view = $state<'canvas' | 'outline' | 'browse' | 'prose' | 'log'>('canvas');
	prose = $state<ProseTreatment[]>([]);
	proseGenerating = $state(false);
	proseDrafts = $state<ProseDraftSummary[]>([]);
	proseGroupId = $state('');
	proseStyle = $state<ProseStyle>('overview');
	private proseListRequest = 0;
	private proseRequest = 0;
	private proseLoadRequest = 0;
	/** Preview positions for proposed cards, keyed `${changeSetId}:${ref}`. View-only, not persisted. */
	ghostPositions = $state<Record<string, GhostPosition>>({});
	/** Proposed cards the person dragged themselves. Where they put a card is a
	 *  decision like any other: staging never reflows it, and applying keeps it
	 *  exactly there, opening the map around it instead. */
	private handPlaced = new Set<string>();
	/** Measured geometry belongs to the projection, never the thought. */
	cardSizes = $state<Record<string, { width: number; height: number; zoom: string; fontScale: number }>>({});
	layoutPreview = $state<{ csId: string; existing: Record<string, GhostPosition>; ghosts: Record<string, GhostPosition>; moved: number } | null>(null);
	layoutAnimating = $state(false);
	applying = $state(false);
	private animationTimer: ReturnType<typeof setTimeout> | null = null;
	private animateLayout() {
		this.layoutAnimating = true;
		if (this.animationTimer) clearTimeout(this.animationTimer);
		this.animationTimer = setTimeout(() => this.layoutAnimating = false, 450);
	}
	cancelLayoutPreview() { this.animateLayout(); this.layoutPreview = null; }
	get displayPositions() { return this.layoutPreview?.existing ?? this.positions; }
	get displayGhostPositions() { return this.layoutPreview?.ghosts ?? this.ghostPositions; }
	cardSize(id: string) {
		const measured = this.cardSizes[id];
		if (measured?.zoom === this.zoom && measured.fontScale === appearance.fontScale) return measured;
		// A note's geometry does not follow zoom, so any measurement stands; before
		// one lands, its stored width plus a body-text estimate beats card bounds.
		const note = this.notes.find((n) => n.id === id);
		if (note) {
			if (measured) return measured;
			const width = note.w ?? 240;
			const chars = Math.max(10, Math.floor(width / 8));
			const lines = note.body.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / chars)), 0);
			return { width, height: note.h ?? Math.max(96, 44 + lines * 20) };
		}
		// Off-canvas projections have no DOM measurements. Use conservative text
		// bounds until the canvas reports actual geometry (including font scale).
		const op = this.pendingChangeSets.flatMap(cs => cs.operations.map(op => ({ cs, op }))).find(({ cs, op }) => `${cs.id}:${op.clientRef}` === id)?.op;
		const payload = op && effectivePayload(op);
		const thought = this.thoughts[id] ?? (payload?.op === 'create_thought' ? payload.thought : undefined);
		const factor = appearance.fontScale;
		const charsPerLine = Math.max(10, Math.floor((this.zoom === 'reading' ? 290 : CARD_W) / (13 * factor)));
		const lines = (text: string) => text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
		const height = 90 * factor + lines(thought?.title ?? '') * 17 * factor +
			(this.zoom === 'reading' ? 48 * factor + lines(thought?.statement ?? '') * 18 * factor + (thought?.source ? lines(thought.source) * 17 * factor : 0) : 0);
		return { width: this.zoom === 'reading' ? 313 : 263, height };
	}
	measureCard(id: string, width: number, height: number) {
		const old = this.cardSizes[id];
		if (old?.width === width && old.height === height && old.zoom === this.zoom && old.fontScale === appearance.fontScale) return;
		this.cardSizes[id] = { width, height, zoom: this.zoom, fontScale: appearance.fontScale };
		this.layoutPreview = null;
		this.reconcileGhosts();
	}
	private layoutRects(): LayoutRect[] {
		return [
			...Object.entries(this.positions).map(([id, pos]) => ({ id, ...pos, ...this.cardSize(id) })),
			// Notes are obstacles too: staged cards must not land on top of them.
			...this.notes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...this.cardSize(n.id) }))
		];
	}
	private reconcileGhosts() {
		const taken = this.layoutRects();
		for (const [id, pos] of Object.entries(this.ghostPositions)) {
			const cs = this.pendingChangeSets.find(cs => id.startsWith(`${cs.id}:`));
			const op = cs?.operations.find(op => `${cs.id}:${op.clientRef}` === id);
			if (!op || op.decision === 'rejected') continue;
			// Never re-stage a card the person placed: it stays put and the rest
			// of the staging works around it.
			if (this.handPlaced.has(id)) { taken.push({ id, ...pos, ...this.cardSize(id) }); continue; }
			const size = this.cardSize(id);
			const next = openPosition(taken, size, pos);
			this.ghostPositions[id] = next;
			taken.push({ id, ...next, ...size });
		}
	}
	async previewPlacement(cs: ChangeSet) {
		if (!this.allDecided(cs)) return;
		this.view = 'canvas';
		await tick();
		if (browser) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		const current = this.pendingChangeSets.find(current => current.id === cs.id);
		if (!current || !this.allDecided(current) || this.applying) return;
		this.animateLayout();
		this.layoutPreview = this.planPlacement(current);
		this.view = 'canvas';
	}
	private planPlacement(cs: ChangeSet) {
		const additions: LayoutRect[] = [];
		const links: { from: string; to: string }[] = [];
		/** Accepted cards the person already placed: applying honors those spots.
		 *  A block staged beside its source note is a placement too — it applies
		 *  where it was reviewed instead of reshuffling along relations. */
		const pinned: string[] = [];
		const noteAnchored = !!cs.noteId && this.notes.some((n) => n.id === cs.noteId);
		const resolve = (ref: string) => this.thoughts[ref] ? ref : `${cs.id}:${ref}`;
		for (const op of cs.operations) {
			if (op.decision !== 'accepted') continue;
			const p = effectivePayload(op);
			if (p.op === 'create_thought') {
				const id = resolve(op.clientRef);
				additions.push({ id, ...(this.ghostPositions[id] ?? { x: 80, y: 60 }), ...this.cardSize(id) });
				if (this.handPlaced.has(id) || (noteAnchored && this.ghostPositions[id])) pinned.push(id);
			} else if (p.op === 'add_relation') links.push({ from: resolve(p.from), to: resolve(p.to) });
		}
		const existing = this.layoutRects();
		// Other batches are obstacles too, but only their temporary positions change.
		for (const [id, pos] of Object.entries(this.ghostPositions)) {
			if (!id.startsWith(`${cs.id}:`) && this.pendingChangeSets.some(batch => batch.operations.some(op => `${batch.id}:${op.clientRef}` === id && op.decision !== 'rejected'))) existing.push({ id, ...pos, ...this.cardSize(id) });
		}
		const layout = expandLayout(existing, additions, links, cs.invokedOn, pinned);
		const positions: Record<string, GhostPosition> = {};
		const ghosts = { ...this.ghostPositions };
		let moved = 0;
		for (const [id, pos] of layout) {
			if (this.positions[id]) {
				positions[id] = pos;
				if (Math.hypot(pos.x - this.positions[id].x, pos.y - this.positions[id].y) > .1) moved++;
			} else ghosts[id] = pos;
		}
		return { csId: cs.id, existing: positions, ghosts, moved };
	}
	/** A pending request to create a note by hand. The note is a box on the
	 *  canvas, so the canvas is the one that can open it; this is how the rest
	 *  of the app asks. View-only. */
	composeRequest = $state(false);
	/** Jot a note yourself: show the canvas, and open a text box on it. */
	compose() {
		this.view = 'canvas';
		this.composeRequest = true;
	}
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
			this.desktop = !!data.desktop;
			if (!this.selectionLoaded) {
				this.needsAgentSetup = !!data.needsAgentSetup;
				if (isModelSelection(data.modelSelection)) this.modelSelection = data.modelSelection;
				try {
					const saved = data.desktop ? null : JSON.parse(localStorage.getItem('trellis:model') ?? 'null');
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
		this.layoutPreview = null;
		if (s.activeGraphId !== this.activeGraphId) {
			this.cardSizes = {};
			this.ghostPositions = {};
			this.handPlaced.clear();
			this.proseRequest++;
			this.proseLoadRequest++;
			this.proseGenerating = false;
			this.prose = [];
			this.proseDrafts = [];
			this.proseGroupId = '';
			this.proseStyle = 'overview';
			this.proseListRequest++;
		}
		this.graphs = s.graphs;
		this.activeGraphId = s.activeGraphId;
		this.thoughts = s.thoughts;
		this.relations = s.relations;
		const positions: Record<string, GhostPosition> = {};
		for (const p of s.canvas) positions[p.thoughtId] = { x: p.x, y: p.y };
		this.positions = positions;
		this.workingSets = s.workingSets;
		this.prose = this.prose.filter((draft) => s.workingSets.some((group) => group.id === draft.workingSetId));
		this.proseDrafts = this.proseDrafts.filter((draft) => s.workingSets.some((group) => group.id === draft.workingSetId));
		this.activeWorkingSetId = s.activeWorkingSetId;
		this.workingSet = s.workingSet;
		this.pinnedThoughtIds = s.pinnedThoughtIds;
		// A server round-trip can land while a note is being typed into or
		// dragged; the pending (unflushed) local values win over the older
		// server copy, and the next flush persists them.
		for (const id of this.pendingNoteEdits.keys()) {
			if (!s.notes.some((n) => n.id === id)) this.pendingNoteEdits.delete(id);
		}
		this.notes = s.notes.map((n) => {
			const pending = this.pendingNoteEdits.get(n.id);
			return pending ? { ...n, ...pending } : n;
		});
		this.scratchNotes = s.scratchNotes;
		this.pendingChangeSets = s.pendingChangeSets;
		this.decidedChangeSets = s.decidedChangeSets;
		this.undoLabel = s.undoLabel;
		// Keep the same array when nothing was pruned: a fresh reference reads as a
		// new selection downstream (the inspector opens on it), and every server
		// round-trip lands here — accepting a proposal must not steal the panel.
		const surviving = this.selectedIds.filter((id) => id in s.thoughts);
		if (surviving.length !== this.selectedIds.length) this.selectedIds = surviving;
		const survivingNotes = this.selectedNoteIds.filter((id) => s.notes.some((n) => n.id === id));
		if (survivingNotes.length !== this.selectedNoteIds.length) this.selectedNoteIds = survivingNotes;
		// A ratified or dismissed batch takes its proposals with it.
		if (this.selectedProposalIds.length) {
			const live = new Set(
				s.pendingChangeSets.flatMap((cs) => cs.operations.map((op) => op.id))
			);
			const survivingProposals = this.selectedProposalIds.filter((id) => live.has(id));
			if (survivingProposals.length !== this.selectedProposalIds.length)
				this.selectedProposalIds = survivingProposals;
		}
		for (const cs of s.pendingChangeSets) this.ensureGhosts(cs);
		for (const key of Object.keys(this.ghostPositions)) {
			const csId = key.slice(0, key.indexOf(':'));
			if (!s.pendingChangeSets.some((cs) => cs.id === csId)) {
				delete this.ghostPositions[key];
				this.handPlaced.delete(key);
			}
		}
	}

	async loadProseDrafts(): Promise<string | null> {
		const request = ++this.proseListRequest;
		const graphId = this.activeGraphId;
		const knownIds = new Set(this.proseDrafts.map((draft) => draft.id));
		try {
			const response = await fetch('/api/prose?list=1');
			const data = await response.json();
			if (request !== this.proseListRequest || graphId !== this.activeGraphId) return null;
			if (!response.ok) return data.error ?? 'Could not load saved drafts.';
			if (data.graphId === graphId) {
				// Keep drafts generated while the list was in flight; ids are unique.
				const added = this.proseDrafts.filter((draft) => !knownIds.has(draft.id));
				this.proseDrafts = [...added, ...data.drafts.filter((draft: ProseDraftSummary) =>
					!added.some((item) => item.id === draft.id)
				)].filter((draft) => this.workingSets.some((group) => group.id === draft.workingSetId));
			}
			return null;
		} catch {
			return request === this.proseListRequest && graphId === this.activeGraphId ? 'Could not load saved drafts.' : null;
		}
	}

	async loadProse(workingSetId: string): Promise<string | null> {
		const knownIds = new Set(this.prose.map((draft) => draft.id));
		const request = ++this.proseLoadRequest;
		const graphId = this.activeGraphId;
		try {
			const response = await fetch(`/api/prose?workingSetId=${encodeURIComponent(workingSetId)}`);
			const data = await response.json().catch(() => ({}));
			if (request !== this.proseLoadRequest || graphId !== this.activeGraphId) return null;
			if (!response.ok) return data.error ?? `Could not load prose (${response.status}).`;
			if (data.graphId !== graphId || data.workingSetId !== workingSetId || !this.workingSets.some((group) => group.id === workingSetId)) return null;
			const added = this.prose.filter((draft) => draft.workingSetId === workingSetId && !knownIds.has(draft.id));
			this.prose = [
				...this.prose.filter((item) => item.workingSetId !== workingSetId),
				...added,
				...data.treatments.filter((draft: ProseTreatment) => !added.some((item) => item.id === draft.id))
			];
			return null;
		} catch {
			return request === this.proseLoadRequest && graphId === this.activeGraphId
				? 'Could not load saved prose. Check the server and try again.' : null;
		}
	}

	async generateProse(workingSetId: string, style: ProseStyle, guidance = ''): Promise<string | null> {
		if (this.proseGenerating) return 'A prose draft is already generating.';
		const request = ++this.proseRequest;
		const graphId = this.activeGraphId;
		this.proseGenerating = true;
		try {
			const response = await fetch('/api/prose', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workingSetId, style, guidance, selection: this.modelSelection })
			});
			const data = await response.json().catch(() => ({}));
			if (request !== this.proseRequest || graphId !== this.activeGraphId) return null;
			if (!response.ok) return data.error ?? `Request failed (${response.status}).`;
			if (data.treatment?.graphId === graphId && data.treatment?.workingSetId === workingSetId) {
				// Append: earlier drafts of the same group and style stay available.
				const { id, title, generatedAt } = data.treatment;
				this.proseDrafts = [
					{ id, title, generatedAt, workingSetId, style },
					...this.proseDrafts.filter((item) => item.id !== id)
				];
				this.prose = [...this.prose.filter((item) => item.id !== id), data.treatment];
			}
			return null;
		} catch {
			return request === this.proseRequest && graphId === this.activeGraphId
				? 'Could not reach the Trellis server.' : null;
		} finally {
			if (request === this.proseRequest) this.proseGenerating = false;
		}
	}

	/** Delete one saved draft from the slot's history. */
	async deleteProseDraft(draftId: string): Promise<string | null> {
		try {
			const response = await fetch('/api/prose', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete', draftId })
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) return data.error ?? `Request failed (${response.status}).`;
			this.prose = this.prose.filter((item) => item.id !== draftId);
			this.proseDrafts = this.proseDrafts.filter((item) => item.id !== draftId);
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
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
			if (data.state) {
				if (url.endsWith('/apply') || url === '/api/undo') this.animateLayout();
				this.applyState(data.state);
			}
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
		}
	}

	// --- selection ---
	// One selection spans the canvas. Thoughts, notes and proposals keep separate
	// lists because only thoughts feed the agent operations and groups, but a
	// marquee sweep or a shift-click builds across all three, and the whole thing
	// drags as one block.

	/** Marks in the selection, across all three kinds. */
	get selectionSize(): number {
		return this.selectedIds.length + this.selectedNoteIds.length + this.selectedProposalIds.length;
	}

	/** Add or remove `id` in `list`; replace the list with it when not additive. */
	private toggled(list: string[], id: string, additive: boolean): string[] {
		if (!additive) return [id];
		return list.includes(id) ? list.filter((s) => s !== id) : [...list, id];
	}

	select(id: string, additive = false) {
		if (!additive) {
			this.selectedNoteIds = [];
			this.selectedProposalIds = [];
		}
		this.selectedIds = this.toggled(this.selectedIds, id, additive);
	}

	selectNote(id: string, additive = false) {
		if (!additive) {
			this.selectedIds = [];
			this.selectedProposalIds = [];
		}
		this.selectedNoteIds = this.toggled(this.selectedNoteIds, id, additive);
	}

	/** Replace the selection with `ids` (thoughts), or union them in when additive. */
	selectMany(ids: string[], additive = false) {
		const valid = ids.filter((id) => id in this.thoughts);
		if (!additive) {
			this.selectedNoteIds = [];
			this.selectedProposalIds = [];
		}
		this.selectedIds = additive ? [...new Set([...this.selectedIds, ...valid])] : valid;
	}

	/** Replace the whole canvas selection at once — what a marquee sweep does. */
	selectRegion(region: { thoughts?: string[]; notes?: string[]; proposals?: string[] }) {
		this.selectedIds = [...new Set(region.thoughts ?? [])].filter((id) => id in this.thoughts);
		this.selectedNoteIds = [...new Set(region.notes ?? [])].filter((id) =>
			this.notes.some((n) => n.id === id)
		);
		this.selectedProposalIds = [...new Set(region.proposals ?? [])];
	}

	clearSelection() {
		this.selectedIds = [];
		this.selectedNoteIds = [];
		this.selectedProposalIds = [];
	}

	// --- proposal selection ---
	// A proposal is not a thought, so it gets its own list: picking one on the
	// canvas is how you ask the tray to show you its rationale and evidence.

	/** The single selected proposal — what the tray reveals. Null when a sweep
	 *  took several, since then no one operation is the subject. */
	get selectedProposalId(): string | null {
		return this.selectedProposalIds.length === 1 ? this.selectedProposalIds[0] : null;
	}
	/** Bumped on every reveal so re-picking the same proposal scrolls again. */
	proposalReveal = $state(0);

	/** The other direction: canvas items a panel asked the camera to travel to,
	 *  as canvas ids (thought id, note id, or `${changeSetId}:${clientRef}` for a
	 *  proposed card). Several ids frame all of them — an edge is its endpoints.
	 *  `n` is bumped on every ask, so clicking the same thing twice moves again. */
	canvasReveal = $state<{ ids: string[]; n: number } | null>(null);

	/** Bring the canvas to these items, switching to it from another projection:
	 *  naming a thought in a panel should be enough to go and look at it. */
	revealOnCanvas(...ids: string[]) {
		if (ids.length === 0) return;
		this.view = 'canvas';
		this.canvasReveal = { ids, n: (this.canvasReveal?.n ?? 0) + 1 };
	}

	selectProposal(opId: string, additive = false) {
		if (!additive) {
			this.selectedIds = [];
			this.selectedNoteIds = [];
		}
		this.selectedProposalIds = this.toggled(this.selectedProposalIds, opId, additive);
		this.proposalReveal++;
	}

	// --- canvas (positions update locally, persisted with a debounce) ---

	private pendingMoves = new Map<string, GhostPosition>();
	/** Unflushed note drags, text edits, and resizes — latest full values per note. */
	private pendingNoteEdits = new Map<string, { x: number; y: number; body: string; w?: number; h?: number }>();
	private moveTimer: ReturnType<typeof setTimeout> | null = null;

	private scheduleFlush() {
		if (this.moveTimer) clearTimeout(this.moveTimer);
		this.moveTimer = setTimeout(() => void this.flushMoves(), 400);
	}

	moveCard(thoughtId: string, x: number, y: number) {
		if (!this.positions[thoughtId]) return;
		this.layoutPreview = null;
		this.positions[thoughtId] = { x, y };
		this.pendingMoves.set(thoughtId, { x, y });
		this.scheduleFlush();
	}

	/** Ghost card key (`${changeSetId}:${clientRef}`) behind a proposal operation. */
	private ghostKey(opId: string): string | null {
		for (const cs of this.pendingChangeSets)
			for (const op of cs.operations) if (op.id === opId) return `${cs.id}:${op.clientRef}`;
		return null;
	}

	private itemPosition(kind: CanvasKind, id: string): GhostPosition | null {
		if (kind === 'card') return this.positions[id] ?? null;
		if (kind === 'note') {
			const note = this.notes.find((n) => n.id === id);
			return note ? { x: note.x, y: note.y } : null;
		}
		const key = this.ghostKey(id);
		return key ? (this.ghostPositions[key] ?? null) : null;
	}

	private placeItem(kind: CanvasKind, id: string, x: number, y: number) {
		if (kind === 'card') this.moveCard(id, x, y);
		else if (kind === 'note') this.moveNote(id, x, y);
		else {
			const key = this.ghostKey(id);
			if (key) this.moveGhost(key, x, y);
		}
	}

	/** Everything currently selected, tagged with what kind of item it is. */
	private selectionItems(): { kind: CanvasKind; id: string }[] {
		return [
			...this.selectedIds.map((id) => ({ kind: 'card' as const, id })),
			...this.selectedNoteIds.map((id) => ({ kind: 'note' as const, id })),
			...this.selectedProposalIds.map((id) => ({ kind: 'ghost' as const, id }))
		];
	}

	/**
	 * Drag one canvas item — a thought, a note, or a proposal (by operation id) —
	 * to (x, y). When it is part of a multi-selection the rest of the selection
	 * moves by the same delta, whatever kinds it mixes, so a selection travels as
	 * one block. Dragging something outside the selection moves only it.
	 */
	moveSelection(kind: CanvasKind, anchorId: string, x: number, y: number) {
		const anchor = this.itemPosition(kind, anchorId);
		if (!anchor) return;
		const dx = x - anchor.x;
		const dy = y - anchor.y;
		this.placeItem(kind, anchorId, x, y);
		const items = this.selectionItems();
		if (!items.some((i) => i.kind === kind && i.id === anchorId)) return;
		for (const item of items) {
			if (item.kind === kind && item.id === anchorId) continue;
			const p = this.itemPosition(item.kind, item.id);
			if (p) this.placeItem(item.kind, item.id, p.x + dx, p.y + dy);
		}
	}

	private async flushMoves() {
		if (this.moveTimer) {
			clearTimeout(this.moveTimer);
			this.moveTimer = null;
		}
		if (this.pendingMoves.size === 0 && this.pendingNoteEdits.size === 0) return;
		const items = [...this.pendingMoves.entries()].map(([thoughtId, p]) => ({
			thoughtId,
			...p
		}));
		const notes = [...this.pendingNoteEdits.entries()].map(([id, n]) => ({
			id,
			...n,
			// Explicit nulls: an absent dimension means "back to the default", and
			// JSON would silently drop undefined.
			w: n.w ?? null,
			h: n.h ?? null
		}));
		this.pendingMoves.clear();
		this.pendingNoteEdits.clear();
		try {
			await fetch('/api/canvas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items, notes })
			});
		} catch {
			// Position persistence is best-effort; the next successful save wins.
		}
	}

	// --- canvas notes ---
	// The default thing you create on the canvas: a free-text box. Useful on its
	// own as an annotation beside a thought group, and the raw material for
	// convert-to-thought and decompose.

	async createNote(at: GhostPosition): Promise<{ noteId: string } | { error: string }> {
		await this.flushMoves();
		try {
			const res = await fetch('/api/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'create', body: '', ...at })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return { error: data.error ?? `Request failed (${res.status}).` };
			if (data.state) this.applyState(data.state);
			return { noteId: data.noteId };
		} catch {
			return { error: 'Could not reach the Trellis server.' };
		}
	}

	private touchNote(id: string, patch: Partial<{ x: number; y: number; body: string; w?: number; h?: number }>) {
		const note = this.notes.find((n) => n.id === id);
		if (!note) return;
		Object.assign(note, patch);
		this.pendingNoteEdits.set(id, { x: note.x, y: note.y, body: note.body, w: note.w, h: note.h });
		this.scheduleFlush();
	}

	moveNote(id: string, x: number, y: number) {
		this.layoutPreview = null;
		this.touchNote(id, { x, y });
	}

	/** Set a note's size; undefined returns a dimension to its default. */
	resizeNote(id: string, w: number | undefined, h: number | undefined) {
		this.layoutPreview = null;
		this.touchNote(id, { w, h });
	}

	editNote(id: string, body: string) {
		this.touchNote(id, { body });
	}

	async deleteNote(id: string): Promise<string | null> {
		this.pendingNoteEdits.delete(id);
		return this.post('/api/notes', { action: 'delete', noteId: id });
	}

	/** Graduate a note into a human-authored thought at the note's spot. */
	async convertNote(
		id: string,
		fields: { type: ThoughtType; title: string; statement: string }
	): Promise<string | null> {
		await this.flushMoves();
		try {
			const res = await fetch('/api/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'convert', noteId: id, ...fields, status: 'tentative' })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return data.error ?? `Request failed (${res.status}).`;
			this.pendingNoteEdits.delete(id);
			if (data.state) this.applyState(data.state);
			if (typeof data.thoughtId === 'string') this.selectedIds = [data.thoughtId];
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
		}
	}

	/** Decompose a note's text into proposed thoughts (same path as scratch:
	 *  the text is captured as a scratch note for provenance, and the note
	 *  itself stays on the canvas). */
	async decomposeNote(id: string): Promise<string | null> {
		const note = this.notes.find((n) => n.id === id);
		if (!note) return 'Unknown note.';
		if (!note.body.trim()) return 'Write something in the note first.';
		return this.invoke('decompose', note.body, id);
	}

	// --- working-set membership (Phase 3) ---
	// Working sets are lenses over the whole-graph canvas: membership is
	// transient and binary, never mutates the durable graph or its layout, and
	// applies immediately, not through the proposal tray.

	/** Whether a working set (lens) is active — null means the whole graph. */
	get lensActive(): boolean {
		return this.activeWorkingSetId !== null;
	}

	inWorkingSet(thoughtId: string): boolean {
		return this.workingSet.includes(thoughtId);
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
				if (!collides(x, y)) return { x, y };
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

	/** Add existing thoughts to the working set — membership only; the cards
	 *  stay where they already live on the canvas. */
	async addToSet(thoughtIds: string[]): Promise<string | null> {
		const ids = thoughtIds.filter((id) => id in this.thoughts && !this.inWorkingSet(id));
		if (ids.length === 0) return null;
		return this.post('/api/workingset', { action: 'add', thoughtIds: ids });
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
			this.notice = `Opened ${ids.length} thought${ids.length === 1 ? '' : 's'} in the new group “${name}”.`;
		}
		return err;
	}

	/** Change which lens is active; null returns to the whole-graph base state. */
	async switchSet(workingSetId: string | null): Promise<string | null> {
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
			this.notice = 'Group emptied. Every thought is still on the canvas.';
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

	/** Spawn a new working set holding a thought and its 1-hop neighbors. The
	 *  cards light up where they already live — layout never changes. */
	async openNeighborhood(thoughtId: string): Promise<string | null> {
		const title = this.thoughts[thoughtId]?.title ?? thoughtId;
		const err = await this.post('/api/workingset', { action: 'neighborhood', thoughtId });
		if (!err) {
			this.selectedIds = [thoughtId];
			const n = this.workingSet.length - 1;
			this.notice = `Focused “${title}” and ${n} neighbor${n === 1 ? '' : 's'} in a new group.`;
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

	/** Pull a thought's 1-hop neighbors into the working set. */
	async pullNeighbors(thoughtId: string): Promise<string | null> {
		const ids = this.neighborIds([thoughtId]);
		if (ids.length === 0) {
			return 'No neighbors outside the group.';
		}
		const err = await this.addToSet(ids);
		if (!err)
			this.notice = `Added ${ids.length} neighbor${ids.length === 1 ? '' : 's'} to the group.`;
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
		this.layoutPreview = null;
		if (!this.ghostPositions[key]) return;
		this.ghostPositions[key] = { x, y };
		this.handPlaced.add(key);
	}

	position(thoughtId: string): GhostPosition | undefined {
		return this.positions[thoughtId];
	}

	// --- invoking agent operations ---

	/** The action currently generating a proposal, if any (live calls take seconds). */
	invoking = $state<AgentAction | null>(null);
	/** Drafts are keyed by graph and subject so closing a panel never loses text. */
	conversationDrafts = $state<Record<string, string>>({});
	conversationRequests = $state<Record<string, boolean>>({});
	async proposeFromConversation(conversationId: string): Promise<string | null> {
		if (this.invoking) return 'An operation is already in progress.';
		this.invoking = 'decompose';
		try {
			return await this.post('/api/invoke', { action: 'decompose', selectedIds: [], conversationId, selection: { ...this.modelSelection } });
		} finally { this.invoking = null; }
	}

	async invoke(action: AgentAction, scratchBody?: string, noteId?: string): Promise<string | null> {
		if (this.invoking) return null;
		if (action !== 'decompose' || !scratchBody?.trim()) scratchBody = undefined;
		if (!scratchBody && this.selectedIds.length === 0) {
			return action === 'decompose'
				? 'Decompose a note, or select at least one thought.'
				: `Select at least one thought to ${action}.`;
		}
		this.invoking = action;
		try {
			return await this.post('/api/invoke', {
				action,
				selectedIds: [...this.selectedIds],
				scratchBody,
				noteId: scratchBody ? noteId : undefined,
				selection: { ...this.modelSelection }
			});
		} finally {
			this.invoking = null;
		}
	}

	/** Cards a pending change set will add to the canvas: proposed new thoughts.
	 *  Existing thoughts are always on the whole-graph canvas already — proposed
	 *  relations to them draw straight to the real card. */
	previewRefs(cs: ChangeSet): { ref: string }[] {
		const out: { ref: string }[] = [];
		const seen = new Set<string>();
		for (const op of cs.operations) {
			const p = effectivePayload(op);
			if (p.op === 'create_thought' && !seen.has(op.clientRef)) {
				seen.add(op.clientRef);
				out.push({ ref: op.clientRef });
			}
		}
		return out;
	}

	private ensureGhosts(cs: ChangeSet) {
		const missing = this.previewRefs(cs).filter(
			({ ref }) => !this.ghostPositions[`${cs.id}:${ref}`]
		);
		if (missing.length === 0) return;
		const taken = [...this.layoutRects(), ...Object.entries(this.ghostPositions).map(([id, pos]) => ({ id, ...pos, ...this.cardSize(id) }))];
		const note = cs.noteId ? this.notes.find((n) => n.id === cs.noteId) : undefined;
		if (note) {
			// Decomposed from a note: the proposals stage as one block beside it.
			// When that space is occupied, the note moves together with its block
			// to the nearest open area rather than the block scattering.
			const staged = stageBeside(
				taken.filter((r) => r.id !== note.id),
				{ id: note.id, x: note.x, y: note.y, ...this.cardSize(note.id) },
				missing.map(({ ref }) => ({ id: `${cs.id}:${ref}`, ...this.cardSize(`${cs.id}:${ref}`) }))
			);
			for (const [id, pos] of staged.positions) this.ghostPositions[id] = pos;
			if (staged.anchor.x !== note.x || staged.anchor.y !== note.y)
				this.moveNote(note.id, staged.anchor.x, staged.anchor.y);
			return;
		}
		const anchors = cs.invokedOn.map(id => this.positions[id]).filter(Boolean);
		const near = anchors.length ? { x: anchors[0].x + this.cardSize(cs.invokedOn[0]).width + 64, y: anchors[0].y } : { x: 80, y: 60 };
		for (const { ref } of missing) {
			const id = `${cs.id}:${ref}`, size = this.cardSize(id);
			const pos = openPosition(taken, size, near);
			this.ghostPositions[id] = pos;
			taken.push({ id, ...pos, ...size });
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

	/** Decide every still-pending operation of a change set in one round trip.
	 *  Accepting skips operations blocked by a rejected dependency — they stay
	 *  pending and keep saying why. */
	async decideAll(cs: ChangeSet, decision: 'accepted' | 'rejected'): Promise<string | null> {
		const ops = cs.operations.filter(
			(op) =>
				op.decision === 'pending' &&
				(decision === 'rejected' || this.acceptBlockReason(cs, op) === null)
		);
		if (ops.length === 0) return null;
		return this.post(`/api/changesets/${cs.id}/decide`, {
			opIds: ops.map((op) => op.id),
			decision
		});
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
		if (this.applying) return 'A change set is already being applied.';
		if (!this.allDecided(cs)) return 'Decide every operation before applying.';
		this.applying = true;
		try {
			const plan = this.layoutPreview?.csId === cs.id ? this.layoutPreview : this.planPlacement(cs);
			const positions: Record<string, GhostPosition> = {};
			for (const [key, pos] of Object.entries(plan.ghosts)) {
				if (key.startsWith(`${cs.id}:`)) positions[key.slice(cs.id.length + 1)] = pos;
			}
			const existingPositions = Object.fromEntries(Object.entries(plan.existing).filter(([id, p]) =>
				p.x !== this.positions[id]?.x || p.y !== this.positions[id]?.y));
			const accepted = cs.operations.filter(o => o.decision === 'accepted').length;
			this.animateLayout();
			const err = await this.post(`/api/changesets/${cs.id}/apply`, { positions, existingPositions });
			if (err) return err;
			for (const [id, pos] of Object.entries(plan.ghosts)) {
				if (!id.startsWith(`${cs.id}:`) && this.ghostPositions[id]) this.ghostPositions[id] = pos;
			}
			this.notice = accepted === 0 ? 'Change set rejected — nothing entered the graph.'
				: `Applied ${accepted} operations${plan.moved ? ` · ${plan.moved} existing thoughts moved to make room` : ''}. Undo last apply restores the previous map.`;
			return null;
		} finally { this.applying = false; }
	}

	// --- manual creation (from the composer) ---

	/** Create a human-authored thought directly in the graph; it lands on the
	 *  canvas at `at` — where the inline composer stood — or at a free position
	 *  (joining the active lens, if any), and becomes the selection. */
	async createThought(
		fields: {
			type: ThoughtType;
			status: ThoughtStatus;
			title: string;
			statement: string;
			confidence?: Confidence | null;
			source?: string | null;
		},
		at?: GhostPosition
	): Promise<string | null> {
		const taken: GhostPosition[] = [
			...Object.values(this.positions),
			...Object.values(this.ghostPositions),
			...this.notes.map((n) => ({ x: n.x, y: n.y }))
		];
		const pos = at ?? this.freePosition(taken);
		await this.flushMoves();
		try {
			const res = await fetch('/api/thoughts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...fields, ...pos })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return data.error ?? `Request failed (${res.status}).`;
			if (data.state) this.applyState(data.state);
			if (typeof data.thoughtId === 'string') this.selectedIds = [data.thoughtId];
			return null;
		} catch {
			return 'Could not reach the Trellis server.';
		}
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
		this.animateLayout();
		const err = await this.post('/api/undo');
		if (!err) this.notice = 'Reverted the last applied change set; it is back in the tray.';
		return err;
	}

	dismissReentry() {
		this.showReentry = false;
	}
}

export const workspace = new Workspace();
