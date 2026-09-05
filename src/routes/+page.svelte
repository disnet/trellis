<script lang="ts">
	import { browser } from '$app/environment';
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Browse from '$lib/components/Browse.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import GraphSwitcher from '$lib/components/GraphSwitcher.svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Inspector from '$lib/components/Inspector.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import Library from '$lib/components/Library.svelte';
	import NewThought from '$lib/components/NewThought.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import ProposalTray from '$lib/components/ProposalTray.svelte';
	import ReentryPanel from '$lib/components/ReentryPanel.svelte';
	import Scratch from '$lib/components/Scratch.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import WorkingSetTabs from '$lib/components/WorkingSetTabs.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const ws = workspace;
	let leftPanel = $state<'scratch' | 'library' | null>(null);
	let rightPanel = $state<'proposals' | 'inspector' | null>(null);
	let previousPending = 0;
	$effect(() => {
		const count = ws.pendingChangeSets.length;
		if (count > previousPending) {
			rightPanel = 'proposals';
			if (viewportWidth < 800) leftPanel = null;
		}
		previousPending = count;
	});
	// The inspector follows a single selection: selecting one thought brings up
	// its details without a second click; clearing the selection or growing it
	// to several (a marquee sweep is about the group, not any one card)
	// dismisses them.
	let previousSelection: string[] = [];
	$effect(() => {
		const ids = ws.selectedIds;
		if (ids !== previousSelection) {
			if (ids.length === 1) {
				rightPanel = 'inspector';
				if (viewportWidth < 800) leftPanel = null;
			} else if (rightPanel === 'inspector') {
				rightPanel = null;
			}
		}
		previousSelection = ids;
	});
	function toggleLeft(panel: 'scratch' | 'library') {
		leftPanel = leftPanel === panel ? null : panel;
		if (viewportWidth < 800) rightPanel = null;
	}
	function toggleRight(panel: 'proposals' | 'inspector') {
		rightPanel = rightPanel === panel ? null : panel;
		if (viewportWidth < 800) leftPanel = null;
	}

	// --- sidebar widths (view-only, per-browser) ---
	const LEFT_DEFAULT = 270;
	const RIGHT_DEFAULT = 400;
	const LEFT_MIN = 190;
	const RIGHT_MIN = 260;
	const CENTER_MIN = 360;
	const STORAGE_KEY = 'trellis:sidebar-widths';

	function restored(): { left: number; right: number } {
		if (!browser) return { left: LEFT_DEFAULT, right: RIGHT_DEFAULT };
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) throw new Error('none');
			const saved = JSON.parse(raw);
			return {
				left: typeof saved.left === 'number' ? saved.left : LEFT_DEFAULT,
				right: typeof saved.right === 'number' ? saved.right : RIGHT_DEFAULT
			};
		} catch {
			return { left: LEFT_DEFAULT, right: RIGHT_DEFAULT };
		}
	}

	const initial = restored();
	let leftWidth = $state(initial.left);
	let rightWidth = $state(initial.right);
	let viewportWidth = $state(browser ? window.innerWidth : 1440);

	// Limit floating panels so a useful strip of canvas remains between them.
	const clamp = (w: number, min: number, max: number) => Math.min(Math.max(w, min), max);
	const leftMax = $derived(Math.max(LEFT_MIN, viewportWidth - RIGHT_MIN - CENTER_MIN));
	const left = $derived(clamp(leftWidth, LEFT_MIN, leftMax));
	const rightMax = $derived(Math.max(RIGHT_MIN, viewportWidth - left - CENTER_MIN));
	const right = $derived(clamp(rightWidth, RIGHT_MIN, rightMax));

	// Persist what was actually dragged, not the window-clamped value — a stint in
	// a narrow window shouldn't forget the layout chosen in a wide one.
	$effect(() => {
		const widths = JSON.stringify({ left: leftWidth, right: rightWidth });
		try {
			localStorage.setItem(STORAGE_KEY, widths);
		} catch {
			// Private-mode or full storage: the layout still works, it just won't persist.
		}
	});

	// Auto-dismiss the notice toast.
	$effect(() => {
		if (ws.notice) {
			const t = setTimeout(() => (ws.notice = null), 6000);
			return () => clearTimeout(t);
		}
	});
</script>

<svelte:head>
	<title>Trellis</title>
