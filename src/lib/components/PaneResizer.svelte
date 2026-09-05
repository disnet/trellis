<script lang="ts">
	// A vertical drag handle sitting on the inner edge of a sidebar. It owns no
	// layout of its own — it reports a new width and the parent applies it to the
	// grid, so the panes never reflow mid-drag.

	interface Props {
		width: number;
		min: number;
		max: number;
		/** Which sidebar this handle belongs to; decides which way a drag grows it. */
		side: 'left' | 'right';
		/** Width restored on double-click / Home. */
		reset: number;
		label: string;
	}

	let { width = $bindable(), min, max, side, reset, label }: Props = $props();

	let dragging = $state(false);
	let startX = 0;
	let startWidth = 0;

	const clamp = (w: number) => Math.min(max, Math.max(min, w));
	const sign = $derived(side === 'left' ? 1 : -1);

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		dragging = true;
		startX = e.clientX;
		startWidth = width;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onpointermove(e: PointerEvent) {
		if (!dragging) return;
		width = clamp(startWidth + sign * (e.clientX - startX));
	}

	function onpointerup(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function onkeydown(e: KeyboardEvent) {
		const step = e.shiftKey ? 48 : 12;
		if (e.key === 'ArrowLeft') width = clamp(width - sign * step);
		else if (e.key === 'ArrowRight') width = clamp(width + sign * step);
		else if (e.key === 'Home') width = clamp(reset);
		else return;
		e.preventDefault();
	}
</script>

<!-- A focusable separator is the ARIA window-splitter pattern; the linter only
     knows the non-focusable kind. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="resizer {side}"
	class:dragging
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={Math.round(width)}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	title="Drag to resize · double-click to reset"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onkeydown}
	ondblclick={() => (width = clamp(reset))}
></div>

{#if dragging}
	<!-- Keeps the col-resize cursor and stops the drag from selecting card text
	     or hitting hover states in the panes it passes over. -->
	<div class="drag-shield"></div>
{/if}

<style>
	.resizer {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 9px;
		z-index: 5;
		cursor: col-resize;
		touch-action: none;
	}
	.resizer.left {
		right: -5px;
	}
	.resizer.right {
		left: -5px;
	}
	/* The visible hairline is thinner than the grab area. */
	.resizer::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 3px;
		width: 3px;
		background: transparent;
		transition: background 120ms ease;
	}
	.resizer:hover::after,
	.resizer:focus-visible::after,
	.resizer.dragging::after {
		background: var(--blue);
	}
	.resizer:focus-visible {
		outline: none;
	}
	.drag-shield {
		position: fixed;
		inset: 0;
		z-index: 50;
		cursor: col-resize;
	}
</style>
