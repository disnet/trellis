<script lang="ts">
	import { workspace, CARD_W } from '$lib/workspace.svelte';
	import { effectivePayload } from '$lib/types';
	import ThoughtCard from './ThoughtCard.svelte';

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
		if (item) return { x: item.x + cardW / 2, y: item.y + cardH / 2 };
		if (csId) {
			const g = ws.ghostPositions[`${csId}:${ref}`];
			if (g) return { x: g.x + cardW / 2, y: g.y + cardH / 2 };
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

	interface GhostCard {
		key: string;
		kind: 'proposed' | 'surfaced';
		pos: Pt;
		type: import('$lib/types').ThoughtType;
		status: import('$lib/types').ThoughtStatus;
		title: string;
		statement: string;
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
						statement: t.statement
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
					statement: p.thought.statement
				});
			}
		}
		return out;
	});

	// Edge hints for cards outside the visible scroll window.
	interface OffscreenHint {
		key: string;
		title: string;
		kind: 'card' | 'proposed' | 'surfaced';
		/** Chip position within the viewport. */
		x: number;
		y: number;
		arrow: string;
		/** Card center on the canvas surface, for scroll-into-view. */
		cx: number;
		cy: number;
	}

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(Math.max(v, lo), hi);
	}

	const offscreenHints = $derived.by((): OffscreenHint[] => {
		if (view.w === 0) return [];
		const items = [
			...ws.workingSet.map((item) => ({
				key: item.thoughtId,
				title: ws.thoughts[item.thoughtId]?.title ?? '',
				kind: 'card' as const,
				x: item.x,
				y: item.y
			})),
			...ghosts.map((g) => ({
				key: g.key,
				title: g.title,
				kind: g.kind,
				x: g.pos.x,
				y: g.pos.y
			}))
		];
		const out: OffscreenHint[] = [];
		for (const it of items) {
			const visible =
				it.x + cardW > view.left &&
				it.x < view.left + view.w &&
				it.y + cardH > view.top &&
				it.y < view.top + view.h;
			if (visible) continue;
			const cx = it.x + cardW / 2;
			const cy = it.y + cardH / 2;
			const right = cx > view.left + view.w;
			const left = cx < view.left;
			const below = cy > view.top + view.h;
			const above = cy < view.top;
			const arrow = above
				? left
					? '↖'
					: right
						? '↗'
						: '↑'
				: below
					? left
						? '↙'
						: right
							? '↘'
							: '↓'
					: left
						? '←'
						: '→';
			out.push({
				key: it.key,
				title: it.title,
				kind: it.kind,
				x: clamp(cx - view.left, 80, view.w - 80),
				y: clamp(cy - view.top, 22, view.h - 22),
				arrow,
				cx,
				cy
			});
		}
		return out;
	});

	function scrollToCard(h: OffscreenHint) {
		viewportEl?.scrollTo({
			left: h.cx - view.w / 2,
			top: h.cy - view.h / 2,
			behavior: 'smooth'
		});
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
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="canvas-viewport"
	class:panning
	bind:this={viewportEl}
	onscroll={syncView}
	onpointerdown={startPan}
>
	<div class="canvas-surface">
		<svg class="edges" width="2400" height="1600">
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
						x={mid(e).x - (e.type.length * 3.4 + (e.proposed ? 34 : 8)) / 2}
						y={mid(e).y - 9}
						width={e.type.length * 3.4 + (e.proposed ? 34 : 8)}
						height="16"
						rx="8"
						class="edge-label-bg"
						class:proposed={e.proposed}
					/>
					<text x={mid(e).x} y={mid(e).y + 3} class="edge-label" class:proposed={e.proposed}>
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
					type={t.type}
					status={t.status}
					title={t.title}
					statement={t.statement}
					zoom={ws.zoom}
					selected={ws.selectedIds.includes(t.id)}
					provenance={provenance(t.id)}
					relationSummary={ws.zoom === 'reading' ? relationSummary(t.id) : undefined}
					onmove={(x, y) => ws.moveCard(t.id, x, y)}
					onselect={(additive) => ws.select(t.id, additive)}
				/>
			{/if}
		{/each}

		{#each ghosts as g (g.key)}
			<ThoughtCard
				x={g.pos.x}
				y={g.pos.y}
				width={cardW}
				type={g.type}
				status={g.status}
				title={g.title}
				statement={g.statement}
				zoom={ws.zoom}
				ghost={g.kind}
				provenance="agent"
				onmove={(x, y) => ws.moveGhost(g.key, x, y)}
			/>
		{/each}
	</div>
</div>

{#each offscreenHints as h (h.key)}
	<button
		class="offscreen-hint {h.kind}"
		style="left: {h.x}px; top: {h.y}px;"
		title="Scroll to “{h.title}”"
		onclick={() => scrollToCard(h)}
	>
		<span class="hint-arrow">{h.arrow}</span>
		{#if h.kind === 'proposed'}<span class="hint-mark">◇</span>{/if}
		<span class="hint-title">{h.title}</span>
	</button>
{/each}
</div>

<style>
	.canvas-wrap {
		position: relative;
		height: 100%;
		overflow: hidden;
	}
	.canvas-viewport {
		overflow: auto;
		height: 100%;
		background: #f6f3ec;
		background-image: radial-gradient(circle, #ddd8cc 1px, transparent 1px);
		background-size: 24px 24px;
		cursor: grab;
	}
	.canvas-viewport.panning {
		cursor: grabbing;
		user-select: none;
	}
	.offscreen-hint {
		position: absolute;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 180px;
		border: 1px solid #c9c4b8;
		background: #fffdf8;
		color: #5a523f;
		border-radius: 999px;
		padding: 3px 10px;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(60, 50, 30, 0.18);
		z-index: 20;
	}
	.offscreen-hint:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.offscreen-hint.proposed {
		border: 1.5px dashed #b08a3e;
		background: #fdf8ec;
		color: #7a5c15;
		font-weight: 600;
	}
	.offscreen-hint.surfaced {
		border: 1.5px dotted #6b7f8a;
		background: #f0f4f6;
		color: #4a616f;
	}
	.hint-arrow {
		font-size: 12px;
	}
	.hint-mark {
		font-weight: 700;
	}
	.hint-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.canvas-surface {
		position: relative;
		width: 2400px;
		height: 1600px;
	}
	.edges {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.edge {
		stroke: #a89f8d;
		stroke-width: 1.5;
	}
	.edge.proposed {
		stroke: #b08a3e;
		stroke-dasharray: 5 4;
	}
	.edge-label-bg {
		fill: #efeadf;
		stroke: #cfc8b8;
		stroke-width: 0.5;
	}
	.edge-label-bg.proposed {
		fill: #fbf3de;
		stroke: #c9a860;
	}
	.edge-label {
		font-size: 9px;
		fill: #5a523f;
		text-anchor: middle;
		font-family: inherit;
	}
	.edge-label.proposed {
		fill: #7a5c15;
		font-weight: 600;
	}
</style>
