<script lang="ts">
	import { formatConfidence, type ActorType, type Confidence, type ThoughtStatus, type ThoughtType } from '$lib/types';
	import Icon from './Icon.svelte';

	interface Props {
		x: number;
		y: number;
		width: number;
		type: ThoughtType;
		status: ThoughtStatus;
		title: string;
		statement: string;
		/** Predictions only. */
		confidence?: Confidence;
		/** Evidence only. */
		source?: string;
		zoom: 'overview' | 'reading';
		selected?: boolean;
		/** Marked as a per-graph landmark (Phase 6). */
		pinned?: boolean;
		/** 'proposed' = new content awaiting ratification; 'surfaced' = existing thought previewed on canvas by a pending relation. */
		ghost?: 'proposed' | 'surfaced' | null;
		provenance: ActorType;
		relationSummary?: string;
		onmove?: (x: number, y: number) => void;
		onsize?: (width: number, height: number) => void;
		onselect?: (additive: boolean) => void;
		/** Remove from the working set (shown on selected cards; the graph is untouched). */
		onremove?: () => void;
		/** Add a surfaced existing thought to the working set — a direct action, no ratification. */
		onadd?: () => void;
	}

	let {
		x,
		y,
		width,
		type,
		status,
		title,
		statement,
		confidence,
		source,
		zoom,
		selected = false,
		pinned = false,
		ghost = null,
		provenance,
		relationSummary,
		onmove,
		onsize,
		onselect,
		onremove,
		onadd
	}: Props = $props();

	let dragging = $state(false);
	let cardEl = $state<HTMLDivElement>();
	$effect(() => {
		if (!cardEl || !onsize) return;
		const el = cardEl;
		const report = onsize;
		const observer = new ResizeObserver(() => report(el.offsetWidth, el.offsetHeight));
		observer.observe(el);
		return () => observer.disconnect();
	});

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.stopPropagation();
		const startX = e.clientX;
		const startY = e.clientY;
		const origX = x;
		const origY = y;
		let moved = false;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);

		function move(ev: PointerEvent) {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
			if (moved && onmove) {
				dragging = true;
				onmove(Math.max(0, origX + dx), Math.max(0, origY + dy));
			}
		}
		function up(ev: PointerEvent) {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			dragging = false;
			if (!moved) onselect?.(ev.shiftKey);
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}
</script>

<div
	class="card {ghost ?? ''}"
	bind:this={cardEl}
	class:selected
	class:dragging
	class:reading={zoom === 'reading'}
	style="left: {x}px; top: {y}px; width: {width}px;"
	onpointerdown={onpointerdown}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect?.(e.shiftKey);
		}
	}}
>
	<div class="head">
		<span class="type type-{type}">{type}</span>
		{#if pinned}<span class="pin" title="Pinned">⚑</span>{/if}
		{#if ghost === 'proposed'}
			<span class="badge proposed-badge">◇ proposed</span>
		{:else if ghost === 'surfaced'}
			<span class="badge surfaced-badge">↖ existing</span>
		{:else}
			<span class="badge actor">{provenance === 'agent' ? '✳ agent' : '✎ you'}</span>
		{/if}
		{#if onremove}
			<button
				class="remove"
				title="Remove from working set (the thought stays in the graph)"
				aria-label="Remove from working set"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={onremove}
			><Icon name="x" size="0.85em" /></button>
		{/if}
	</div>
	<div class="title">{title}</div>
	{#if zoom === 'reading'}
		<p class="statement">{statement}</p>
		{#if source}
			<div class="source" title="Source">{source}</div>
		{/if}
		{#if relationSummary}
			<div class="relsum">{relationSummary}</div>
		{/if}
	{/if}
	<div class="foot">
		<span class="status">{status}</span>
		{#if confidence}
			<span class="confidence" title="Confidence">{formatConfidence(confidence)}</span>
		{/if}
		{#if ghost === 'surfaced' && onadd}
			<button
				class="add-to-set"
				title="Keep this thought on the canvas after review"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={onadd}
			>+ add to working set</button>
		{/if}
	</div>
</div>

<style>
	.card {
		position: absolute;
		background: var(--card-bg, var(--card-white));
		border: 1.5px solid var(--card-border);
		border-radius: 8px;
		padding: 8px 10px;
		box-shadow: var(--shadow-rest);
		cursor: grab;
		user-select: none;
		font-size: var(--fs-13);
		touch-action: none;
	}
	.card.dragging {
		cursor: grabbing;
		box-shadow: var(--shadow-lift);
		z-index: 10;
	}
	.card.selected {
		border-color: var(--blue);
		/* Keep the border width fixed so selecting never reflows the card;
		   the inset ring supplies the extra weight. */
		box-shadow:
			inset 0 0 0 0.5px var(--blue),
			var(--ring-selection);
	}
	.card.proposed {
		border-style: dashed;
		border-color: var(--gold);
		background: var(--parchment);
	}
	.card.surfaced {
		border-style: dotted;
		border-color: var(--surfaced-slate);
		background: var(--surfaced-fill);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}
	.type {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.badge {
		font-size: var(--fs-10);
		white-space: nowrap;
		color: var(--ink-muted);
	}
	.pin {
		font-size: var(--fs-11);
		color: var(--gold-ink);
	}
	.proposed-badge { color: var(--gold-ink); font-weight: 700; }
	.surfaced-badge { color: var(--slate-ink); font-weight: 600; }
	.title {
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
	}
	.statement {
		margin: 6px 0 0;
		color: var(--ink-soft);
		line-height: 1.4;
		font-size: var(--fs-12);
	}
	.relsum {
		margin-top: 6px;
		font-size: var(--fs-11);
		color: var(--ink-muted);
		border-top: 1px solid var(--divider);
		padding-top: 4px;
	}
	.foot {
		margin-top: 6px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.remove {
		border: none;
		background: none;
		padding: 0 2px;
		font-size: var(--fs-11);
		color: var(--ink-quiet);
		cursor: pointer;
		line-height: 1;
		/* Present but invisible until selected, so the head row never reflows. */
		visibility: hidden;
	}
	.card.selected .remove {
		visibility: visible;
	}
	.remove:hover {
		color: var(--rust);
	}
	.add-to-set {
		font: inherit;
		font-size: var(--fs-10);
		font-weight: 600;
		border: 1px solid var(--surfaced-slate);
		background: var(--card-white);
		color: var(--slate-ink);
		border-radius: 999px;
		padding: 2px 8px;
		cursor: pointer;
		white-space: nowrap;
	}
	.add-to-set:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.status {
		font-size: var(--fs-10);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--ink-faded);
		background: var(--pill-fill);
	}
	.confidence {
		font-size: var(--fs-10);
		font-weight: 700;
		border: 1px solid var(--confidence-border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--plum-ink);
		background: var(--confidence-fill);
		white-space: nowrap;
	}
	.source {
		margin-top: 6px;
		font-size: var(--fs-11);
		color: var(--ochre-ink);
		border-top: 1px solid var(--divider);
		padding-top: 4px;
		word-break: break-word;
	}
</style>
