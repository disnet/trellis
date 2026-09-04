<script lang="ts">
	import type { ActorType, ThoughtStatus, ThoughtType } from '$lib/types';

	interface Props {
		x: number;
		y: number;
		width: number;
		type: ThoughtType;
		status: ThoughtStatus;
		title: string;
		statement: string;
		zoom: 'overview' | 'reading';
		selected?: boolean;
		/** Marked as a per-graph landmark (Phase 6). */
		pinned?: boolean;
		/** 'proposed' = new content awaiting ratification; 'surfaced' = existing thought previewed on canvas by a pending relation. */
		ghost?: 'proposed' | 'surfaced' | null;
		provenance: ActorType;
		relationSummary?: string;
		onmove?: (x: number, y: number) => void;
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
		zoom,
		selected = false,
		pinned = false,
		ghost = null,
		provenance,
		relationSummary,
		onmove,
		onselect,
		onremove,
		onadd
	}: Props = $props();

	let dragging = $state(false);

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
			>✕</button>
		{/if}
	</div>
	<div class="title">{title}</div>
	{#if zoom === 'reading'}
		<p class="statement">{statement}</p>
		{#if relationSummary}
			<div class="relsum">{relationSummary}</div>
		{/if}
	{/if}
	<div class="foot">
		<span class="status">{status}</span>
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
		background: var(--card-bg, #fff);
		border: 1.5px solid #c9c4b8;
		border-radius: 8px;
		padding: 8px 10px;
		box-shadow: 0 1px 3px rgba(60, 50, 30, 0.12);
		cursor: grab;
		user-select: none;
		font-size: 13px;
		touch-action: none;
	}
	.card.dragging {
		cursor: grabbing;
		box-shadow: 0 6px 16px rgba(60, 50, 30, 0.2);
		z-index: 10;
	}
	.card.selected {
		border-color: #3b5bdb;
		border-width: 2px;
		box-shadow: 0 0 0 3px rgba(59, 91, 219, 0.18);
	}
	.card.proposed {
		border-style: dashed;
		border-color: #b08a3e;
		background: #fdf8ec;
	}
	.card.surfaced {
		border-style: dotted;
		border-color: #6b7f8a;
		background: #f0f4f6;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}
	.type {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 4px;
		background: #eee9dd;
		color: #5a523f;
	}
	.type-claim { background: #e3ecdf; color: #3d5537; }
	.type-question { background: #e5e1f2; color: #4a4174; }
	.type-concept { background: #dfe9ef; color: #35586b; }
	.type-example { background: #f2e6df; color: #6b4a35; }
	.badge {
		font-size: 10px;
		white-space: nowrap;
		color: #6d675c;
	}
	.pin {
		font-size: 11px;
		color: #8a6a1f;
	}
	.proposed-badge { color: #8a6a1f; font-weight: 700; }
	.surfaced-badge { color: #4a616f; font-weight: 600; }
	.title {
		font-weight: 600;
		line-height: 1.25;
		color: #2c2921;
	}
	.statement {
		margin: 6px 0 0;
		color: #4d473c;
		line-height: 1.4;
		font-size: 12px;
	}
	.relsum {
		margin-top: 6px;
		font-size: 11px;
		color: #6d675c;
		border-top: 1px solid #eae5d9;
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
		font-size: 11px;
		color: #8a8375;
		cursor: pointer;
		line-height: 1;
		/* Present but invisible until selected, so the head row never reflows. */
		visibility: hidden;
	}
	.card.selected .remove {
		visibility: visible;
	}
	.remove:hover {
		color: #8a3a2a;
	}
	.add-to-set {
		font: inherit;
		font-size: 10px;
		font-weight: 600;
		border: 1px solid #6b7f8a;
		background: #fff;
		color: #35586b;
		border-radius: 999px;
		padding: 2px 8px;
		cursor: pointer;
		white-space: nowrap;
	}
	.add-to-set:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.status {
		font-size: 10px;
		border: 1px solid #d5d0c4;
		border-radius: 999px;
		padding: 1px 7px;
		color: #5a523f;
		background: #faf7f0;
	}
</style>
