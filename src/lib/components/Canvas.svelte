<script lang="ts">
	import { appearance } from '$lib/appearance.svelte';
	import { workspace, CARD_W } from '$lib/workspace.svelte';
	import { effectivePayload } from '$lib/types';
	import ThoughtCard from './ThoughtCard.svelte';
	import { tick, untrack } from 'svelte';
	import { layoutCanvas } from '$lib/canvas-layout';

	const ws = workspace;

	const cardW = $derived(ws.zoom === 'reading' ? 290 : CARD_W);
	const cardH = $derived(ws.zoom === 'reading' ? 190 : 92);

	// Visible scroll window of the canvas, for off-screen card hints.
	let viewportEl = $state<HTMLDivElement>();
	let view = $state({ left: 0, top: 0, w: 0, h: 0 });

	function syncView() {
		if (!viewportEl) return;
		view = {
			left: viewportEl.scrollLeft,
			top: viewportEl.scrollTop,
			w: viewportEl.clientWidth,
			h: viewportEl.clientHeight
		};
	}

	$effect(() => {
		if (!viewportEl) return;
		syncView();
		const ro = new ResizeObserver(syncView);
		ro.observe(viewportEl);
		return () => ro.disconnect();
	});

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
	const surfaceW = $derived(Math.max(view.w, ...items.map(i => i.x + (dimensions[i.id]?.width ?? cardW) + 96)));
	const surfaceH = $derived(Math.max(view.h, ...items.map(i => i.y + (dimensions[i.id]?.height ?? cardH) + 96)));
	let searchEl = $state<HTMLInputElement>();
	let toolbarHeight = $state(48);
	let query = $state('');
	let showIndex = $state(false);
	$effect(() => { if (showIndex) searchEl?.focus(); });
	let connections = $state<'all' | 'selected' | 'none'>('all');
	const results = $derived(items.filter(i => (i.title + ' ' + i.statement).toLowerCase().includes(query.trim().toLowerCase())));
	const outside = $derived(items.filter(i => i.x + (dimensions[i.id]?.width ?? cardW) <= view.left || i.x >= view.left + view.w ||
		i.y + (dimensions[i.id]?.height ?? cardH) <= view.top || i.y >= view.top + view.h).length);
	let previous = $state<{ id: string; x: number; y: number; kind: string }[] | null>(null);
	$effect(() => {
		ws.activeGraphId; ws.activeWorkingSetId;
		untrack(() => { previous = null; query = ''; showIndex = false; viewportEl?.scrollTo(0, 0); });
	});
	function locate(item: typeof items[number]) {
		if (item.kind === 'card') ws.select(item.id);
		viewportEl?.scrollTo({ left: Math.max(0, item.x + (dimensions[item.id]?.width ?? cardW) / 2 - view.w / 2),
			top: Math.max(0, item.y + (dimensions[item.id]?.height ?? cardH) / 2 - view.h / 2),
			behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
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
		await tick(); viewportEl?.scrollTo(0, 0);
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
		const startLeft = viewportEl.scrollLeft;
		const startTop = viewportEl.scrollTop;
		let moved = false;
		const el = viewportEl;
		el.setPointerCapture(e.pointerId);

		function move(ev: PointerEvent) {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
			if (moved) {
				panning = true;
				el.scrollTo({ left: startLeft - dx, top: startTop - dy });
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
	bind:this={viewportEl}
	onscroll={syncView}
	onpointerdown={startPan}
>
	<div class="canvas-surface" style="width: {surfaceW}px; height: {surfaceH}px;">
		<svg class="edges" width={surfaceW} height={surfaceH}>
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
		overflow: auto;
		flex: 1; min-height: 0;
		background: var(--paper);
		background-image: radial-gradient(circle, var(--dot-grid) 1px, transparent 1px);
		background-size: 24px 24px;
		cursor: grab;
	}
	.canvas-viewport.panning {
		cursor: grabbing;
		user-select: none;
	}
	.canvas-surface {
		position: relative;

	}
	.edges {
		position: absolute;
		inset: 0;
		pointer-events: none;
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
