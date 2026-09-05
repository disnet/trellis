<script lang="ts">
	import { appearance } from '$lib/appearance.svelte';
	import { workspace, CARD_W } from '$lib/workspace.svelte';
	import { effectivePayload } from '$lib/types';
	import ThoughtCard from './ThoughtCard.svelte';
	import Icon from './Icon.svelte';
	import { tick, untrack } from 'svelte';
	import { layoutCanvas } from '$lib/canvas-layout';

	const ws = workspace;

	const cardW = $derived(ws.zoom === 'reading' ? 290 : CARD_W);
	const cardH = $derived(ws.zoom === 'reading' ? 190 : 92);

	// Camera for the infinite canvas: a surface point renders at surface * scale + (x, y).
	// Pan is unbounded in every direction; recenter() snaps back to the working set.
	let viewportEl = $state<HTMLDivElement>();
	let cam = $state({ x: 0, y: 0, scale: 1 });
	let vp = $state({ w: 0, h: 0 });
	const MIN_SCALE = 0.25;
	const MAX_SCALE = 2.5;

	// Visible window in surface coordinates, for off-screen card hints.
	const view = $derived({
		left: -cam.x / cam.scale,
		top: -cam.y / cam.scale,
		w: vp.w / cam.scale,
		h: vp.h / cam.scale
	});

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(Math.max(v, lo), hi);
	}

	$effect(() => {
		if (!viewportEl) return;
		const el = viewportEl;
		const sync = () => (vp = { w: el.clientWidth, h: el.clientHeight });
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

	// Center point of any drawable node: working-set card or ghost preview card.
	function center(csId: string | null, ref: string): Pt | null {
		const item = ws.workingSet.find((w) => w.thoughtId === ref);
		if (item) return { x: item.x + (dimensions[ref]?.width ?? cardW) / 2, y: item.y + (dimensions[ref]?.height ?? cardH) / 2 };
		if (csId) {
			const g = ws.ghostPositions[`${csId}:${ref}`];
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
			// An endpoint that is a rejected create op has no visible card; skip its edges.
			const hiddenRefs = new Set(
				cs.operations
					.filter((o) => o.decision === 'rejected' && effectivePayload(o).op === 'create_thought')
					.map((o) => o.clientRef)
			);
			for (const op of cs.operations) {
				const p = effectivePayload(op);
				if (p.op !== 'add_relation' || op.decision === 'rejected') continue;
				if (connections === 'none' || (connections === 'selected' && !ws.selectedIds.includes(p.from) && !ws.selectedIds.includes(p.to))) continue;
				if (hiddenRefs.has(p.from) || hiddenRefs.has(p.to)) continue;
				const a = center(cs.id, p.from);
				const b = center(cs.id, p.to);
				if (a && b)
					out.push({ id: op.id, a, b, type: p.relationType, proposed: true });
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
		return (e.type.length * 6 + (e.proposed ? 26 : 12)) * labelScale;
	}

	interface GhostCard {
		key: string;
		kind: 'proposed' | 'surfaced';
		pos: Pt;
		type: import('$lib/types').ThoughtType;
		status: import('$lib/types').ThoughtStatus;
		title: string;
		statement: string;
		confidence?: import('$lib/types').Confidence;
		source?: string;
	}

	const ghosts = $derived.by((): GhostCard[] => {
		const out: GhostCard[] = [];
		for (const cs of ws.pendingChangeSets) {
			for (const pr of ws.previewRefs(cs)) {
				const pos = ws.ghostPositions[`${cs.id}:${pr.ref}`];
				if (!pos) continue;
				if (pr.existingId) {
					const t = ws.thoughts[pr.existingId];
					out.push({
						key: `${cs.id}:${pr.ref}`,
						kind: 'surfaced',
						pos,
						type: t.type,
						status: t.status,
						title: t.title,
						statement: t.statement,
						confidence: t.confidence,
						source: t.source
					});
					continue;
				}
				const op = cs.operations.find((o) => o.clientRef === pr.ref);
				if (!op || op.decision === 'rejected') continue;
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
					source: p.thought.source
				});
			}
		}
		return out;
	});

	let dimensions = $state<Record<string, { width: number; height: number }>>({});
	function measure(id: string, width: number, height: number) {
		if (dimensions[id]?.width !== width || dimensions[id]?.height !== height) dimensions[id] = { width, height };
	}
	const items = $derived([
		...ws.workingSet.map(w => ({ id: w.thoughtId, title: ws.thoughts[w.thoughtId]?.title ?? '',
			statement: ws.thoughts[w.thoughtId]?.statement ?? '', kind: 'card', x: w.x, y: w.y })),
		...ghosts.map(g => ({ id: g.key, title: g.title, statement: g.statement, kind: g.kind, ...g.pos }))
	]);
	let searchEl = $state<HTMLInputElement>();
	let toolbarHeight = $state(48);
	let query = $state('');
	let showIndex = $state(false);
	$effect(() => { if (showIndex) searchEl?.focus(); });
	let connections = $state<'all' | 'selected' | 'none'>('all');
	const results = $derived(items.filter(i => (i.title + ' ' + i.statement).toLowerCase().includes(query.trim().toLowerCase())));

	// Edge markers for cards outside the visible window, pinned to the nearest edge.
	interface OffscreenHint {
		item: (typeof items)[number];
		arrow: string;
		/** Chip position in viewport (screen) coordinates. */
		x: number;
		y: number;
	}
	const offscreenHints = $derived.by((): OffscreenHint[] => {
		if (vp.w === 0) return [];
		const out: OffscreenHint[] = [];
		for (const it of items) {
			const w = dimensions[it.id]?.width ?? cardW;
			const h = dimensions[it.id]?.height ?? cardH;
			const visible = it.x + w > view.left && it.x < view.left + view.w &&
				it.y + h > view.top && it.y < view.top + view.h;
			if (visible) continue;
			const cx = it.x + w / 2;
			const cy = it.y + h / 2;
			const right = cx > view.left + view.w;
			const left = cx < view.left;
			const below = cy > view.top + view.h;
			const above = cy < view.top;
			const arrow = above ? (left ? '↖' : right ? '↗' : '↑')
				: below ? (left ? '↙' : right ? '↘' : '↓')
				: left ? '←' : '→';
			out.push({
				item: it,
				arrow,
				x: clamp(cx * cam.scale + cam.x, 80, vp.w - 80),
				y: clamp(cy * cam.scale + cam.y, 22, vp.h - 22)
			});
		}
		return out;
	});
	const outside = $derived(offscreenHints.length);

	// Bounding box of everything on the canvas, in surface coordinates.
	const bounds = $derived.by(() => {
		if (!items.length) return null;
		let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
		for (const i of items) {
			l = Math.min(l, i.x); t = Math.min(t, i.y);
			r = Math.max(r, i.x + (dimensions[i.id]?.width ?? cardW));
			b = Math.max(b, i.y + (dimensions[i.id]?.height ?? cardH));
		}
		return { l, t, r, b };
	});

	/** Snap back to the working set: center it, zooming out just enough to fit. */
	function recenter() {
		glide(() => {
			if (!bounds) { cam = { x: 0, y: 0, scale: 1 }; return; }
			const w = bounds.r - bounds.l;
			const h = bounds.b - bounds.t;
			const scale = clamp(Math.min((vp.w - 96) / w, (vp.h - 96) / h), MIN_SCALE, 1);
			cam = {
				x: vp.w / 2 - (bounds.l + w / 2) * scale,
				y: vp.h / 2 - (bounds.t + h / 2) * scale,
				scale
			};
		});
	}

	let previous = $state<{ id: string; x: number; y: number; kind: string }[] | null>(null);
	$effect(() => {
		ws.activeGraphId; ws.activeWorkingSetId;
		untrack(() => { previous = null; query = ''; showIndex = false; cam = { x: 0, y: 0, scale: 1 }; });
	});
	function locate(item: typeof items[number]) {
		if (item.kind === 'card') ws.select(item.id);
		glide(() => {
			cam.x = vp.w / 2 - (item.x + (dimensions[item.id]?.width ?? cardW) / 2) * cam.scale;
			cam.y = vp.h / 2 - (item.y + (dimensions[item.id]?.height ?? cardH) / 2) * cam.scale;
		});
		showIndex = false;
	}
	function place(id: string, kind: string, x: number, y: number) {
		if (kind === 'card') ws.moveCard(id, x, y); else ws.moveGhost(id, x, y);
	}
	async function arrange() {
		previous = items.map(({ id, x, y, kind }) => ({ id, x, y, kind }));
		const links = ws.relations.map(r => ({ from: r.fromThoughtId, to: r.toThoughtId }));
		for (const cs of ws.pendingChangeSets) for (const op of cs.operations) {
			const p = effectivePayload(op);
			if (p.op !== 'add_relation' || op.decision === 'rejected') continue;
			const resolve = (ref: string) => ws.inWorkingSet(ref) ? ref : `${cs.id}:${ref}`;
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

	// Drag the background to pan; a motionless press still clears the selection.
	let panning = $state(false);

	function startPan(e: PointerEvent) {
		if (e.button !== 0 || !viewportEl) return;
		const target = e.target as HTMLElement;
		const isBackground =
			target === viewportEl || target.classList.contains('canvas-surface');
		if (!isBackground) return;
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		const startCamX = cam.x;
		const startCamY = cam.y;
		let moved = false;
		const el = viewportEl;
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
			if (!moved) ws.clearSelection();
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	function provenance(thoughtId: string) {
		const t = ws.thoughts[thoughtId];
		return t?.revisions[0]?.actorType === 'agent' && !t.revisions.some((r) => r.actorType === 'human')
			? ('agent' as const)
			: ('human' as const);
	}
</script>

<div class="canvas-wrap">
	<div class="canvas-tools" bind:clientHeight={toolbarHeight}>
		<button onclick={arrange} disabled={!items.length} title="Space connected groups using actual card sizes">Arrange groups</button>
		{#if previous}<button onclick={undoArrange}>Undo arrangement</button>{/if}
		<label>Connections <select bind:value={connections} aria-label="Visible connections">
			<option value="all">All</option><option value="selected">Selected only</option><option value="none">Hidden</option>
		</select></label>
		<button class="find" aria-expanded={showIndex} onclick={() => showIndex = !showIndex}>Find on canvas · {items.length}{#if outside} <span>({outside} offscreen)</span>{/if}</button>
	</div>
	{#if showIndex}
		<div class="canvas-index" style="top: {toolbarHeight + 8}px; max-height: calc(100% - {toolbarHeight + 24}px);">
			<input bind:this={searchEl} aria-label="Find on canvas" placeholder="Find a title or phrase…" bind:value={query} onkeydown={e => {
				if (e.key === 'Escape') showIndex = false;
				if (e.key === 'Enter' && results.length) locate(results[0]);
			}} />
			<div class="index-results">
				{#each results as item (item.id)}
					<button onclick={() => locate(item)}><span>{item.title}</span><small>{item.kind === 'card' ? 'Thought' : item.kind === 'proposed' ? '◇ Proposed' : 'Existing preview'} →</small></button>
				{:else}<p>{items.length ? 'No matching thoughts.' : 'Add thoughts from the library or scratch to get started.'}</p>{/each}
			</div>
		</div>
	{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="canvas-viewport"
	class:panning
	class:gliding
	bind:this={viewportEl}
	onpointerdown={startPan}
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
				/>
				<g>
					<rect
						x={mid(e).x - labelWidth(e) / 2}
						y={mid(e).y - 9 * labelScale}
						width={labelWidth(e)}
						height={16 * labelScale}
						rx={8 * labelScale}
						class="edge-label-bg"
						class:proposed={e.proposed}
					/>
					<text x={mid(e).x} y={mid(e).y + 3 * labelScale} class="edge-label" class:proposed={e.proposed}>
						{e.type.replace('_', ' ')}{e.proposed ? ' ◇' : ''}
					</text>
				</g>
			{/each}
		</svg>

		{#each ws.workingSet as item (item.thoughtId)}
			{@const t = ws.thoughts[item.thoughtId]}
			{#if t}
				<ThoughtCard
					x={item.x}
					y={item.y}
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
					provenance={provenance(t.id)}
					relationSummary={ws.zoom === 'reading' ? relationSummary(t.id) : undefined}
					onmove={(x, y) => ws.moveCard(t.id, x, y)}
					onselect={(additive) => ws.select(t.id, additive)}
					onremove={async () => {
						const err = await ws.removeFromSet(t.id);
						if (err) ws.notice = err;
					}}
				/>
			{/if}
		{/each}

		{#each ghosts as g (g.key)}
			<ThoughtCard
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
				provenance="agent"
				onmove={(x, y) => ws.moveGhost(g.key, x, y)}
				onadd={g.kind === 'surfaced'
					? async () => {
							const id = g.key.slice(g.key.indexOf(':') + 1);
							const err = await ws.addToSetAt(id, g.pos);
							if (err) ws.notice = err;
						}
					: undefined}
			/>
		{/each}
	</div>

	{#each offscreenHints as h (h.item.id)}
		<button
			class="offscreen-hint {h.item.kind}"
			style="left: {h.x}px; top: {h.y}px;"
			title="Go to “{h.item.title}”"
			onclick={() => locate(h.item)}
		>
			<span class="hint-arrow">{h.arrow}</span>
			{#if h.item.kind === 'proposed'}<span class="hint-mark">◇</span>{/if}
			<span class="hint-title">{h.item.title}</span>
		</button>
	{/each}
</div>

<div class="canvas-zoom">
	<button title="Zoom out" aria-label="Zoom out" onclick={() => zoomStep(1 / 1.25)}><Icon name="zoom-out" /></button>
	<button class="zoom-level" title="Reset zoom to 100%" onclick={() => glide(() => zoomAt(vp.w / 2, vp.h / 2, 1 / cam.scale))}>{Math.round(cam.scale * 100)}%</button>
	<button title="Zoom in" aria-label="Zoom in" onclick={() => zoomStep(1.25)}><Icon name="zoom-in" /></button>
	<button title="Center on your thoughts" aria-label="Center on your thoughts" onclick={recenter}><Icon name="recenter" /></button>
</div>

</div>

<style>
	.canvas-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--paper); border-bottom: 1px solid var(--hairline); }
	.canvas-tools button, .canvas-tools select { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
	.canvas-tools button:hover:not(:disabled), .canvas-tools select:hover { border-color: var(--blue); color: var(--blue); }
	.canvas-tools button:disabled { opacity: .45; cursor: not-allowed; }
	.canvas-tools label { display: flex; align-items: center; gap: 8px; font-size: var(--fs-12); color: var(--ink-faded); }
	.canvas-tools .find { margin-left: auto; }
	.find span { color: var(--ink-muted); }
	.canvas-index { position: absolute; top: 56px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 72px); display: flex; flex-direction: column; background: var(--paper-raised); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; box-sizing: border-box; z-index: 20; box-shadow: var(--shadow-menu); }
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
		cursor: grab;
		touch-action: none;
	}
	.canvas-viewport.panning {
		cursor: grabbing;
		user-select: none;
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
	.offscreen-hint {
		position: absolute;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 180px;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 999px;
		padding: 3px 10px;
		font: inherit;
		font-size: var(--fs-11);
		cursor: pointer;
		box-shadow: var(--shadow-menu);
		z-index: 20;
	}
	.offscreen-hint:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.offscreen-hint.proposed {
		border: 1.5px dashed var(--gold);
		background: var(--parchment);
		color: var(--gold-ink);
		font-weight: 600;
	}
	.offscreen-hint.surfaced {
		border: 1.5px dotted var(--surfaced-slate);
		background: var(--surfaced-fill);
		color: var(--slate-ink);
	}
	.hint-arrow {
		font-size: var(--fs-12);
	}
	.hint-mark {
		font-weight: 700;
	}
	.hint-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.canvas-zoom {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		gap: 4px;
		/* Above the offscreen-hint chips, which clamp into the same corner. */
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
		box-shadow: var(--shadow-rest);
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
	.edge-label-bg {
		fill: var(--divider);
		stroke: var(--construction);
		stroke-width: 0.5;
	}
	.edge-label-bg.proposed {
		fill: var(--parchment);
		stroke: var(--gold-soft);
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
	.edge-label.proposed {
		fill: var(--gold-deep);
	}
</style>
