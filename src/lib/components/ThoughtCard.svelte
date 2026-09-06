<script lang="ts">
	import {
		formatConfidence,
		type ActorType,
		type Confidence,
		type OperationDecision,
		type ThoughtStatus,
		type ThoughtType
	} from '$lib/types';
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
		/** Canvas zoom factor; pointer deltas are divided by it so drags track the cursor. */
		scale?: number;
		animate?: boolean;
		selected?: boolean;
		/** Marked as a per-graph landmark (Phase 6). */
		pinned?: boolean;
		/** Outside the active group (lens) — still present, visually quiet. */
		dimmed?: boolean;
		/** Groups this thought belongs to, when the canvas is showing them:
		 *  a tinted ring in the first group's color, one dot per group. */
		groups?: { name: string; color: string }[];
		/** 'proposed' = new content awaiting ratification. */
		ghost?: 'proposed' | null;
		/** Review state of the operation behind a proposed card. */
		decision?: OperationDecision;
		/** Why accepting is blocked, when it is (a rejected dependency). */
		blocked?: string | null;
		/** Ratify this proposal from the canvas; omit to review it only in the tray. */
		ondecide?: (decision: OperationDecision) => void;
		/** Freeze the controls (a placement preview or an apply is in flight)
		 *  without removing them — the card must not change height mid-layout. */
		reviewBusy?: boolean;
		provenance: ActorType;
		relationSummary?: string;
		/** Forced drag styling — set on the rest of the selection during a group drag. */
		dragging?: boolean;
		onmove?: (x: number, y: number) => void;
		/** Fires when this card starts and stops being dragged. */
		ondragging?: (dragging: boolean) => void;
		onsize?: (width: number, height: number) => void;
		onselect?: (additive: boolean) => void;
		/** Remove from the working set (shown on selected cards; the graph is untouched). */
		onremove?: () => void;
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
		scale = 1,
		animate = false,
		selected = false,
		pinned = false,
		dimmed = false,
		groups,
		ghost = null,
		decision = 'pending',
		blocked = null,
		ondecide,
		reviewBusy = false,
		provenance,
		relationSummary,
		dragging = false,
		onmove,
		ondragging,
		onsize,
		onselect,
		onremove
	}: Props = $props();

	let selfDragging = $state(false);
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
				if (!selfDragging) {
					selfDragging = true;
					ondragging?.(true);
				}
				onmove(origX + dx / scale, origY + dy / scale);
			}
		}
		function up(ev: PointerEvent) {
			el.releasePointerCapture(e.pointerId);
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			if (selfDragging) ondragging?.(false);
			selfDragging = false;
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
	class:dragging={selfDragging || dragging}
	class:dimmed
	class:reading={zoom === 'reading'}
	class:layout-moving={animate}
	class:accepted={ghost === 'proposed' && decision === 'accepted'}
	class:rejected={ghost === 'proposed' && decision === 'rejected'}
	class:grouped={!!groups?.length}
	style="left: 0; top: 0; transform: translate({x}px, {y}px); width: {width}px;{groups?.length ? ` --group-ring: ${groups[0].color};` : ''}"
	onpointerdown={onpointerdown}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		// Only the card itself: Enter on a review button must ratify, not select.
		if (e.target !== e.currentTarget) return;
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
			<span class="badge proposed-badge" class:decided={decision !== 'pending'}>
				{decision === 'accepted' ? '✓ accepted' : decision === 'rejected' ? '✕ rejected' : '◇ proposed'}
			</span>
		{:else}
			<span class="badge actor">{provenance === 'agent' ? '✳ agent' : '✎ you'}</span>
		{/if}
		{#if groups?.length}
			<span class="group-dots" title={groups.map((g) => g.name).join(' · ')}>
				{#each groups as g, i (i)}
					<span class="group-dot" style="background: {g.color}"></span>
				{/each}
			</span>
		{/if}
		{#if onremove}
			<button
				class="remove"
				title="Remove from group (the thought stays in the graph)"
				aria-label="Remove from group"
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
		<div class="relsum" title={relationSummary}>{relationSummary ?? (ghost ? 'Connections proposed for review' : 'No connections yet')}</div>
	{/if}
	<div class="foot">
		<span class="status">{status}</span>
		{#if confidence}
			<span class="confidence" title="Confidence">{formatConfidence(confidence)}</span>
		{/if}
	</div>
	{#if ghost === 'proposed' && ondecide}
		<!-- Ratification where the thought is: the same decision the tray makes,
		     taken in place. Applying still happens once, for the whole batch. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="review" onpointerdown={(e) => e.stopPropagation()}>
			{#if decision === 'pending'}
				<button
					class="accept"
					disabled={blocked !== null || reviewBusy}
					title={blocked ?? 'Accept this proposal'}
					onclick={() => ondecide('accepted')}>✓ Accept</button
				>
				<button
					class="reject"
					disabled={reviewBusy}
					title="Reject this proposal"
					onclick={() => ondecide('rejected')}>✕ Reject</button
				>
			{:else}
				<button
					class="undo"
					disabled={reviewBusy}
					title="Return this proposal to the review queue"
					onclick={() => ondecide('pending')}>Reconsider</button
				>
			{/if}
		</div>
		{#if blocked && decision === 'pending'}
			<p class="blocked">{blocked}</p>
		{/if}
	{/if}
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
	.card.layout-moving:not(.dragging) { transition: transform 380ms cubic-bezier(.22, 1, .36, 1); }
	@media (prefers-reduced-motion: reduce) { .card.layout-moving:not(.dragging) { transition: none; } }
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
	/* Decided, not yet applied: gold gives way to the verdict, but the border
	   stays dashed — nothing has entered the graph until the batch is applied. */
	.card.proposed.accepted {
		border-color: var(--accept-green);
		background: var(--accept-fill);
	}
	.card.proposed.rejected {
		border-color: var(--control-border);
		background: var(--inset-fill);
		opacity: 0.5;
	}
	.card.proposed.rejected:hover,
	.card.proposed.rejected.selected {
		opacity: 1;
	}
	.card.proposed.rejected .title {
		text-decoration: line-through;
		text-decoration-color: var(--ink-quiet);
		color: var(--ink-muted);
	}
	/* Selection outranks the proposal's own colors, on any verdict: this is the
	   card the tray is showing. */
	.card.proposed.selected {
		border-color: var(--blue);
	}
	/* Group identity on the base (all-thoughts) canvas: a quiet ring in the
	   first group's color. Selection outranks it — that ring means "you". */
	.card.grouped:not(.selected) {
		box-shadow:
			0 0 0 2.5px var(--group-ring),
			var(--shadow-rest);
	}
	.card.grouped.dragging:not(.selected) {
		box-shadow:
			0 0 0 2.5px var(--group-ring),
			var(--shadow-lift);
	}
	.group-dots {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		margin-left: auto;
	}
	.group-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		box-shadow: 0 0 0 1.5px var(--card-bg, var(--card-white));
	}
	/* Outside the active lens: present (spatial memory intact) but quiet.
	   Opacity, not color alone — and selection/hover lift the veil. */
	.card.dimmed {
		opacity: 0.4;
	}
	.card.dimmed:hover,
	.card.dimmed.selected,
	.card.dimmed.dragging {
		opacity: 1;
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
	.card.accepted .proposed-badge.decided { color: var(--moss-ink); }
	.card.rejected .proposed-badge.decided { color: var(--ink-muted); }
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
		height: calc(var(--fs-11) * 2.8);
		line-height: 1.4;
		overflow: hidden;
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
	.review {
		display: flex;
		gap: 6px;
		margin-top: 8px;
		padding-top: 6px;
		border-top: 1px solid var(--divider);
		cursor: default;
	}
	.review button {
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
	.review button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.review .accept {
		border-color: var(--accept-green);
		color: var(--moss-ink);
	}
	.review .accept:hover:not(:disabled) {
		background: var(--accept-fill);
	}
	.review .reject {
		color: var(--clay-ink);
	}
	.review .reject:hover:not(:disabled) {
		border-color: var(--rust);
		color: var(--rust);
	}
	.review .undo:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.blocked {
		margin: 6px 0 0;
		font-size: var(--fs-10);
		color: var(--rust);
		background: var(--rust-wash);
		border-radius: 4px;
		padding: 3px 6px;
		line-height: 1.35;
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
