<script lang="ts">
	import { appearance } from '$lib/appearance.svelte';
	import { dialogs } from '$lib/dialogs.svelte';
	import { workspace, CARD_W, type CanvasKind } from '$lib/workspace.svelte';
	import {
		ACTION_NAMES,
		effectivePayload,
		type ChangeSet,
		type OperationDecision,
		type ProposedOperation
	} from '$lib/types';
	import ThoughtCard from './ThoughtCard.svelte';
	import DraftThought from './DraftThought.svelte';
	import NoteCard from './NoteCard.svelte';
	import RadialFocus from './RadialFocus.svelte';
	import Icon from './Icon.svelte';
	import { tick, untrack } from 'svelte';
	import { layoutCanvas } from '$lib/canvas-layout';
	import { groupColor } from '$lib/group-colors';

	const ws = workspace;
	let focusId = $state<string | null>(null);
	$effect(() => { if (ws.layoutPreview) focusId = null; });
	let focusButton: HTMLButtonElement;
	async function closeFocus() { focusId = null; await tick(); focusButton?.focus(); }
	$effect(() => { ws.activeGraphId; untrack(() => focusId = null); });

	const cardW = $derived(ws.zoom === 'reading' ? 290 : CARD_W);
	const cardH = $derived(ws.zoom === 'reading' ? 190 : 92);

	// Camera for the infinite canvas: a surface point renders at surface * scale + (x, y).
	// Pan is unbounded in every direction; recenter() snaps back to the focus.
	let viewportEl = $state<HTMLDivElement>();
	let cam = $state({ x: 48, y: 136, scale: 1 });
	let vp = $state({ w: 0, h: 0 });
	const MIN_SCALE = 0.25;
	const MAX_SCALE = 2.5;

	// Visible window in surface coordinates.
	const view = $derived({
		left: -cam.x / cam.scale,
		top: -cam.y / cam.scale,
		w: vp.w / cam.scale,
		h: vp.h / cam.scale
	});

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(Math.max(v, lo), hi);
	}

	let sized = false;
	$effect(() => {
		if (!viewportEl) return;
		const el = viewportEl;
		const sync = () => {
			vp = { w: el.clientWidth, h: el.clientHeight };
			// First real measurement: frame the graph rather than the origin.
			if (!sized && vp.w > 0) {
				sized = true;
				recenter();
			}
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Trackpad scroll pans; ctrl/cmd+wheel (and pinch, which browsers report as
	// ctrl+wheel) zooms about the cursor. Needs a non-passive listener to preventDefault.
	$effect(() => {
		if (!viewportEl) return;
		const el = viewportEl;
		function onWheel(e: WheelEvent) {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				// Pinch reports small pixel deltas; a mouse-wheel notch reports ~±100px
				// (or lines). Clamp so one notch is a gentle step, not a 2.7x jump.
				const d = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -24, 24);
				const rect = el.getBoundingClientRect();
				zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-d * 0.01));
			} else {
				cam.x -= e.deltaX;
				cam.y -= e.deltaY;
			}
		}
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	function zoomAt(px: number, py: number, factor: number) {
		const scale = clamp(cam.scale * factor, MIN_SCALE, MAX_SCALE);
		const f = scale / cam.scale;
		cam = { x: px - (px - cam.x) * f, y: py - (py - cam.y) * f, scale };
	}
	function zoomStep(factor: number) {
		glide(() => zoomAt(vp.w / 2, vp.h / 2, factor));
	}

	// Animated camera moves; instant when the user prefers reduced motion.
	let gliding = $state(false);
	let glideTimer: ReturnType<typeof setTimeout>;
	function glide(move: () => void) {
		if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
			gliding = true;
			clearTimeout(glideTimer);
			glideTimer = setTimeout(() => (gliding = false), 380);
		}
		move();
	}

	interface Pt {
		x: number;
		y: number;
	}

	// Center point of any drawable node: a thought's card on the whole-graph
	// canvas, or a ghost preview card.
	function center(csId: string | null, ref: string): Pt | null {
		const pos = ws.displayPositions[ref];
		if (pos) return { x: pos.x + (dimensions[ref]?.width ?? cardW) / 2, y: pos.y + (dimensions[ref]?.height ?? cardH) / 2 };
		if (csId) {
			const g = ws.displayGhostPositions[`${csId}:${ref}`];
			if (g) return { x: g.x + (dimensions[`${csId}:${ref}`]?.width ?? cardW) / 2, y: g.y + (dimensions[`${csId}:${ref}`]?.height ?? cardH) / 2 };
		}
		return null;
	}

	interface Edge {
		id: string;
		a: Pt;
		b: Pt;
		type: string;
		proposed: boolean;
		/** Set on proposed edges: the operation to ratify, and its change set. */
		cs?: ChangeSet;
		op?: ProposedOperation;
		decision?: OperationDecision;
		blocked?: string | null;
	}

	const edges = $derived.by((): Edge[] => {
		const out: Edge[] = [];
		for (const r of ws.relations) {
			if (connections === 'none' || (connections === 'selected' && !ws.selectedIds.includes(r.fromThoughtId) && !ws.selectedIds.includes(r.toThoughtId))) continue;
			const a = center(null, r.fromThoughtId);
			const b = center(null, r.toThoughtId);
			if (a && b) out.push({ id: r.id, a, b, type: r.type, proposed: false });
		}
		for (const cs of ws.pendingChangeSets) {
			for (const op of cs.operations) {
				const p = effectivePayload(op);
				if (p.op !== 'add_relation') continue;
				if (connections === 'none' || (connections === 'selected' && !ws.selectedIds.includes(p.from) && !ws.selectedIds.includes(p.to))) continue;
				const a = center(cs.id, p.from);
				const b = center(cs.id, p.to);
				// A rejected connection stays drawn, quietly: rejecting on the canvas
				// has to be as reversible as rejecting in the tray.
				if (a && b)
					out.push({
						id: op.id,
						a,
						b,
						type: p.relationType,
						proposed: true,
						cs,
						op,
						decision: op.decision,
						blocked: ws.acceptBlockReason(cs, op)
					});
			}
		}
		return out;
	});

	function mid(e: Edge): Pt {
		return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
	}

	// Edge-label pills are sized in JS, so they must follow the same text scale
	// as the --fs-* tokens the labels render at.
	const labelScale = $derived(appearance.fontScale);
	function labelWidth(e: Edge): number {
		return (e.type.length * 6 + 12) * labelScale;
	}

	interface GhostCard {
		key: string;
		kind: 'proposed';
		pos: Pt;
		type: import('$lib/types').ThoughtType;
		status: import('$lib/types').ThoughtStatus;
		title: string;
		statement: string;
		confidence?: import('$lib/types').Confidence;
		source?: string;
		cs: ChangeSet;
		op: ProposedOperation;
		decision: OperationDecision;
		blocked: string | null;
	}

	// Only proposed new thoughts need preview cards — existing thoughts are
	// always on the whole-graph canvas, so proposed relations draw to them
	// directly.
	const ghosts = $derived.by((): GhostCard[] => {
		const out: GhostCard[] = [];
		for (const cs of ws.pendingChangeSets) {
			for (const pr of ws.previewRefs(cs)) {
				const pos = ws.displayGhostPositions[`${cs.id}:${pr.ref}`];
				if (!pos) continue;
				const op = cs.operations.find((o) => o.clientRef === pr.ref);
				if (!op) continue;
				const p = effectivePayload(op);
				if (p.op !== 'create_thought') continue;
				out.push({
					key: `${cs.id}:${pr.ref}`,
					kind: 'proposed',
					pos,
					type: p.thought.type,
					status: p.thought.status,
					title: p.thought.title,
					statement: p.thought.statement,
					confidence: p.thought.confidence,
					source: p.thought.source,
					cs,
					op,
					decision: op.decision,
					blocked: ws.acceptBlockReason(cs, op)
				});
			}
		}
		return out;
	});

	let dimensions = $state<Record<string, { width: number; height: number }>>({});
	function measure(id: string, width: number, height: number) {
		ws.measureCard(id, width, height);
		if (dimensions[id]?.width !== width || dimensions[id]?.height !== height) dimensions[id] = { width, height };
	}
	// Every thought in the graph is on the canvas; an active working set is a
	// lens that highlights its members and dims the rest.
	const cards = $derived(
		Object.values(ws.thoughts)
			.map((t) => ({ t, pos: ws.displayPositions[t.id] }))
			.filter((c): c is { t: (typeof c)['t']; pos: NonNullable<(typeof c)['pos']> } => !!c.pos)
	);
	const items = $derived([
		...cards.map(({ t, pos }) => ({ id: t.id, title: t.title, statement: t.statement, kind: 'card', x: pos.x, y: pos.y })),
		...ws.notes.map(n => ({ id: n.id, title: n.body.split('\n')[0].slice(0, 60) || '(empty note)', statement: n.body, kind: 'note', x: n.x, y: n.y })),
		...ghosts.map(g => ({ id: g.key, title: g.title, statement: g.statement, kind: g.kind, ...g.pos }))
	]);
	let searchEl = $state<HTMLInputElement>();
	let toolbarHeight = $state(48);
	let query = $state('');
	let showIndex = $state(false);
	$effect(() => { if (showIndex) searchEl?.focus(); });
	let connections = $state<'all' | 'selected' | 'none'>('all');

	// Group colors on the base (all-thoughts) canvas. An active lens already
	// shows its group by dimming everything else, so the rings only draw when
	// no lens is on. The toggle persists per browser, view-only.
	let showGroups = $state(true);
	try { showGroups = localStorage.getItem('trellis:show-groups') !== 'off'; } catch { /* Default on. */ }
	function toggleGroups() {
		showGroups = !showGroups;
		try { localStorage.setItem('trellis:show-groups', showGroups ? 'on' : 'off'); } catch { /* View-only preference. */ }
	}
	const groupsByThought = $derived.by(() => {
		const map = new Map<string, { name: string; color: string }[]>();
		ws.workingSets.forEach((set, index) => {
			for (const id of set.members) {
				const list = map.get(id);
				const entry = { name: set.name, color: groupColor(index) };
				if (list) list.push(entry);
				else map.set(id, [entry]);
			}
		});
		return map;
	});
	const groupsVisible = $derived(showGroups && !ws.lensActive && groupsByThought.size > 0);
	const results = $derived(items.filter(i => (i.title + ' ' + i.statement).toLowerCase().includes(query.trim().toLowerCase())));

	// How many cards sit outside the visible window, for the Find button's count.
	const outside = $derived.by((): number => {
		if (vp.w === 0) return 0;
		let n = 0;
		for (const it of items) {
			const w = dimensions[it.id]?.width ?? cardW;
			const h = dimensions[it.id]?.height ?? cardH;
			const visible = it.x + w > view.left && it.x < view.left + view.w &&
				it.y + h > view.top && it.y < view.top + view.h;
			if (!visible) n++;
		}
		return n;
	});

	// Bounding box of the current focus (lens members + ghosts when a lens is
	// active, the whole canvas otherwise), in surface coordinates.
	const bounds = $derived.by(() => {
		const focus = ws.lensActive
			? items.filter((i) => i.kind !== 'card' || ws.inWorkingSet(i.id))
			: items;
		const boxed = focus.length ? focus : items;
		if (!boxed.length) return null;
		let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
		for (const i of boxed) {
			l = Math.min(l, i.x); t = Math.min(t, i.y);
			r = Math.max(r, i.x + (dimensions[i.id]?.width ?? cardW));
			b = Math.max(b, i.y + (dimensions[i.id]?.height ?? cardH));
		}
		return { l, t, r, b };
	});

	/** Snap back to the focus: center it, zooming out just enough to fit. */
	function recenter() {
		glide(() => {
			if (!bounds) { cam = { x: 48, y: 136, scale: 1 }; return; }
			const w = bounds.r - bounds.l;
			const h = bounds.b - bounds.t;
			const scale = clamp(Math.min((vp.w - 96) / w, (vp.h - 300) / h), MIN_SCALE, 1);
			cam = {
				x: vp.w / 2 - (bounds.l + w / 2) * scale,
				y: vp.h / 2 - (bounds.t + h / 2) * scale,
				scale
			};
		});
	}

	let previous = $state<{ id: string; x: number; y: number; kind: string }[] | null>(null);
	// Switching graph or lens keeps the layout (it is the graph's own) and moves
	// the camera instead: glide to fit whatever is now in focus.
	$effect(() => {
		ws.activeGraphId; ws.activeWorkingSetId;
		untrack(() => {
			previous = null; query = ''; showIndex = false;
			if (vp.w === 0) { cam = { x: 48, y: 136, scale: 1 }; return; }
			recenter();
		});
	});
	function locate(item: typeof items[number]) {
		if (item.kind === 'card') ws.select(item.id);
		glide(() => {
			cam.x = vp.w / 2 - (item.x + (dimensions[item.id]?.width ?? cardW) / 2) * cam.scale;
			cam.y = vp.h / 2 - (item.y + (dimensions[item.id]?.height ?? cardH) / 2) * cam.scale;
		});
		showIndex = false;
	}

	/** Zoom a reveal never goes below: arriving at a card you cannot read is not
	 *  arriving. Zooming further in than the person already was is not our call. */
	const LEGIBLE_SCALE = 0.8;

	/** Frame the given canvas items: center them, keeping the current zoom when
	 *  they already fit, pulling back only as far as fitting them needs. */
	function frame(ids: string[]) {
		const found = items.filter((i) => ids.includes(i.id));
		if (found.length === 0 || vp.w === 0) return false;
		let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
		for (const i of found) {
			l = Math.min(l, i.x); t = Math.min(t, i.y);
			r = Math.max(r, i.x + (dimensions[i.id]?.width ?? cardW));
			b = Math.max(b, i.y + (dimensions[i.id]?.height ?? cardH));
		}
		const w = r - l;
		const h = b - t;
		const fit = Math.min((vp.w - 96) / w, (vp.h - 240) / h);
		const scale = clamp(Math.min(Math.max(cam.scale, LEGIBLE_SCALE), fit), MIN_SCALE, MAX_SCALE);
		glide(() => {
			cam = {
				x: vp.w / 2 - (l + w / 2) * scale,
				y: vp.h / 2 - (t + h / 2) * scale,
				scale
			};
		});
		return true;
	}

	// A panel (the proposals tray) can send the camera to what it is talking
	// about. Held until the target is actually placeable — the canvas may have
	// just mounted, or a proposed card may not have a preview position yet.
	let revealed = 0;
	$effect(() => {
		const ask = ws.canvasReveal;
		if (!ask || ask.n === revealed) return;
		if (frame(ask.ids)) revealed = ask.n;
	});
	// The item being dragged while the whole selection travels with it — the rest
	// of the selection borrows its lifted styling.
	let groupDragAnchor = $state<{ kind: CanvasKind; id: string } | null>(null);
	/** True for the rest of a selection travelling behind the dragged item. */
	function travelling(kind: CanvasKind, id: string, selected: boolean): boolean {
		return (
			selected &&
			groupDragAnchor !== null &&
			!(groupDragAnchor.kind === kind && groupDragAnchor.id === id)
		);
	}
	/** Report a drag: only a selected item takes the rest of the selection with it. */
	function dragged(kind: CanvasKind, id: string, selected: boolean, dragging: boolean) {
		groupDragAnchor = dragging && selected ? { kind, id } : null;
	}
	function place(id: string, kind: string, x: number, y: number) {
		if (kind === 'card') ws.moveCard(id, x, y);
		else if (kind === 'note') ws.moveNote(id, x, y);
		else ws.moveGhost(id, x, y);
	}
	async function arrange() {
		if (ws.layoutPreview) return;
		previous = items.map(({ id, x, y, kind }) => ({ id, x, y, kind }));
		const links = ws.relations.map(r => ({ from: r.fromThoughtId, to: r.toThoughtId }));
		for (const cs of ws.pendingChangeSets) for (const op of cs.operations) {
			const p = effectivePayload(op);
			if (p.op !== 'add_relation' || op.decision === 'rejected') continue;
			// An endpoint is a real card unless it is a client_ref of a proposed create.
			const resolve = (ref: string) => (ref in ws.thoughts ? ref : `${cs.id}:${ref}`);
			links.push({ from: resolve(p.from), to: resolve(p.to) });
		}
		const positions = layoutCanvas(items.map(i => ({ id: i.id, ...(dimensions[i.id] ?? { width: cardW, height: cardH }) })), links, view.w);
		for (const item of items) { const p = positions.get(item.id)!; place(item.id, item.kind, p.x, p.y); }
		await tick(); recenter();
	}
	function undoArrange() {
		for (const p of previous ?? []) place(p.id, p.kind, p.x, p.y);
		previous = null;
	}

	function relationSummary(thoughtId: string): string | undefined {
		const rels = ws.relations.filter(
			(r) => r.fromThoughtId === thoughtId || r.toThoughtId === thoughtId
		);
		if (rels.length === 0) return undefined;
		return rels
			.map((r) => {
				const outgoing = r.fromThoughtId === thoughtId;
				const other = ws.thoughts[outgoing ? r.toThoughtId : r.fromThoughtId];
				return `${outgoing ? '→' : '←'} ${r.type.replace('_', ' ')} ${other?.title ?? '?'}`;
			})
			.join(' · ');
	}

	// Pointer model: left-drag on the background draws a selection box (shift
	// keeps the existing selection); right- or middle-drag pans from anywhere.
	// A motionless left press on the background still clears the selection.
	let panning = $state(false);
	/** Active selection box in viewport (screen) coordinates, else null. */
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

	function onCanvasPointerDown(e: PointerEvent) {
		if (!viewportEl) return;
		if (e.button === 2 || e.button === 1) return startPan(e);
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		const isBackground =
			target === viewportEl || target.classList.contains('canvas-surface');
		if (!isBackground || ws.layoutPreview) return;
		// The press preventDefaults, so nothing takes focus away on its own:
		// clicking out of a note has to stop the writing explicitly, or the caret
		// stays in a note that is no longer the subject.
		const active = document.activeElement as HTMLElement | null;
		if (active && active !== document.body && viewportEl.contains(active)) active.blur();
		startMarquee(e);
	}

	function startPan(e: PointerEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		const startCamX = cam.x;
		const startCamY = cam.y;
		let moved = false;
		const el = viewportEl!;
		el.setPointerCapture(e.pointerId);

		function move(ev: PointerEvent) {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
			if (moved) {
				panning = true;
				cam.x = startCamX + dx;
				cam.y = startCamY + dy;
			}
		}
		function up() {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			panning = false;
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	function startMarquee(e: PointerEvent) {
		e.preventDefault();
		const el = viewportEl!;
		const rect = el.getBoundingClientRect();
		const x0 = e.clientX - rect.left;
		const y0 = e.clientY - rect.top;
		const additive = e.shiftKey;
		// Shift extends this selection; a plain drag replaces it.
		const base = {
			thoughts: additive ? [...ws.selectedIds] : [],
			notes: additive ? [...ws.selectedNoteIds] : [],
			proposals: additive ? [...ws.selectedProposalIds] : []
		};
		let moved = false;
		el.setPointerCapture(e.pointerId);

		/** Everything the box touches — thoughts, notes and proposals alike. */
		function hits(box: { x0: number; y0: number; x1: number; y1: number }) {
			// Box corners into surface coordinates, then intersect with item rects.
			const l = (Math.min(box.x0, box.x1) - cam.x) / cam.scale;
			const t = (Math.min(box.y0, box.y1) - cam.y) / cam.scale;
			const r = (Math.max(box.x0, box.x1) - cam.x) / cam.scale;
			const b = (Math.max(box.y0, box.y1) - cam.y) / cam.scale;
			const touches = (x: number, y: number, id: string, fallback: { w: number; h: number }) => {
				const w = dimensions[id]?.width ?? fallback.w;
				const h = dimensions[id]?.height ?? fallback.h;
				return x < r && x + w > l && y < b && y + h > t;
			};
			const card = { w: cardW, h: cardH };
			return {
				thoughts: cards
					.filter(({ t: thought, pos }) => touches(pos.x, pos.y, thought.id, card))
					.map(({ t: thought }) => thought.id),
				notes: ws.notes
					// The note under the composer is not on the canvas to be swept.
					.filter((n) => n.id !== converting && touches(n.x, n.y, n.id, { w: n.w ?? NOTE_W, h: n.h ?? NOTE_H }))
					.map((n) => n.id),
				proposals: ghosts
					.filter((g) => touches(g.pos.x, g.pos.y, g.key, card))
					.map((g) => g.op.id)
			};
		}

		function move(ev: PointerEvent) {
			const x1 = ev.clientX - rect.left;
			const y1 = ev.clientY - rect.top;
			if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 4) moved = true;
			if (!moved) return;
			marquee = { x0, y0, x1, y1 };
			// Selection tracks the box live so the effect of releasing is visible.
			const swept = hits(marquee);
			ws.selectRegion({
				thoughts: [...base.thoughts, ...swept.thoughts],
				notes: [...base.notes, ...swept.notes],
				proposals: [...base.proposals, ...swept.proposals]
			});
		}
		function up() {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			marquee = null;
			if (!moved && !additive) ws.clearSelection();
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	// --- jotting a note in place ---
	// Double-click the background (or press N) and a free-text box lands at the
	// spot you picked: the default thing you create on the canvas. It stays as
	// an annotation, or graduates — converted into a thought (the composer opens
	// over it, type and all) or decomposed into proposals.

	const NOTE_W = 240;
	/** A fresh note's resting height, used to center it on the chosen point. */
	const NOTE_H = 96;
	const DRAFT_W = 290;
	/** In-flight create: one double-click, one note. */
	let creatingNote = $state(false);
	/** The freshly created note that should take the caret. */
	let focusNoteId = $state<string | null>(null);
	let noteFocus = $state(0);
	/** Note the composer is currently converting into a thought, if any. */
	let converting = $state<string | null>(null);
	const convertingNote = $derived(ws.notes.find((n) => n.id === converting) ?? null);
	/** Note whose decompose is generating, so only its button pulses. */
	let decomposingNoteId = $state<string | null>(null);

	function surfacePoint(clientX: number, clientY: number): Pt {
		const rect = viewportEl!.getBoundingClientRect();
		return {
			x: (clientX - rect.left - cam.x) / cam.scale,
			y: (clientY - rect.top - cam.y) / cam.scale
		};
	}

	/** Create a note centered on a surface point, and bring the camera to it. */
	async function startNote(sx: number, sy: number) {
		if (creatingNote || converting || focusId || ws.layoutPreview || ws.applying) return;
		stopPan();
		// Center it, at a legible zoom: a box you type into is only useful if you
		// can read what you are typing.
		glide(() => {
			const scale = Math.max(cam.scale, 1);
			cam = { x: vp.w / 2 - sx * scale, y: vp.h / 2 - sy * scale, scale };
		});
		creatingNote = true;
		const result = await ws.createNote({
			x: Math.round(sx - NOTE_W / 2),
			y: Math.round(sy - NOTE_H / 2)
		});
		creatingNote = false;
		if ('error' in result) {
			ws.notice = result.error;
			return;
		}
		focusNoteId = result.noteId;
		noteFocus++;
	}

	function onCanvasDblClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target !== viewportEl && !target.classList.contains('canvas-surface')) return;
		const p = surfacePoint(e.clientX, e.clientY);
		void startNote(p.x, p.y);
	}

	function noteAtCenter() {
		void startNote((vp.w / 2 - cam.x) / cam.scale, (vp.h / 2 - cam.y) / cam.scale);
	}

	async function removeNote(id: string) {
		const note = ws.notes.find((n) => n.id === id);
		if (!note) return;
		// An empty note goes quietly; written text asks first.
		if (note.body.trim()) {
			const ok = await dialogs.confirm('Delete this note? Its text is not in the graph.', 'Delete note');
			if (!ok) return;
		}
		if (converting === id) converting = null;
		if (focusNoteId === id) focusNoteId = null;
		const err = await ws.deleteNote(id);
		if (err) ws.notice = err;
	}

	async function decomposeNote(id: string) {
		decomposingNoteId = id;
		try {
			const err = await ws.decomposeNote(id);
			if (err) ws.notice = err;
		} finally {
			decomposingNoteId = null;
		}
	}

	async function saveConvert(fields: {
		type: import('$lib/types').ThoughtType;
		title: string;
		statement: string;
	}): Promise<string | null> {
		if (!converting) return null;
		const err = await ws.convertNote(converting, fields);
		if (err) {
			ws.notice = err;
			return err;
		}
		converting = null;
		return null;
	}

	// A conversion belongs to the canvas it was opened on; leaving abandons it
	// (the note itself is safe — it only leaves when the conversion saves).
	$effect(() => {
		ws.activeGraphId;
		untrack(() => (converting = null));
	});
	$effect(() => { if (ws.layoutPreview) converting = null; });

	// The toolbar's New note asks for a text box; answer once the viewport has
	// been measured, so the note can be centered in it.
	$effect(() => {
		if (!ws.composeRequest || vp.w === 0) return;
		untrack(() => noteAtCenter());
		ws.composeRequest = false;
	});

	// WASD pans the camera for as long as the keys are held, at a steady rate in
	// screen space (so a nudge covers the same visible distance at any zoom).
	// Shift doubles it. Each key names the direction the viewpoint travels, so
	// the camera offset moves the opposite way; diagonals are normalised.
	const PAN_KEYS: Record<string, [number, number]> = {
		w: [0, 1],
		a: [1, 0],
		s: [0, -1],
		d: [-1, 0]
	};
	const PAN_SPEED = 900; // px/second
	const held = new Set<string>();
	let heldFast = false;
	let panFrame = 0;
	let panLast = 0;

	function panStep(now: number) {
		// Cap dt so a backgrounded tab does not resume with one enormous jump.
		const dt = Math.min((now - panLast) / 1000, 0.1);
		panLast = now;
		let dx = 0, dy = 0;
		for (const k of held) { dx += PAN_KEYS[k][0]; dy += PAN_KEYS[k][1]; }
		const len = Math.hypot(dx, dy);
		if (len > 0) {
			const step = (PAN_SPEED * (heldFast ? 2 : 1) * dt) / len;
			cam.x += dx * step;
			cam.y += dy * step;
		}
		panFrame = requestAnimationFrame(panStep);
	}

	/** True when the event was a pan key and has been consumed. */
	function panKeydown(e: KeyboardEvent): boolean {
		const k = e.key.toLowerCase();
		if (!(k in PAN_KEYS) || e.metaKey || e.ctrlKey || e.altKey) return false;
		e.preventDefault();
		heldFast = e.shiftKey;
		if (held.has(k)) return true; // key repeat: the loop is already running
		held.add(k);
		if (!panFrame) { panLast = performance.now(); panFrame = requestAnimationFrame(panStep); }
		return true;
	}
	function onKeyup(e: KeyboardEvent) {
		heldFast = e.shiftKey;
		held.delete(e.key.toLowerCase());
		if (!held.size) stopPan();
	}
	function stopPan() {
		held.clear();
		if (panFrame) { cancelAnimationFrame(panFrame); panFrame = 0; }
	}
	// Losing the window or opening the radial focus must not leave a key stuck
	// down; the cleanup also stops the loop when the canvas goes away.
	$effect(() => { if (focusId) stopPan(); return stopPan; });

	// Keyboard: WASD pans; N jots a note; Escape clears the selection;
	// ⌘/Ctrl+A selects the focus (lens members when one is active, the whole
	// canvas otherwise).
	function onKeydown(e: KeyboardEvent) {
		if (focusId) return;
		const t = e.target as HTMLElement;
		const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
		if (!typing && panKeydown(e)) return;
		if (ws.layoutPreview) { if (e.key === 'Escape' && !ws.applying) ws.cancelLayoutPreview(); return; }
		if (typing) return;
		if (e.key === 'Escape' && converting) {
			converting = null;
		} else if (e.key === 'Escape' && ws.selectionSize) {
			ws.clearSelection();
		} else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			noteAtCenter();
		} else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			// Notes and proposals sit outside any group, so a lens narrows only the
			// thoughts.
			const all = cards.map(({ t: thought }) => thought.id);
			ws.selectRegion({
				thoughts: ws.lensActive ? all.filter((id) => ws.inWorkingSet(id)) : all,
				notes: ws.notes.filter((n) => n.id !== converting).map((n) => n.id),
				proposals: ghosts.map((g) => g.op.id)
			});
		}
	}

	// --- group from the current multi-selection ---

	/** "2 thoughts, 1 note" — spelled out only when the selection is mixed. */
	const selectionParts = $derived(
		[
			[ws.selectedIds.length, 'thought'] as const,
			[ws.selectedNoteIds.length, 'note'] as const,
			[ws.selectedProposalIds.length, 'proposal'] as const
		]
			.filter(([n]) => n > 0)
			.map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
			.join(', ')
	);

	async function setFromSelection() {
		const n = ws.selectedIds.length;
		const name = await dialogs.prompt('Name the new group:', `${n} thoughts`, 'Create group');
		if (name === null) return;
		const err = await ws.createSetFrom(name.trim() || `${n} thoughts`, [...ws.selectedIds]);
		if (err) ws.notice = err;
	}

	/** Selected thoughts not already in the active group. */
	const stageable = $derived(ws.selectedIds.filter((id) => !ws.inWorkingSet(id)));
	async function addSelectionToSet() {
		const n = stageable.length;
		const err = await ws.addToSet([...ws.selectedIds]);
		ws.notice = err ?? `Added ${n} thought${n === 1 ? '' : 's'} to the group.`;
	}

	// --- reviewing proposals in place ---
	// The same decisions the tray makes, taken on the canvas: nothing enters the
	// graph until the change set is applied, which is still one deliberate act.

	const reviewLocked = $derived(!!ws.layoutPreview || ws.applying);

	async function decide(cs: ChangeSet, op: ProposedOperation, decision: OperationDecision) {
		const err = await ws.setDecision(cs, op, decision);
		if (err) ws.notice = err;
	}

	async function decideAll(cs: ChangeSet, decision: 'accepted' | 'rejected') {
		const err = await ws.decideAll(cs, decision);
		if (err) ws.notice = err;
	}

	async function applyChangeSet(cs: ChangeSet) {
		const err = await ws.applyChangeSet(cs);
		if (err) ws.notice = err;
	}

	/** A decided batch that adds cards can be previewed before it lands. */
	function previewable(cs: ChangeSet): boolean {
		return (
			ws.allDecided(cs) &&
			cs.operations.some(
				(op) => op.decision === 'accepted' && effectivePayload(op).op === 'create_thought'
			)
		);
	}

	function counts(cs: ChangeSet) {
		let a = 0, r = 0, p = 0;
		for (const op of cs.operations) {
			if (op.decision === 'accepted') a++;
			else if (op.decision === 'rejected') r++;
			else p++;
		}
		return { a, r, p };
	}

	function provenance(thoughtId: string) {
		const t = ws.thoughts[thoughtId];
		return t?.revisions[0]?.actorType === 'agent' && !t.revisions.some((r) => r.actorType === 'human')
			? ('agent' as const)
			: ('human' as const);
	}
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onblur={stopPan} />

