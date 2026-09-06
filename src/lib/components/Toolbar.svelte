<script lang="ts">
	import { appearance } from '$lib/appearance.svelte';
	import { dialogs } from '$lib/dialogs.svelte';
	import AppearanceMenu from './AppearanceMenu.svelte';
	import Icon from './Icon.svelte';
	import ModelSwitcher from './ModelSwitcher.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import type { AgentAction } from '$lib/types';

	const ws = workspace;

	const operations: { action: AgentAction; label: string; hint: string }[] = [
		{ action: 'decompose', label: 'Decompose', hint: 'Split into atomic thoughts' },
		{ action: 'develop', label: 'Develop', hint: 'Extend or refine the selection' },
		{ action: 'challenge', label: 'Challenge', hint: 'Propose objections and assumptions' },
		{ action: 'connect', label: 'Connect', hint: 'Find and link related thoughts' }
	];

	function disabled(action: AgentAction) {
		return (
			ws.invoking !== null ||
			(ws.selectedIds.length === 0 &&
				!(action === 'decompose' && ws.scratchDraft.trim().length > 0))
		);
	}

	async function invoke(action: AgentAction) {
		const err = await ws.invoke(action);
		if (err) ws.notice = err;
	}

	async function undo() {
		const err = await ws.undoLastApply();
		if (err) ws.notice = err;
	}

	async function startFresh() {
		const ok = await dialogs.confirm(
			'Empty this group? Every thought stays on the canvas.',
			'Empty group'
		);
		if (!ok) return;
		const err = await ws.startFresh();
		if (err) ws.notice = err;
	}

	// Emptying a working set only means something while one is active.
	const canStartFresh = $derived(ws.lensActive && ws.workingSet.length > 0);

	// --- progressive collapse ---
	// The toolbar never wraps. When its content stops fitting it gives ground one
	// step at a time, cheapest first: the selection hint goes, then the utility
	// labels, then the view labels, then the wordmark, then the utilities
	// themselves collapse into a menu, and only at the end do the agent
	// operations. Font scaling changes what fits as much as window width does, so
	// this measures rather than consulting a media query.
	const STEPS = 6;
	let toolbarEl = $state<HTMLElement>();
	let step = $state(0);
	// needed[i] = the width the toolbar wanted the last time step i overflowed.
	// Growing back requires that much room again, which keeps a width near a
	// threshold from flapping between two steps.
	let needed = $state<number[]>([]);

	const hideHint = true;
	const iconUtils = $derived(step >= 2);
	const iconViews = $derived(step >= 3);
	const utilsInMenu = $derived(step >= 5);
	const opsInMenu = $derived(step >= 6);

	function fit() {
		const node = toolbarEl;
		if (!node) return;
		const overflowing = node.scrollWidth - node.clientWidth > 1;
		if (overflowing) {
			if (step < STEPS) {
				needed[step] = node.scrollWidth;
				step += 1;
			}
		} else if (step > 0 && node.clientWidth > (needed[step - 1] ?? Infinity) + 8) {
			step -= 1;
		}
	}

	$effect(() => {
		if (!toolbarEl) return;
		const observer = new ResizeObserver(fit);
		observer.observe(toolbarEl);
		return () => observer.disconnect();
	});

	// The observer only catches width changes, and the toolbar keeps its height
	// through a text-size change, so re-measure on anything else that alters what
	// it is trying to hold. Reading `step` is what makes a collapse iterate until
	// it settles.
	let measuredAt = -1;
	$effect(() => {
		const scale = appearance.fontScale;
		step;
		ws.invoking;
		ws.loading;
		ws.activeGraphId;
		ws.modelSelection;
		if (scale !== measuredAt) {
			// Recorded widths were measured at the old text size; at a new one they
			// are worthless. Start from the roomiest step and collapse again.
			measuredAt = scale;
			needed = [];
			step = 0;
		}
		fit();
	});

	// --- menus ---
	let openMenu = $state<'ops' | 'more' | null>(null);
	let opsMenuEl = $state<HTMLElement>();
	let moreMenuEl = $state<HTMLElement>();

	function onDocumentPointerDown(event: PointerEvent) {
		if (!openMenu) return;
		const el = openMenu === 'ops' ? opsMenuEl : moreMenuEl;
		if (!el?.contains(event.target as Node)) openMenu = null;
	}

	// A collapse or expansion moves the trigger out from under the cursor; a menu
	// left open would be pointing at nothing.
	$effect(() => {
		step;
		openMenu = null;
	});

	function run(fn: () => void) {
		openMenu = null;
		fn();
	}
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') openMenu = null; }} />
<svelte:document onpointerdown={onDocumentPointerDown} />

<header
	class="toolbar"
	class:icon-utils={iconUtils}
	class:icon-views={iconViews}
	bind:this={toolbarEl}
