<script lang="ts">
	import { browser } from '$app/environment';
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Browse from '$lib/components/Browse.svelte';
	import Icon from '$lib/components/Icon.svelte';
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

	// Each sidebar may take at most what the other one and the centre leave behind,
	// so a narrow window can never squeeze the canvas out of existence.
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
	<Toolbar />

	<aside class="left">
		<div class="scratch-pane"><Scratch /></div>
		<div class="library-pane"><Library /></div>
		<PaneResizer
			bind:width={leftWidth}
			min={LEFT_MIN}
			max={leftMax}
			side="left"
			reset={LEFT_DEFAULT}
			label="Resize the scratch and library sidebar"
		/>
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
			<WorkingSetTabs />
			<div class="canvas-pane">
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
	<aside class="right-panel">
		<div class="tray-pane"><ProposalTray /></div>
		<div class="inspector-pane"><Inspector /></div>
		<PaneResizer
			bind:width={rightWidth}
			min={RIGHT_MIN}
			max={rightMax}
			side="right"
			reset={RIGHT_DEFAULT}
			label="Resize the proposals and inspector sidebar"
		/>
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
	.app {
		display: grid;
		grid-template-areas:
			'toolbar toolbar toolbar'
			'left center right';
		grid-template-columns: var(--left-w) 1fr var(--right-w);
		grid-template-rows: auto minmax(0, 1fr);
		height: 100vh;
	}
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
	.left {
		grid-area: left;
		background: var(--paper-panel);
		border-right: 1px solid var(--hairline);
		min-height: 0;
		display: grid;
		grid-template-rows: minmax(0, 55%) minmax(0, 45%);
		/* Anchors the resize handle, and keeps it above the centre column. */
		position: relative;
		z-index: 1;
	}
	.scratch-pane {
		border-bottom: 1px solid var(--hairline);
		min-height: 0;
		/* min-width guards against grid min-content blowout from nowrap content
		   (e.g. long pinned-thought titles), which would widen the whole column. */
		min-width: 0;
	}
	.library-pane {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.center {
		grid-area: center;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.canvas-pane {
		flex: 1;
		min-height: 0;
	}
	.right-panel {
		grid-area: right;
		background: var(--paper-panel);
		border-left: 1px solid var(--hairline);
		display: grid;
		grid-template-rows: minmax(0, 58%) minmax(0, 42%);
		min-height: 0;
		position: relative;
		z-index: 1;
	}
	.tray-pane {
		border-bottom: 1px solid var(--hairline);
		min-height: 0;
	}
	.inspector-pane {
		min-height: 0;
	}
	.toast {
		position: fixed;
		bottom: 18px;
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