</svelte:head>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="app" style="--left-w: {left}px; --right-w: {right}px">
	<div class="workspace-bar">
		<div class="workspace-identity">
			<span class="wordmark">Trellis</span>
			{#if !ws.loading && !ws.loadError}<GraphSwitcher compact={viewportWidth < 1000} />{/if}
			<details class="sets-menu">
				<summary>{ws.workingSets.find(set => set.id === ws.activeWorkingSetId)?.name ?? 'All thoughts'} <Icon name="chevron-down" /></summary>
				<div class="sets-popover"><WorkingSetTabs /></div>
			</details>
		</div>
		<nav class="panel-switcher" aria-label="Workspace panels">
			<button class:active={leftPanel === 'scratch'} aria-expanded={leftPanel === 'scratch'} aria-controls="scratch-library" onclick={() => toggleLeft('scratch')}><Icon name="pencil" /> Scratch</button>
			<button class:active={leftPanel === 'library'} aria-expanded={leftPanel === 'library'} aria-controls="scratch-library" onclick={() => toggleLeft('library')}><Icon name="browse" /> Library</button>
			<button class:active={rightPanel === 'proposals'} class:pending={ws.pendingChangeSets.length > 0} aria-expanded={rightPanel === 'proposals'} aria-controls="review-panel" onclick={() => toggleRight('proposals')}>◇ Proposals{#if ws.pendingChangeSets.length} <span class="badge">{ws.pendingChangeSets.length}</span>{/if}</button>
			<button class:active={rightPanel === 'inspector'} aria-expanded={rightPanel === 'inspector'} aria-controls="review-panel" onclick={() => toggleRight('inspector')}><Icon name="outline" /> Inspector{#if ws.selectedIds.length} <span class="badge">{ws.selectedIds.length}</span>{/if}</button>
		</nav>
	</div>
	<div class="tool-dock"><Toolbar /></div>
	<aside id="scratch-library" class="floating-panel left" hidden={!leftPanel} aria-label={leftPanel === 'library' ? 'Library' : 'Scratch'}>
		<button class="close-panel" aria-label="Close scratch and library" onclick={() => leftPanel = null}><Icon name="x" /></button>
		<div class="panel-content" hidden={leftPanel !== 'scratch'}><Scratch /></div>
		<div class="panel-content" hidden={leftPanel !== 'library'}><Library /></div>
		<PaneResizer bind:width={leftWidth} min={LEFT_MIN} max={leftMax} side="left" reset={LEFT_DEFAULT} label="Resize the scratch and library panel" />
	</aside>
	<main class="center">
		{#if ws.loading}
			<div class="load-state">Loading the graph…</div>
		{:else if ws.loadError}
			<div class="load-state error">
				<p>Could not load the graph: {ws.loadError}</p>
				<button onclick={() => ws.load()}>Retry</button>
			</div>
		{:else}
			<div class="canvas-pane" class:alternate={ws.view !== 'canvas'} class:panel-left={leftPanel !== null} class:panel-right={rightPanel !== null}>
				{#if ws.view === 'canvas'}
					<Canvas />
				{:else if ws.view === 'outline'}
					<Outline />
				{:else}
					<Browse />
				{/if}
			</div>
		{/if}
	</main>
	<aside id="review-panel" class="floating-panel right-panel" hidden={!rightPanel} aria-label={rightPanel === 'inspector' ? 'Inspector' : 'Proposals'}>
		<button class="close-panel" aria-label="Close proposals and inspector" onclick={() => rightPanel = null}><Icon name="x" /></button>
		<div class="panel-content" hidden={rightPanel !== 'proposals'}><ProposalTray /></div>
		<div class="panel-content" hidden={rightPanel !== 'inspector'}><Inspector /></div>
		<PaneResizer bind:width={rightWidth} min={RIGHT_MIN} max={rightMax} side="right" reset={RIGHT_DEFAULT} label="Resize the proposals and inspector panel" />
	</aside>

	<ReentryPanel />
	<NewThought />
	<AppDialog />

	{#if ws.notice}
		<div class="toast" role="status">
			{ws.notice}
			<button class="dismiss" onclick={() => (ws.notice = null)} aria-label="Dismiss">
				<Icon name="x" />
			</button>
		</div>
	{/if}
</div>

<style>
	:global(html, body) {
		height: 100%;
	}
	:global(body) {
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		color: var(--ink);
		background: var(--paper);
	}
	.app { position: relative; height: 100dvh; overflow: hidden; }
	.workspace-bar { position: absolute; inset: 16px 16px auto; z-index: 30; display: flex; justify-content: space-between; gap: 16px; pointer-events: none; }
	.workspace-identity, .panel-switcher { pointer-events: auto; display: flex; align-items: center; gap: 4px; padding: 6px; background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-menu); min-width: 0; }
	.wordmark { color: var(--moss-ink); font-weight: 800; font-size: var(--fs-16); padding: 0 8px; }
	.panel-switcher button, summary { display: flex; align-items: center; gap: 6px; font: inherit; font-size: var(--fs-12); color: var(--ink-soft); border: 0; background: transparent; border-radius: 7px; padding: 8px 10px; cursor: pointer; white-space: nowrap; }
	.panel-switcher button:hover, summary:hover { background: var(--inset-fill); }
	.panel-switcher button.active { color: var(--blue); background: var(--blue-wash); }
	.panel-switcher button.pending { color: var(--gold-ink); }
	.badge { font-size: var(--fs-10); background: var(--inset-fill); border-radius: 999px; padding: 1px 5px; }
	.sets-menu { position: relative; min-width: 0; }
	summary { list-style: none; max-width: 220px; overflow: hidden; }
	summary::-webkit-details-marker { display: none; }
	.sets-popover { position: absolute; top: calc(100% + 14px); left: 0; width: min(480px, calc(100vw - 40px)); padding: 8px; background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-menu); }
	.tool-dock { position: absolute; bottom: 16px; left: 16px; right: 16px; margin-inline: auto; width: max-content; max-width: calc(100% - 32px); z-index: 35; }
	.load-state {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--ink-quiet);
		font-size: var(--fs-13);
	}
	.load-state.error {
		color: var(--rust);
	}
	.load-state button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
	}
	.load-state button:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.center { position: absolute; inset: 0; display: flex; flex-direction: column; min-width: 0; }
	.canvas-pane { flex: 1; min-height: 0; --focus-left: 16px; --focus-right: 16px; }
	.canvas-pane.panel-left { --focus-left: calc(var(--left-w) + 32px); }
	.canvas-pane.panel-right { --focus-right: calc(var(--right-w) + 32px); }
	/* Outline and Browse float over the canvas ground as a centered sheet,
	   matching the side panels' chrome instead of filling edge to edge. Unlike
	   the canvas, the sheet has content a panel would occlude, so open panels
	   claim their strip and the sheet re-centers in what remains: 50% - 550px
	   centers the 1100px cap, and the inset difference re-biases that center;
	   the max() stops the sheet at the panel edge once space runs out. */
	.canvas-pane.alternate {
		--sheet-left: 16px;
		--sheet-right: 16px;
		width: min(1100px, max(calc(100% - var(--sheet-left) - var(--sheet-right)), 260px));
		margin: 80px 0 80px max(var(--sheet-left), calc(50% - 550px + (var(--sheet-left) - var(--sheet-right)) / 2));
		background: var(--paper-panel);
		border: 1px solid var(--hairline);
		border-radius: 14px;
		box-shadow: var(--shadow-menu);
		overflow: hidden;
	}
	.canvas-pane.alternate.panel-left { --sheet-left: calc(var(--left-w) + 32px); }
	.canvas-pane.alternate.panel-right { --sheet-right: calc(var(--right-w) + 32px); }
	/* The canvas owns the viewport; panels never change its geometry. */
	.floating-panel { position: absolute; top: 80px; bottom: 144px; z-index: 25; background: var(--paper-panel); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-menu); }
	.left { left: 16px; width: var(--left-w); }
	.right-panel { right: 16px; width: var(--right-w); }
	.panel-content { height: 100%; overflow: auto; border-radius: inherit; }
	.panel-content[hidden], .floating-panel[hidden] { display: none; }
	.close-panel { position: absolute; top: 8px; right: 8px; z-index: 2; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: var(--paper-panel); color: var(--ink-muted); cursor: pointer; }
	.close-panel:hover { color: var(--ink); background: var(--inset-fill); }
	@media (max-width: 1000px) {
		.wordmark { display: none; }
		.workspace-bar { flex-wrap: wrap; gap: 8px; }
		.floating-panel { top: 128px; }
		.canvas-pane.alternate { margin-top: 128px; }
	}
	@media (max-width: 600px) {
		.workspace-bar { inset: 8px 8px auto; }
		.workspace-identity, .panel-switcher { max-width: 100%; }
		summary { max-width: 130px; }
		.panel-switcher { width: 100%; justify-content: space-between; }
		.panel-switcher button { padding: 8px 6px; font-size: var(--fs-11); }
		.left, .right-panel { left: 8px; right: 8px; width: auto; bottom: 232px; }
		/* Panels are full-width overlays here; yielding would crush the sheet. */
		.canvas-pane.alternate.panel-left, .canvas-pane.alternate.panel-right { --sheet-left: 16px; --sheet-right: 16px; }
		.tool-dock { bottom: 8px; max-width: calc(100% - 16px); }
	}
	.toast {
		position: fixed;
		bottom: 150px;
		z-index: 60;
		left: 50%;
		transform: translateX(-50%);
		background: var(--ink);
		color: var(--parchment);
		border-radius: 8px;
		padding: 10px 14px;
		font-size: var(--fs-13);
		display: flex;
		gap: 12px;
		align-items: center;
		box-shadow: var(--shadow-toast);
		max-width: 60ch;
	}
	.toast .dismiss {
		background: none;
		border: none;
		color: var(--parchment);
		cursor: pointer;
		font-size: var(--fs-12);
		padding: 0;
	}
</style>