<div class="canvas-wrap">
	{#if focusId}
		<RadialFocus initialId={focusId} onclose={closeFocus} />
	{/if}
	<div class="map-view" inert={focusId !== null} class:concealed={focusId !== null}>
	<div class="canvas-tools" bind:clientHeight={toolbarHeight}>
		{#if ws.layoutPreview}
			<span class="preview-note" role="status">Placement preview · {ws.layoutPreview.moved} existing thoughts move</span>
			<button onclick={() => ws.cancelLayoutPreview()} disabled={ws.applying}>Cancel preview</button>
		{/if}
		<button bind:this={focusButton} onclick={() => focusId = ws.selectedIds[0]} disabled={ws.selectedIds.length !== 1 || !!ws.layoutPreview || ws.applying} title="Select one thought to explore its neighbors">Radial focus</button>
		<button onclick={arrange} disabled={!items.length || !!ws.layoutPreview || ws.applying} title="Space connected groups using actual card sizes">Arrange groups</button>
		{#if previous}<button onclick={undoArrange} disabled={!!ws.layoutPreview || ws.applying}>Undo arrangement</button>{/if}
		<label>Connections <select bind:value={connections} aria-label="Visible connections">
			<option value="all">All</option><option value="selected">Selected only</option><option value="none">Hidden</option>
		</select></label>
		{#if !ws.lensActive && ws.workingSets.length > 0}
			<button
				class="groups-toggle"
				class:on={showGroups}
				aria-pressed={showGroups}
				title="Color each thought by the groups it belongs to"
				onclick={toggleGroups}
			>Groups: {showGroups ? 'On' : 'Off'}</button>
		{/if}
		<button class="find" aria-expanded={showIndex} onclick={() => showIndex = !showIndex}>Find on canvas · {items.length}{#if outside} <span>({outside} offscreen)</span>{/if}</button>
	</div>
	{#if showIndex}
		<div class="canvas-index" style="bottom: {toolbarHeight + 88}px; max-height: calc(100% - {toolbarHeight + 180}px);">
			<input bind:this={searchEl} aria-label="Find on canvas" placeholder="Find a title or phrase…" bind:value={query} onkeydown={e => {
				if (e.key === 'Escape') showIndex = false;
				if (e.key === 'Enter' && results.length) locate(results[0]);
			}} />
			<div class="index-results">
				{#each results as item (item.id)}
					<button onclick={() => locate(item)}><span>{item.title}</span><small>{item.kind === 'card' ? 'Thought' : item.kind === 'note' ? '✎ Note' : '◇ Proposed'} →</small></button>
				{:else}<p>{items.length ? 'No matching thoughts.' : 'Jot a note to get started.'}</p>{/each}
			</div>
		</div>
	{/if}
	<div class="top-stack">
		{#each ws.pendingChangeSets as cs (cs.id)}
			{@const c = counts(cs)}
			<div class="review-bar" role="toolbar" aria-label="Proposal review">
				<span class="action">{ACTION_NAMES[cs.action]}</span>
				<span class="review-summary" title={cs.summary}>{cs.summary}</span>
				<span class="tally">{c.a} accepted · {c.r} rejected{c.p > 0 ? ` · ${c.p} to review` : ''}</span>
				<button disabled={c.p === 0 || reviewLocked} onclick={() => decideAll(cs, 'accepted')} title="Accept every remaining proposal in this batch">Accept all</button>
				<button disabled={c.p === 0 || reviewLocked} onclick={() => decideAll(cs, 'rejected')} title="Reject every remaining proposal in this batch">Reject all</button>
				{#if previewable(cs)}
					<button
						disabled={ws.applying}
						title="See where the accepted cards land, and which existing thoughts move — cards you dragged stay where you put them"
						onclick={() => ws.layoutPreview?.csId === cs.id ? ws.cancelLayoutPreview() : ws.previewPlacement(cs)}
					>{ws.layoutPreview?.csId === cs.id ? 'Cancel preview' : 'Preview placement'}</button>
				{/if}
				<button
					class="apply"
					disabled={c.p > 0 || ws.applying}
					title={c.p > 0 ? 'Decide every proposal before applying' : 'Write the accepted proposals into the graph'}
					onclick={() => applyChangeSet(cs)}
				>{c.a === 0 ? 'Dismiss' : c.r === 0 ? 'Apply all' : `Apply ${c.a}`}</button>
			</div>
		{/each}
		{#if ws.selectionSize > 1}
			<div class="selection-bar" role="toolbar" aria-label="Selection actions">
				<span class="selection-count">{ws.selectionSize} selected</span>
				{#if ws.selectedIds.length !== ws.selectionSize}
					<span class="selection-parts">{selectionParts}</span>
				{/if}
				{#if ws.selectedIds.length > 1}
					<button onclick={setFromSelection} title="Open a new group holding the selected thoughts">
						{ws.selectedIds.length === ws.selectionSize
							? 'New group'
							: `New group from ${ws.selectedIds.length} thoughts`}
					</button>
				{/if}
				{#if ws.lensActive && stageable.length > 0}
					<button onclick={addSelectionToSet} title="Add the selected thoughts to the active group">Add {stageable.length} to group</button>
				{/if}
				<button class="quiet" onclick={() => ws.clearSelection()} title="Clear the selection (Esc)">Clear</button>
			</div>
		{/if}
	</div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="canvas-viewport"
	class:panning
	class:selecting={marquee !== null}
	class:gliding
	bind:this={viewportEl}
	onpointerdown={onCanvasPointerDown}
	ondblclick={onCanvasDblClick}
	oncontextmenu={(e) => e.preventDefault()}
	style="background-position: {cam.x}px {cam.y}px; background-size: {24 * cam.scale}px {24 * cam.scale}px;"
>
	<div class="canvas-surface" style="transform: translate({cam.x}px, {cam.y}px) scale({cam.scale});">
		<svg class="edges" width="1" height="1">
			{#each edges as e (e.id)}
				<line
					x1={e.a.x}
					y1={e.a.y}
					x2={e.b.x}
					y2={e.b.y}
					class="edge"
					class:proposed={e.proposed}
					class:accepted={e.decision === 'accepted'}
					class:rejected={e.decision === 'rejected'}
				/>
				<!-- Proposed connections carry an interactive chip instead (below). -->
				{#if !e.proposed}
					<g>
						<rect
							x={mid(e).x - labelWidth(e) / 2}
							y={mid(e).y - 9 * labelScale}
							width={labelWidth(e)}
							height={16 * labelScale}
							rx={8 * labelScale}
							class="edge-label-bg"
						/>
						<text x={mid(e).x} y={mid(e).y + 3 * labelScale} class="edge-label">
							{e.type.replace('_', ' ')}
						</text>
					</g>
				{/if}
			{/each}
		</svg>

		{#each edges as e (e.id)}
			{#if e.proposed && e.cs && e.op}
				{@const m = mid(e)}
				<div
					class="rel-chip decision-{e.decision}"
					class:selected={ws.selectedProposalId === e.op.id}
					style="left: 0; top: 0; transform: translate({m.x}px, {m.y}px) translate(-50%, -50%);"
				>
					<button
						class="rel-type"
						title="Show this connection in the proposals panel"
						onclick={() => ws.selectProposal(e.op!.id)}
					>{e.decision === 'accepted' ? '✓' : e.decision === 'rejected' ? '✕' : '◇'} {e.type.replace('_', ' ')}</button>
					{#if e.decision === 'pending'}
						<button
							class="accept"
							disabled={e.blocked !== null || reviewLocked}
							title={e.blocked ?? 'Accept this connection'}
							aria-label="Accept connection"
							onclick={() => decide(e.cs!, e.op!, 'accepted')}>✓</button
						>
						<button
							class="reject"
							disabled={reviewLocked}
							title="Reject this connection"
							aria-label="Reject connection"
							onclick={() => decide(e.cs!, e.op!, 'rejected')}>✕</button
						>
					{:else}
						<button
							class="undo"
							disabled={reviewLocked}
							title="Return this connection to the review queue"
							onclick={() => decide(e.cs!, e.op!, 'pending')}>Reconsider</button
						>
					{/if}
				</div>
			{/if}
		{/each}

		{#each cards as { t, pos } (t.id)}
			{@const member = ws.inWorkingSet(t.id)}
			<ThoughtCard
				animate={ws.layoutAnimating}
				x={pos.x}
				y={pos.y}
				width={cardW}
				onsize={(w, h) => measure(t.id, w, h)}
				type={t.type}
				status={t.status}
				title={t.title}
				statement={t.statement}
				confidence={t.confidence}
				source={t.source}
				zoom={ws.zoom}
				scale={cam.scale}
				selected={ws.selectedIds.includes(t.id)}
				pinned={ws.isPinned(t.id)}
				dimmed={ws.lensActive && !member}
				groups={groupsVisible ? groupsByThought.get(t.id) : undefined}
				provenance={provenance(t.id)}
				relationSummary={ws.zoom === 'reading' ? relationSummary(t.id) : undefined}
				dragging={travelling('card', t.id, ws.selectedIds.includes(t.id))}
				onmove={ws.layoutPreview || ws.applying ? undefined : (x, y) => ws.moveSelection('card', t.id, x, y)}
				ondragging={(d) => dragged('card', t.id, ws.selectedIds.includes(t.id), d)}
				onselect={(additive) => ws.select(t.id, additive)}
				onremove={ws.lensActive && member
					? async () => {
							const err = await ws.removeFromSet(t.id);
							if (err) ws.notice = err;
						}
					: undefined}
			/>
		{/each}

		{#each ghosts as g (g.key)}
			<ThoughtCard
				animate={ws.layoutAnimating}
				x={g.pos.x}
				y={g.pos.y}
				width={cardW}
				onsize={(w, h) => measure(g.key, w, h)}
				type={g.type}
				status={g.status}
				title={g.title}
				statement={g.statement}
				confidence={g.confidence}
				source={g.source}
				zoom={ws.zoom}
				scale={cam.scale}
				ghost={g.kind}
				selected={ws.selectedProposalIds.includes(g.op.id)}
				onselect={(additive) => ws.selectProposal(g.op.id, additive)}
				decision={g.decision}
				blocked={g.blocked}
				ondecide={(d) => decide(g.cs, g.op, d)}
				reviewBusy={reviewLocked}
				provenance="agent"
				dragging={travelling('ghost', g.op.id, ws.selectedProposalIds.includes(g.op.id))}
				onmove={ws.layoutPreview || ws.applying ? undefined : (x, y) => ws.moveSelection('ghost', g.op.id, x, y)}
				ondragging={(d) => dragged('ghost', g.op.id, ws.selectedProposalIds.includes(g.op.id), d)}
			/>
		{/each}

		{#each ws.notes as note (note.id)}
			{#if note.id !== converting}
				<NoteCard
					x={note.x}
					y={note.y}
					width={note.w ?? NOTE_W}
					height={note.h}
					body={note.body}
					scale={cam.scale}
					animate={ws.layoutAnimating}
					focusSignal={focusNoteId === note.id ? noteFocus : 0}
					busy={decomposingNoteId === note.id && ws.invoking === 'decompose'}
					controlsLocked={ws.invoking !== null || reviewLocked}
					selected={ws.selectedNoteIds.includes(note.id)}
					dragging={travelling('note', note.id, ws.selectedNoteIds.includes(note.id))}
					onsize={(w, h) => measure(note.id, w, h)}
					onchange={(body) => ws.editNote(note.id, body)}
					onselect={(additive) => ws.selectNote(note.id, additive)}
					ondragging={(d) => dragged('note', note.id, ws.selectedNoteIds.includes(note.id), d)}
					onmove={ws.layoutPreview || ws.applying ? undefined : (x, y) => ws.moveSelection('note', note.id, x, y)}
					onresize={ws.layoutPreview || ws.applying ? undefined : (w, h) => ws.resizeNote(note.id, w, h)}
					onconvert={() => (converting = note.id)}
					ondecompose={() => decomposeNote(note.id)}
					ondelete={() => removeNote(note.id)}
				/>
			{/if}
		{/each}

		{#if convertingNote}
			{#key convertingNote.id}
				<DraftThought
					x={convertingNote.x}
					y={convertingNote.y}
					width={DRAFT_W}
					initialStatement={convertingNote.body}
					onsave={saveConvert}
					oncancel={() => (converting = null)}
				/>
			{/key}
		{/if}
	</div>

	{#if marquee}
		<div
			class="marquee"
			style="left: {Math.min(marquee.x0, marquee.x1)}px; top: {Math.min(marquee.y0, marquee.y1)}px; width: {Math.abs(marquee.x1 - marquee.x0)}px; height: {Math.abs(marquee.y1 - marquee.y0)}px;"
		></div>
	{/if}

	{#if items.length === 0 && !creatingNote}
		<div class="canvas-empty">
			<p><strong>Your canvas is empty.</strong></p>
			<p>Double-click anywhere (or press <kbd>N</kbd>) to jot a note — keep it as an annotation, turn it into a thought, or decompose it into proposals. Everything you keep lives here, spatially — groups come later, when you want the agent focused.</p>
		</div>
	{/if}
</div>

<div class="canvas-zoom">
	<button title="Zoom out" aria-label="Zoom out" onclick={() => zoomStep(1 / 1.25)}><Icon name="zoom-out" /></button>
	<button class="zoom-level" title="Reset zoom to 100%" onclick={() => glide(() => zoomAt(vp.w / 2, vp.h / 2, 1 / cam.scale))}>{Math.round(cam.scale * 100)}%</button>
	<button title="Zoom in" aria-label="Zoom in" onclick={() => zoomStep(1.25)}><Icon name="zoom-in" /></button>
	<button title="Center on your thoughts" aria-label="Center on your thoughts" onclick={recenter}><Icon name="recenter" /></button>
</div>

</div>
</div>

<style>
	.map-view { position: absolute; inset: 0; display: flex; flex-direction: column; }
	.map-view.concealed { visibility: hidden; }
	/* Canvas controls sit on one baseline 16px above the dock: the arrange bar
	   centered over it, the zoom cluster in the corner beside it. */
	.canvas-tools { position: absolute; bottom: 80px; left: 0; right: 0; margin-inline: auto; z-index: 21; width: fit-content; max-width: calc(100% - 380px); border-radius: 10px; box-shadow: var(--shadow-menu); display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--paper-raised); border: 1px solid var(--hairline); }
	.canvas-tools button, .canvas-tools select { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
	.canvas-tools button:hover:not(:disabled), .canvas-tools select:hover { border-color: var(--blue); color: var(--blue); }
	.canvas-tools button:disabled { opacity: .45; cursor: not-allowed; }
	.preview-note { font-size: var(--fs-12); color: var(--blue); }
	.canvas-tools .groups-toggle.on { border-color: var(--blue); color: var(--blue-deep); background: var(--blue-wash); }
	.canvas-tools label { display: flex; align-items: center; gap: 8px; font-size: var(--fs-12); color: var(--ink-faded); }
	.canvas-tools .find { margin-left: auto; }
	.find span { color: var(--ink-muted); }
	/* Top-center column: pending batches first, then the selection bar — the two
	   bars that appear in response to what you just did. */
	/* Below the workspace bar, and centered in whatever strip the open panels
	   leave — the same insets the radial focus respects. */
	.top-stack { position: absolute; top: 76px; left: var(--focus-left, 16px); right: var(--focus-right, 16px); margin-inline: auto; z-index: 21; width: fit-content; max-width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
	.top-stack > * { pointer-events: auto; }
	/* Floats top-center when several thoughts are selected: the moment a
	   multi-selection exists, so does the way to make it a working set. */
	.selection-bar { max-width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 10px; box-shadow: var(--shadow-menu); }
	/* Ratifying a batch without leaving the canvas: the tray's footer, in place. */
	.review-bar { max-width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--parchment); border: 1.5px dashed var(--gold-soft); border-radius: 10px; box-shadow: var(--shadow-menu); }
	.review-bar .action { font-size: var(--fs-10); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; color: var(--gold-ink); background: var(--gold-tag); border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
	.review-summary { font-size: var(--fs-12); font-weight: 600; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 44ch; }
	.review-bar .tally { font-size: var(--fs-11); color: var(--ink-muted); white-space: nowrap; }
	.review-bar button { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
	.review-bar button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	.review-bar button:disabled { opacity: .45; cursor: not-allowed; }
	.review-bar button.apply { font-weight: 600; }
	.selection-count { font-size: var(--fs-12); font-weight: 600; color: var(--ink-soft); white-space: nowrap; }
	/* The breakdown of a mixed sweep: quieter than the count it follows. */
	.selection-parts { font-size: var(--fs-12); color: var(--ink-muted); white-space: nowrap; }
	.selection-bar button { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
	.selection-bar button:hover { border-color: var(--blue); color: var(--blue); }
	.selection-bar button.quiet { border-color: transparent; background: transparent; color: var(--ink-muted); }
	.canvas-index { position: absolute; left: 0; right: 0; margin-inline: auto; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 72px); display: flex; flex-direction: column; background: var(--paper-raised); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; box-sizing: border-box; z-index: 20; box-shadow: var(--shadow-menu); }
	.canvas-index input { font: inherit; font-size: var(--fs-13); padding: 6px 8px; border: 1px solid var(--control-border); border-radius: 6px; min-width: 0; background: var(--paper-raised); color: var(--ink); }
	.canvas-index input:focus { outline: 2px solid var(--focus-glow); border-color: var(--blue); }
	.index-results { overflow: auto; margin-top: 8px; }
	.index-results button { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; font: inherit; font-size: var(--fs-13); padding: 12px 8px; border: 0; border-bottom: 1px solid var(--divider); background: transparent; color: var(--ink); cursor: pointer; }
	.index-results button:hover { background: var(--divider); }
	.index-results small, .index-results p { color: var(--ink-muted); font-size: var(--fs-11); }

	.canvas-wrap {
		position: relative;
		height: 100%;
		display: flex; flex-direction: column; min-height: 0;
		overflow: hidden;
	}
	.canvas-viewport {
		position: relative;
		overflow: hidden;
		flex: 1; min-height: 0;
		background: var(--paper);
		background-image: radial-gradient(circle, var(--dot-grid) 1px, transparent 1px);
		background-size: 24px 24px;
		/* Left-drag selects; right-drag pans. */
		cursor: crosshair;
		touch-action: none;
	}
	.canvas-viewport.panning {
		cursor: grabbing;
		user-select: none;
	}
	.canvas-viewport.selecting {
		user-select: none;
	}
	.marquee {
		position: absolute;
		border: 1px dashed var(--blue);
		background: var(--focus-glow);
		pointer-events: none;
		z-index: 15;
	}
	.canvas-viewport.gliding {
		transition: background-position 0.35s ease, background-size 0.35s ease;
	}
	.canvas-viewport.gliding .canvas-surface {
		transition: transform 0.35s ease;
	}
	.canvas-surface {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.edges {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}
	.canvas-empty {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		text-align: center;
		color: var(--ink-quiet);
		font-size: var(--fs-13);
		pointer-events: none;
		padding: 0 24px;
	}
	.canvas-empty p {
		margin: 0;
		max-width: 46ch;
		line-height: 1.5;
	}
	.canvas-empty strong {
		color: var(--ink-muted);
	}
	.canvas-empty kbd {
		font: inherit;
		font-size: var(--fs-11);
		border: 1px solid var(--control-border);
		border-radius: 4px;
		padding: 0 4px;
		background: var(--pill-fill);
	}
	.canvas-zoom {
		position: absolute;
		right: 16px;
		bottom: 80px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px;
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		border-radius: 10px;
		box-shadow: var(--shadow-menu);
		z-index: 25;
	}
	.canvas-zoom button {
		display: flex;
		align-items: center;
		justify-content: center;
		font: inherit;
		font-size: var(--fs-12);
		color: var(--ink-soft);
		background: var(--card-white);
		border: 1px solid var(--card-border);
		border-radius: 6px;
		padding: 5px 8px;
		cursor: pointer;
	}
	.canvas-zoom button:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.canvas-zoom .zoom-level {
		min-width: 46px;
		font-variant-numeric: tabular-nums;
	}
	.edge {
		stroke: var(--edge-ink);
		stroke-width: 1.5;
	}
	.edge.proposed {
		stroke: var(--gold);
		stroke-dasharray: 5 4;
	}
	.edge.proposed.accepted {
		stroke: var(--accept-green);
	}
	.edge.proposed.rejected {
		stroke: var(--edge-ink);
		opacity: 0.35;
	}
	/* Review chip on a proposed connection: the relation label, plus the two
	   decisions, at the midpoint of the edge it belongs to. */
	.rel-chip {
		position: absolute;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 2px 8px;
		background: var(--parchment);
		border: 1px solid var(--gold-soft);
		border-radius: 999px;
		box-shadow: var(--shadow-rest);
		white-space: nowrap;
		z-index: 5;
	}
	.rel-chip.decision-accepted {
		border-color: var(--accept-green);
		background: var(--accept-fill);
	}
	.rel-chip.decision-rejected {
		border-color: var(--control-border);
		background: var(--inset-fill);
		opacity: 0.5;
	}
	.rel-chip.decision-rejected:hover,
	.rel-chip.decision-rejected.selected {
		opacity: 1;
	}
	/* The label doubles as the way to open this connection in the tray. */
	.rel-type {
		font: inherit;
		font-size: var(--fs-9);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--gold-deep);
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
	}
	.rel-type:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.rel-chip.selected {
		border-color: var(--blue);
		box-shadow: var(--ring-selection);
	}
	.decision-accepted .rel-type { color: var(--moss-ink); }
	.decision-rejected .rel-type { color: var(--ink-muted); text-decoration: line-through; }
	.rel-chip button {
		font: inherit;
		font-size: var(--fs-10);
		font-weight: 700;
		line-height: 1;
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 999px;
		padding: 3px 6px;
		cursor: pointer;
	}
	.rel-chip button:disabled { opacity: .45; cursor: not-allowed; }
	.rel-chip .accept { border-color: var(--accept-green); color: var(--moss-ink); }
	.rel-chip .accept:hover:not(:disabled) { background: var(--accept-fill); }
	.rel-chip .reject { color: var(--clay-ink); }
	.rel-chip .reject:hover:not(:disabled) { border-color: var(--rust); color: var(--rust); }
	.rel-chip .undo { font-weight: 600; text-transform: none; }
	.rel-chip .undo:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	.edge-label-bg {
		fill: var(--divider);
		stroke: var(--construction);
		stroke-width: 0.5;
	}
	.edge-label {
		font-size: var(--fs-9);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		fill: var(--ink-faded);
		text-anchor: middle;
		font-family: inherit;
	}
	/* The workspace bar wraps to two rows in narrow windows; the stack clears it. */
	@media (max-width: 1000px) {
		.top-stack { top: 120px; }
	}
	@media (max-width: 600px) {
		.canvas-tools { bottom: 160px; left: 16px; right: 16px; max-width: calc(100% - 32px); }
		.canvas-zoom { bottom: 108px; }
		.canvas-index { bottom: 256px !important; max-height: calc(100% - 380px) !important; }
	}
</style>