>
	{#if !ws.loading && !ws.loadError}
		<button
			class="new-thought"
			title="Write a thought yourself — straight into the graph, no proposal. On the canvas: press N, or double-click where you want it."
			aria-label="New thought"
			onclick={() => ws.compose()}
		>
			<Icon name="plus" /><span class="label">New thought</span>
		</button>
	{/if}
	<div class="ops" role="group" aria-label="Agent operations">
		<ModelSwitcher compact={utilsInMenu} />
		{#if opsInMenu}
			<div class="menu" bind:this={opsMenuEl}>
				<button
					class="op-trigger"
					aria-expanded={openMenu === 'ops'}
					aria-controls="ops-menu"
					disabled={ws.invoking !== null}
					onclick={() => (openMenu = openMenu === 'ops' ? null : 'ops')}
				>
					{ws.invoking ? `${ws.invoking}…` : 'Operations'} <Icon name="chevron-down" size="0.9em" />
				</button>
				{#if openMenu === 'ops'}
					<div class="panel" id="ops-menu">
						{#each operations as { action, label, hint } (action)}
							<button class="item" disabled={disabled(action)} onclick={() => run(() => invoke(action))}>
								<span class="item-label">{label}</span>
								<span class="item-hint">{hint}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			{#each operations as { action, label, hint } (action)}
				<button
					title={hint}
					class:busy={ws.invoking === action}
					disabled={disabled(action)}
					onclick={() => invoke(action)}
				>
					{ws.invoking === action ? `${label}…` : label}
				</button>
			{/each}
		{/if}
	</div>
	{#if !hideHint}
		<span class="selection-hint" aria-live="polite">
			{#if ws.invoking}
				{ws.invoking === 'decompose' && ws.scratchDraft.trim().length > 0
					? 'Proposing from scratch and the group…'
					: `Proposing from ${ws.selectedIds.length} selected thought${ws.selectedIds.length === 1 ? '' : 's'} and the group…`}
			{:else if ws.selectedIds.length > 0}
				{ws.selectedIds.length} selected — operations use the selection plus the group
			{:else}
				Click a card to select · shift-click for multiple
			{/if}
		</span>
	{/if}
	<div class="right">
		<div class="views" role="group" aria-label="Center view">
			<button
				class:active={ws.view === 'canvas'}
				title="Your whole graph, spatially"
				aria-label="Canvas"
				aria-pressed={ws.view === 'canvas'}
				onclick={() => (ws.view = 'canvas')}
			>
				<Icon name="canvas" /><span class="label">Canvas</span>
			</button>
			<button
				class:active={ws.view === 'outline'}
				title="Outline projection — same thoughts, same selection"
				aria-label="Outline"
				aria-pressed={ws.view === 'outline'}
				onclick={() => (ws.view = 'outline')}
			>
				<Icon name="outline" /><span class="label">Outline</span>
			</button>
			<button
				class:active={ws.view === 'browse'}
				title="Sort and filter every thought in the graph"
				aria-label="Browse"
				aria-pressed={ws.view === 'browse'}
				onclick={() => (ws.view = 'browse')}
			>
				<Icon name="browse" /><span class="label">Browse</span>
			</button>
		</div>
		{#if utilsInMenu}
			<div class="menu" bind:this={moreMenuEl}>
				<button
					class="more"
					aria-label="More actions"
					aria-expanded={openMenu === 'more'}
					aria-controls="more-menu"
					title="More actions"
					onclick={() => (openMenu = openMenu === 'more' ? null : 'more')}
				><Icon name="ellipsis" /></button>
				{#if openMenu === 'more'}
					<div class="panel" id="more-menu">
						<button
							class="item"
							onclick={() => run(() => (ws.zoom = ws.zoom === 'overview' ? 'reading' : 'overview'))}
						>
							<span class="item-label">
								<Icon name={ws.zoom === 'overview' ? 'zoom-in' : 'zoom-out'} />
								{ws.zoom === 'overview' ? 'Reading view' : 'Overview'}
							</span>
						</button>
						<button class="item" disabled={!canStartFresh} onclick={() => run(startFresh)}>
							<span class="item-label"><Icon name="clear" /> Empty group</span>
							<span class="item-hint">Membership only — every thought stays on the canvas</span>
						</button>
						<button class="item" disabled={ws.undoLabel === null} onclick={() => run(undo)}>
							<span class="item-label"><Icon name="undo" /> Undo last apply</span>
							{#if ws.undoLabel}<span class="item-hint">{ws.undoLabel}</span>{/if}
						</button>
						<a class="item" href="/api/export" download onclick={() => (openMenu = null)}>
							<span class="item-label"><Icon name="download" /> Export</span>
							<span class="item-hint">Download the active graph as JSON</span>
						</a>
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="zoom"
				title={ws.zoom === 'overview' ? 'Reading view' : 'Overview'}
				aria-label={ws.zoom === 'overview' ? 'Reading view' : 'Overview'}
				onclick={() => (ws.zoom = ws.zoom === 'overview' ? 'reading' : 'overview')}
			>
				<Icon name={ws.zoom === 'overview' ? 'zoom-in' : 'zoom-out'} />
				<span class="label">{ws.zoom === 'overview' ? 'Reading view' : 'Overview'}</span>
			</button>
			<button
				title="Empty the group — every thought stays on the canvas"
				aria-label="Empty group"
				disabled={!canStartFresh}
				onclick={startFresh}
			>
				<Icon name="clear" /><span class="label">Empty group</span>
			</button>
			<button
				class="undo"
				disabled={ws.undoLabel === null}
				title={ws.undoLabel ?? 'Undo last apply'}
				aria-label="Undo last apply"
				onclick={undo}
			>
				<Icon name="undo" /><span class="label">Undo last apply</span>
			</button>
			<a
				class="export"
				href="/api/export"
				download
				title="Download the active graph as JSON"
				aria-label="Export"
			>
				<Icon name="download" /><span class="label">Export</span>
			</a>
		{/if}
		<AppearanceMenu />
	</div>
</header>

<style>
	.toolbar {
		box-sizing: border-box;
		max-width: calc(100vw - 32px);
		border-radius: 14px;
		box-shadow: var(--shadow-menu);
		display: flex;
		flex-wrap: nowrap;
		min-height: 48px;
		align-items: center;
		gap: 16px;
		padding: 8px 14px;
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
	}
	/* Nothing but the hint may shrink: squeezed controls would hide the overflow
	   that the collapse steps exist to detect. */
	.toolbar > :global(*) {
		flex: 0 0 auto;
	}
	.ops {
		display: flex;
		gap: 6px;
	}
	.new-thought {
		font: inherit;
		font-size: var(--fs-12-5);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.new-thought:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	/* Sheds its label alongside the view switcher's collapse step. */
	.toolbar.icon-views .new-thought .label {
		display: none;
	}
	.ops button {
		font: inherit;
		font-size: var(--fs-12-5);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
	}
	.ops button:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	.ops button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.ops button.busy {
		opacity: 1;
		border-color: var(--blue);
		color: var(--blue);
		cursor: progress;
		animation: busy-pulse 1.2s ease-in-out infinite;
	}
	.op-trigger {
		text-transform: capitalize;
	}
	@keyframes busy-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ops button.busy {
			animation: none;
		}
	}
	.selection-hint {
		font-size: var(--fs-11-5);
		color: var(--ink-quiet);
		flex: 1 1 auto;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.right {
		display: flex;
		gap: 6px;
		/* Holds the right-hand controls against the edge once the hint is gone. */
		margin-left: auto;
	}
	.right button,
	.export {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.right button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.right button:hover:not(:disabled):not(.active),
	.export:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	/* The utilities lose their labels first; the view switcher, being navigation,
	   keeps its own for one step longer. */
	.toolbar.icon-utils .right > :not(.views) .label {
		display: none;
	}
	.toolbar.icon-views .views .label {
		display: none;
	}
	.toolbar.icon-views {
		/* Icon-sized controls don't need as much air between the groups. */
		gap: 12px;
	}
	.views {
		display: flex;
	}
	.views button {
		border-radius: 0;
		margin-left: -1px;
	}
	.views button:first-child {
		border-radius: 6px 0 0 6px;
		margin-left: 0;
	}
	.views button:last-child {
		border-radius: 0 6px 6px 0;
	}
	.views button.active {
		border-color: var(--blue);
		background: var(--blue-wash);
		color: var(--blue-deep);
		position: relative;
		z-index: 1;
	}
	.menu {
		position: relative;
	}
	.panel {
		position: absolute;
		bottom: calc(100% + 10px);
		z-index: 100;
		width: 250px;
		padding: 6px;
		background: var(--paper-raised);
		border: 1px solid var(--control-border);
		border-radius: 8px;
		box-shadow: var(--shadow-menu);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	#ops-menu {
		left: 0;
	}
	#more-menu {
		right: 0;
	}
	/* Qualified with .panel so these beat the toolbar's own button rules, which
	   would otherwise box every menu item like a toolbar control. */
	.panel .item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		font: inherit;
		border: none;
		background: none;
		border-radius: 6px;
		padding: 7px 9px;
		cursor: pointer;
		text-decoration: none;
		white-space: normal;
	}
	.panel .item:hover:not(:disabled) {
		background: var(--inset-fill);
	}
	.panel .item:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.panel .item-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink-soft);
	}
	.panel .item-hint {
		font-size: var(--fs-11);
		line-height: 1.4;
		color: var(--ink-quiet);
		/* The undo hint is a whole change-set summary; two lines of it is plenty. */
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	@media (max-width: 600px) {
		.toolbar { flex-wrap: wrap; justify-content: center; gap: 8px; padding: 8px; max-width: calc(100vw - 16px); }
		.right { margin-left: 0; justify-content: center; }
	}
</style>
