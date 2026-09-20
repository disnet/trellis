<script lang="ts">
	import { browser } from '$app/environment';
	import ActivityLog from '$lib/components/ActivityLog.svelte';
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Browse from '$lib/components/Browse.svelte';
	import Prose from '$lib/components/Prose.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import GraphSwitcher from '$lib/components/GraphSwitcher.svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Inspector from '$lib/components/Inspector.svelte';
	import Outline from '$lib/components/Outline.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import QuickSearch from '$lib/components/QuickSearch.svelte';
	import ProposalTray from '$lib/components/ProposalTray.svelte';
	import ReentryPanel from '$lib/components/ReentryPanel.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import GroupSwitcher from '$lib/components/GroupSwitcher.svelte';
	import ViewSwitcher from '$lib/components/ViewSwitcher.svelte';
	import AppearanceMenu from '$lib/components/AppearanceMenu.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const ws = workspace;
	let workspaceBarHeight = $state(48);
	let dockHeight = $state(80);
	let rightPanel = $state<'proposals' | 'inspector' | null>(null);
	let quickSearchOpen = $state(false);
	let previousPending = 0;
	$effect(() => {
		const count = ws.pendingChangeSets.length;
		if (count > previousPending) rightPanel = 'proposals';
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
			} else if (rightPanel === 'inspector') {
				rightPanel = null;
			}
		}
		previousSelection = ids;
	});
	// Picking a proposal on the canvas is a request to read it: the panel comes to
	// the front, and the tray scrolls itself to that operation.
	let previousReveal = 0;
	$effect(() => {
		if (ws.proposalReveal !== previousReveal && ws.selectedProposalId) rightPanel = 'proposals';
		previousReveal = ws.proposalReveal;
	});
	// The other direction — following a thought out of the tray to its place on
	// the canvas — is still about the proposals. It selects the thought, which
	// would otherwise swap the tray for the inspector mid-review, so this runs
	// after that rule and keeps the tray up.
	let previousCanvasReveal = 0;
	$effect(() => {
		const n = ws.canvasReveal?.n ?? 0;
		if (n !== previousCanvasReveal) rightPanel = 'proposals';
		previousCanvasReveal = n;
	});
	// Activity is a tool, not a view you navigate between: it takes over the
	// center, so it has to give the center back. Remember where it was opened
	// from, and let both the toolbar button and the log's own header return there.
	type ThoughtView = 'canvas' | 'outline' | 'browse' | 'prose';
	const VIEW_NAMES: Record<ThoughtView, string> = { canvas: 'Canvas', outline: 'Outline', browse: 'Browse', prose: 'Prose' };
	let lastThoughtView = $state<ThoughtView>('canvas');
	$effect(() => {
		if (ws.view !== 'log') lastThoughtView = ws.view;
	});
	function closeActivity() { ws.view = lastThoughtView; }
	function toggleActivity() { ws.view = ws.view === 'log' ? lastThoughtView : 'log'; }

	function toggleRight(panel: 'proposals' | 'inspector') {
		rightPanel = rightPanel === panel ? null : panel;
	}

	// --- sidebar width (view-only, per-browser) ---
	const RIGHT_DEFAULT = 400;
	const RIGHT_MIN = 260;
	const CENTER_MIN = 360;
	const STORAGE_KEY = 'trellis:sidebar-widths';

	function restored(): { right: number } {
		if (!browser) return { right: RIGHT_DEFAULT };
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) throw new Error('none');
			const saved = JSON.parse(raw);
			return { right: typeof saved.right === 'number' ? saved.right : RIGHT_DEFAULT };
		} catch {
			return { right: RIGHT_DEFAULT };
		}
	}

	let rightWidth = $state(restored().right);
	let viewportWidth = $state(browser ? window.innerWidth : 1440);

	// Limit the floating panel so a useful strip of canvas remains beside it.
	const clamp = (w: number, min: number, max: number) => Math.min(Math.max(w, min), max);
	const rightMax = $derived(Math.max(RIGHT_MIN, viewportWidth - CENTER_MIN));
	const right = $derived(clamp(rightWidth, RIGHT_MIN, rightMax));

	// Persist what was actually dragged, not the window-clamped value — a stint in
	// a narrow window shouldn't forget the layout chosen in a wide one.
	$effect(() => {
		const widths = JSON.stringify({ right: rightWidth });
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

<svelte:window
	bind:innerWidth={viewportWidth}
	onkeydown={(e) => {
		if (
			(e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' &&
			!ws.loading && !ws.loadError
		) {
			e.preventDefault();
			quickSearchOpen = !quickSearchOpen;
		}
	}}
/>

<div class="app" style="--right-w: {right}px; --workspace-top: {workspaceBarHeight + 32}px; --dock-space: {dockHeight + 32}px">
	<div class="workspace-bar" bind:clientHeight={workspaceBarHeight}>
		<div class="workspace-identity">
			<span class="wordmark">Trellis</span>
			{#if !ws.loading && !ws.loadError}
				<GraphSwitcher compact={viewportWidth < 1000} />
				<span class="scope-divider" aria-hidden="true">/</span>
				<GroupSwitcher />
			{/if}
		</div>
		<div class="view-navigation"><ViewSwitcher /></div>
		<nav class="panel-switcher" aria-label="Workspace panels and settings">
			<button aria-haspopup="dialog" title="Search the graph or brief the agent (⌘K)" onclick={() => (quickSearchOpen = true)}><Icon name="search" /> Search</button>
			<button class:active={rightPanel === 'proposals'} class:pending={ws.pendingChangeSets.length > 0} aria-expanded={rightPanel === 'proposals'} aria-controls="review-panel" onclick={() => toggleRight('proposals')}>◇ Proposals{#if ws.pendingChangeSets.length} <span class="badge">{ws.pendingChangeSets.length}</span>{/if}</button>
			<button class:active={rightPanel === 'inspector'} aria-expanded={rightPanel === 'inspector'} aria-controls="review-panel" onclick={() => toggleRight('inspector')}><Icon name="outline" /> Inspector{#if ws.selectedIds.length} <span class="badge">{ws.selectedIds.length}</span>{/if}</button>
			<div class="app-tools">
				<button class:active={ws.view === 'log'} aria-label="Activity" aria-pressed={ws.view === 'log'} title={ws.view === 'log' ? `Close activity and return to ${VIEW_NAMES[lastThoughtView]}` : 'Agent activity'} onclick={toggleActivity}><Icon name="activity" /></button>
				<AppearanceMenu />
			</div>
		</nav>
	</div>
	<div class="tool-dock" bind:clientHeight={dockHeight}><Toolbar /></div>
	<main class="center">
		{#if ws.loading}
			<div class="load-state">Loading the graph…</div>
		{:else if ws.loadError}
			<div class="load-state error">
				<p>Could not load the graph: {ws.loadError}</p>
				<button onclick={() => ws.load()}>Retry</button>
			</div>
		{:else}
			<div class="canvas-pane" class:alternate={ws.view !== 'canvas'} class:panel-right={rightPanel !== null}>
				{#if ws.view === 'canvas'}
					<Canvas />
				{:else if ws.view === 'outline'}
					<Outline />
				{:else if ws.view === 'prose'}
					<Prose />
				{:else if ws.view === 'log'}
					<ActivityLog onclose={closeActivity} backLabel={VIEW_NAMES[lastThoughtView]} />
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
	<QuickSearch bind:open={quickSearchOpen} />
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
	.workspace-bar { position: absolute; inset: 16px 16px auto; z-index: 40; display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 16px; pointer-events: none; }
	.workspace-identity, .panel-switcher, .view-navigation { pointer-events: auto; display: flex; align-items: center; gap: 4px; padding: 6px; background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-menu); min-width: 0; }
	.scope-divider { color: var(--card-border); padding-inline: 4px; }
	.app-tools { display: flex; align-items: center; gap: 4px; padding-left: 8px; margin-left: 4px; border-left: 1px solid var(--hairline); }
	.panel-switcher { margin-left: auto; }
	.wordmark { color: var(--moss-ink); font-weight: 800; font-size: var(--fs-16); padding: 0 8px; }
	.panel-switcher button { display: flex; align-items: center; gap: 4px; min-height: 32px; font: inherit; font-size: var(--fs-12); color: var(--ink-soft); border: 0; background: transparent; border-radius: 6px; padding: 4px 8px; cursor: pointer; white-space: nowrap; }
	.panel-switcher button:hover { background: var(--inset-fill); }
	.panel-switcher button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	.panel-switcher button.active { color: var(--blue); background: var(--blue-wash); }
	.panel-switcher button.pending { color: var(--gold-ink); }
	.badge { font-size: var(--fs-10); background: var(--inset-fill); border-radius: 999px; padding: 1px 5px; }
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
	.canvas-pane.panel-right { --focus-right: calc(var(--right-w) + 32px); }
	/* Outline and Browse float over the canvas ground as a centered sheet,
	   matching the side panel's chrome instead of filling edge to edge. Unlike
	   the canvas, the sheet has content a panel would occlude, so an open panel
	   claims its strip and the sheet re-centers in what remains: 50% - 550px
	   centers the 1100px cap, and the inset difference re-biases that center;
	   the max() stops the sheet at the panel edge once space runs out. */
	.canvas-pane.alternate {
		--sheet-left: 16px;
		--sheet-right: 16px;
		width: min(1100px, max(calc(100% - var(--sheet-left) - var(--sheet-right)), 260px));
		margin: var(--workspace-top) 0 var(--dock-space) max(var(--sheet-left), calc(50% - 550px + (var(--sheet-left) - var(--sheet-right)) / 2));
		background: var(--paper-panel);
		border: 1px solid var(--hairline);
		border-radius: 14px;
		box-shadow: var(--shadow-menu);
		overflow: hidden;
	}
	.canvas-pane.alternate.panel-right { --sheet-right: calc(var(--right-w) + 32px); }
	/* The canvas owns the viewport; panels never change its geometry. */
	.floating-panel { position: absolute; top: var(--workspace-top); bottom: calc(var(--dock-space) + 64px); z-index: 25; background: var(--paper-panel); border: 1px solid var(--hairline); border-radius: 12px; box-shadow: var(--shadow-menu); }
	.right-panel { right: 16px; width: var(--right-w); }
	.panel-content { height: 100%; overflow: auto; border-radius: inherit; }
	.panel-content[hidden], .floating-panel[hidden] { display: none; }
	.close-panel { position: absolute; top: 8px; right: 8px; z-index: 2; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: var(--paper-panel); color: var(--ink-muted); cursor: pointer; }
	.close-panel:hover { color: var(--ink); background: var(--inset-fill); }
	@media (max-width: 1300px) {
		.wordmark { display: none; }
		.workspace-bar { flex-wrap: wrap; gap: 8px; }
		.view-navigation { order: 3; }
	}
	@media (max-width: 600px) {
		.workspace-bar { inset: 8px 8px auto; }
		.workspace-identity, .panel-switcher { max-width: 100%; }
		.panel-switcher { width: 100%; justify-content: space-between; }
		.panel-switcher button { padding: 8px 6px; font-size: var(--fs-11); }
		.right-panel { left: 8px; right: 8px; width: auto; }
		/* The panel is a full-width overlay here; yielding would crush the sheet. */
		.canvas-pane.alternate.panel-right { --sheet-left: 16px; --sheet-right: 16px; }
		.tool-dock { bottom: 8px; left: 8px; right: 8px; max-width: calc(100% - 16px); }
	}
	.toast {
		position: fixed;
		bottom: calc(var(--dock-space) + 64px);
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
