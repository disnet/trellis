<script lang="ts">
	// A free-text box on the canvas — the default thing you create there. Not a
	// thought: no type, no status, never in the graph. Useful as an annotation
	// beside a group, and as raw material for its two graduations: convert into
	// a thought (via the composer) or decompose into proposals.
	import Icon from './Icon.svelte';

	interface Props {
		x: number;
		y: number;
		width: number;
		/** User-set height. The box holds it exactly; overflowing text scrolls
		 *  inside. Absent means fit the content. */
		height?: number;
		body: string;
		/** Canvas zoom factor; pointer deltas are divided by it so drags track the cursor. */
		scale?: number;
		animate?: boolean;
		/** Changes when something asks for the caret (a freshly created note). */
		focusSignal?: number;
		/** A decompose of this note is generating. */
		busy?: boolean;
		/** Freeze the graduation controls (any agent call is in flight). */
		controlsLocked?: boolean;
		/** Part of the canvas selection — a marquee sweep or a shift-click. */
		selected?: boolean;
		/** Forced drag styling — set on the rest of the selection during a group drag. */
		dragging?: boolean;
		onchange: (body: string) => void;
		/** Fires when this note starts and stops being dragged. */
		ondragging?: (dragging: boolean) => void;
		onselect?: (additive: boolean) => void;
		onmove?: (x: number, y: number) => void;
		/** Set a user size from the corner handle; undefined resets a dimension. */
		onresize?: (w: number | undefined, h: number | undefined) => void;
		onsize?: (width: number, height: number) => void;
		onconvert: () => void;
		ondecompose: () => void;
		ondelete: () => void;
	}

	let {
		x,
		y,
		width,
		height,
		body,
		scale = 1,
		animate = false,
		focusSignal = 0,
		busy = false,
		controlsLocked = false,
		selected = false,
		dragging = false,
		onchange,
		ondragging,
		onselect,
		onmove,
		onresize,
		onsize,
		onconvert,
		ondecompose,
		ondelete
	}: Props = $props();

	let selfDragging = $state(false);
	let cardEl = $state<HTMLDivElement>();
	let textEl = $state<HTMLTextAreaElement>();

	$effect(() => {
		if (!cardEl || !onsize) return;
		const el = cardEl;
		const report = onsize;
		const observer = new ResizeObserver(() => report(el.offsetWidth, el.offsetHeight));
		observer.observe(el);
		return () => observer.disconnect();
	});

	// Default size: the box grows with its text. With a user-set height the
	// flex layout owns the textarea's extent instead, and overflow scrolls.
	function autosize() {
		if (!textEl) return;
		if (height) {
			textEl.style.height = '';
			return;
		}
		textEl.style.height = 'auto';
		textEl.style.height = `${textEl.scrollHeight}px`;
	}
	$effect(() => {
		body;
		width; // a new width rewraps the text, so the fit height changes too
		height;
		autosize();
	});
	$effect(() => {
		if (focusSignal && textEl) {
			textEl.focus();
			textEl.setSelectionRange(textEl.value.length, textEl.value.length);
		}
	});

	const hasText = $derived(body.trim().length > 0);

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.stopPropagation();
		// Shift picks the note up into the selection rather than the caret.
		if (e.shiftKey) {
			e.preventDefault();
			onselect?.(true);
			return;
		}
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
				if (!selfDragging) {
					selfDragging = true;
					ondragging?.(true);
				}
				onmove(origX + dx / scale, origY + dy / scale);
			}
		}
		function up() {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			if (selfDragging) ondragging?.(false);
			selfDragging = false;
			// A motionless press is a request to write: take the selection down to
			// this note, and hand the caret over.
			if (!moved) {
				onselect?.(false);
				textEl?.focus();
			}
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	// The corner handle sets a user size: the box holds it exactly, and text
	// that no longer fits scrolls inside. Double-click snaps back to the
	// default content-fit size.
	const MIN_W = 180;
	const MAX_W = 640;
	const MIN_H = 88;
	const MAX_H = 1200;
	let resizing = $state(false);

	function onResizeDown(e: PointerEvent) {
		if (e.button !== 0 || !onresize) return;
		e.stopPropagation();
		e.preventDefault();
		const report = onresize;
		const startX = e.clientX;
		const startY = e.clientY;
		const origW = width;
		const origH = cardEl?.offsetHeight ?? height ?? MIN_H;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);

		function clamp(v: number, lo: number, hi: number) {
			return Math.min(Math.max(v, lo), hi);
		}
		function move(ev: PointerEvent) {
			resizing = true;
			report(
				Math.round(clamp(origW + (ev.clientX - startX) / scale, MIN_W, MAX_W)),
				Math.round(clamp(origH + (ev.clientY - startY) / scale, MIN_H, MAX_H))
			);
		}
		function up() {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			resizing = false;
		}
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
	}

	function onblur() {
		// An empty note left behind is litter, not an annotation.
		if (!hasText) ondelete();
	}

	function onkeydown(e: KeyboardEvent) {
		// The canvas owns Escape and the pan keys; while writing neither should
		// reach it.
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			textEl?.blur();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="note"
	bind:this={cardEl}
	class:selected
	class:dragging={selfDragging || dragging}
	class:resizing
	class:fixed={!!height}
	class:layout-moving={animate}
	style="left: 0; top: 0; transform: translate({x}px, {y}px); width: {width}px;{height ? ` height: ${height}px;` : ''}"
	{onpointerdown}
	ondblclick={(e) => e.stopPropagation()}
>
	<div class="head">
		<span class="tag">✎ note</span>
		<button
			class="remove"
			title="Delete this note"
			aria-label="Delete note"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={ondelete}
		><Icon name="x" size="0.85em" /></button>
	</div>
	<textarea
		bind:this={textEl}
		value={body}
		rows="2"
		placeholder="Jot anything… convert it into a thought, or decompose it."
		aria-label="Note text"
		oninput={(e) => {
			onchange(e.currentTarget.value);
			autosize();
		}}
		onpointerdown={(e) => {
			e.stopPropagation();
			// Shift-clicking the text of a note you are not writing in adds the note
			// to the selection; while writing, shift still extends the text range.
			if (e.shiftKey && document.activeElement !== textEl) {
				e.preventDefault();
				onselect?.(true);
				return;
			}
			if (!e.shiftKey) onselect?.(false);
		}}
		onwheel={(e) => {
			// Scrolling overflowed text is what the wheel means here — keep the
			// event from reaching the canvas, which would pan instead.
			const el = e.currentTarget;
			if (height && el.scrollHeight > el.clientHeight) e.stopPropagation();
		}}
		{onkeydown}
		{onblur}
	></textarea>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="foot" onpointerdown={(e) => e.stopPropagation()}>
		<button
			disabled={!hasText || controlsLocked}
			title="Turn this note into a thought — pick its type, straight into the graph"
			onclick={onconvert}
		>→ Thought</button>
		<button
			class:busy
			disabled={!hasText || controlsLocked}
			title="Ask the agent to split this note into atomic thoughts, for review"
			onclick={ondecompose}
		>{busy ? 'Decomposing…' : '◇ Decompose'}</button>
	</div>
	{#if onresize}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="resize"
			title="Drag to resize · double-click to fit the text"
			onpointerdown={onResizeDown}
			ondblclick={(e) => {
				e.stopPropagation();
				onresize(undefined, undefined);
			}}
		></div>
	{/if}
</div>

<style>
	/* A jotting, not a card of knowledge: recessed paper, no type chip, no
	   status — visually quieter than any thought. */
	.note {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 4px;
		box-sizing: border-box;
		background: var(--pill-fill);
		border: 1px solid var(--card-border);
		border-radius: 8px;
		padding: 6px 8px 8px;
		box-shadow: var(--shadow-rest);
		cursor: grab;
		font-size: var(--fs-13);
	}
	.note.layout-moving:not(.dragging) { transition: transform 380ms cubic-bezier(.22, 1, .36, 1); }
	@media (prefers-reduced-motion: reduce) { .note.layout-moving:not(.dragging) { transition: none; } }
	.note.dragging {
		cursor: grabbing;
		box-shadow: var(--shadow-lift);
		z-index: 10;
	}
	.note.resizing {
		box-shadow: var(--shadow-lift);
		z-index: 10;
	}
	.note:focus-within {
		border-color: var(--blue);
		box-shadow: var(--ring-selection);
	}
	/* In the canvas selection: the same ring a selected card wears, so a mixed
	   sweep of notes and thoughts reads as one selection. */
	.note.selected {
		border-color: var(--blue);
		box-shadow:
			inset 0 0 0 0.5px var(--blue),
			var(--ring-selection);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.tag {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
	}
	.remove {
		border: none;
		background: none;
		padding: 0 2px;
		color: var(--ink-quiet);
		cursor: pointer;
		line-height: 1;
		/* Present but invisible until the note is engaged, so the head never reflows. */
		visibility: hidden;
	}
	.note:hover .remove,
	.note:focus-within .remove {
		visibility: visible;
	}
	.remove:hover {
		color: var(--rust);
	}
	textarea {
		font: inherit;
		font-size: var(--fs-12-5);
		line-height: 1.45;
		color: var(--ink);
		background: transparent;
		border: none;
		padding: 0;
		width: 100%;
		box-sizing: border-box;
		resize: none;
		overflow: hidden;
		cursor: text;
	}
	/* A user-set height is held exactly: the textarea takes whatever room the
	   box gives it, and text that no longer fits scrolls inside. */
	.note.fixed textarea {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	textarea:focus {
		outline: none;
	}
	textarea::placeholder {
		color: var(--ink-quiet);
	}
	.foot {
		display: flex;
		gap: 6px;
		/* Pinned to the bottom, so a taller user-set box opens writing room
		   between the text and the controls rather than dead space below them. */
		margin-top: auto;
		padding-top: 6px;
		border-top: 1px solid var(--divider);
		cursor: default;
	}
	.foot button {
		flex: 1;
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 600;
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 3px 8px;
		cursor: pointer;
		white-space: nowrap;
	}
	.foot button:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	.foot button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.foot button.busy {
		opacity: 1;
		border-color: var(--blue);
		color: var(--blue);
		cursor: progress;
		animation: busy-pulse 1.2s ease-in-out infinite;
	}
	@keyframes busy-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.foot button.busy {
			animation: none;
		}
	}
	/* Corner grip: two quiet diagonal strokes, surfaced with the rest of the
	   controls on hover/focus. The hit area is bigger than the drawing. */
	.resize {
		position: absolute;
		right: -4px;
		bottom: -4px;
		width: 18px;
		height: 18px;
		cursor: nwse-resize;
		background:
			linear-gradient(135deg, transparent 58%, var(--ink-quiet) 58%, var(--ink-quiet) 63%, transparent 63%, transparent 73%, var(--ink-quiet) 73%, var(--ink-quiet) 78%, transparent 78%) no-repeat 4px 4px / 10px 10px;
		opacity: 0;
	}
	.note:hover .resize,
	.note:focus-within .resize,
	.note.resizing .resize {
		opacity: 1;
	}
</style>
