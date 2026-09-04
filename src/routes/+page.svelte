<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import Inspector from '$lib/components/Inspector.svelte';
	import Library from '$lib/components/Library.svelte';
	import ProposalTray from '$lib/components/ProposalTray.svelte';
	import ReentryPanel from '$lib/components/ReentryPanel.svelte';
	import Scratch from '$lib/components/Scratch.svelte';
	import WorkingSetTabs from '$lib/components/WorkingSetTabs.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import type { AgentAction } from '$lib/types';

	const ws = workspace;

	const operations: { action: AgentAction; label: string; hint: string }[] = [
		{ action: 'decompose', label: 'Decompose', hint: 'Split into atomic thoughts' },
		{ action: 'develop', label: 'Develop', hint: 'Extend or refine the selection' },
		{ action: 'challenge', label: 'Challenge', hint: 'Propose objections and assumptions' },
		{ action: 'connect', label: 'Connect', hint: 'Find and link related thoughts' }
	];

	async function invoke(action: AgentAction) {
		const err = await ws.invoke(action);
		if (err) ws.notice = err;
	}

	async function undo() {
		const err = await ws.undoLastApply();
		if (err) ws.notice = err;
	}

	async function startFresh() {
		if (!confirm('Empty this working set? Thoughts and relations stay in the graph.')) return;
		const err = await ws.startFresh();
		if (err) ws.notice = err;
	}

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

<div class="app">
	<header class="toolbar">
		<span class="logo">Trellis</span>
		<div class="ops" role="group" aria-label="Agent operations">
			{#each operations as { action, label, hint } (action)}
				<button
					title={hint}
					class:busy={ws.invoking === action}
					disabled={ws.invoking !== null ||
						(ws.selectedIds.length === 0 &&
							!(action === 'decompose' && ws.scratchDraft.trim().length > 0))}
					onclick={() => invoke(action)}
				>
					{ws.invoking === action ? `${label}…` : label}
				</button>
			{/each}
		</div>
		<span class="selection-hint" aria-live="polite">
			{#if ws.invoking}
				{ws.invoking === 'decompose' && ws.scratchDraft.trim().length > 0
					? 'Proposing from scratch and the working set…'
					: `Proposing from ${ws.selectedIds.length} selected thought${ws.selectedIds.length === 1 ? '' : 's'} and the working set…`}
			{:else if ws.selectedIds.length > 0}
				{ws.selectedIds.length} selected — operations use the selection plus the working set
			{:else}
				Click a card to select · shift-click for multiple
			{/if}
		</span>
		<div class="right">
			<button
				class="zoom"
				onclick={() => (ws.zoom = ws.zoom === 'overview' ? 'reading' : 'overview')}
			>
				{ws.zoom === 'overview' ? '⊕ Reading view' : '⊖ Overview'}
			</button>
			<button
				title="Re-lay out the canvas; related cards end up together"
				disabled={ws.workingSet.length === 0}
				onclick={() => ws.arrange()}
			>
				⌗ Arrange
			</button>
			<button
				title="Empty the working set — the durable graph is untouched"
				disabled={ws.workingSet.length === 0}
				onclick={startFresh}
			>
				⌀ Start fresh
			</button>
			<button class="undo" disabled={ws.undoLabel === null} title={ws.undoLabel ?? ''} onclick={undo}>
				↩ Undo last apply
			</button>
			<a class="export" href="/api/export" download title="Download the full graph as JSON">
				⇩ Export
			</a>
		</div>
	</header>

	<aside class="left">
		<div class="scratch-pane"><Scratch /></div>
		<div class="library-pane"><Library /></div>
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
			<div class="canvas-pane"><Canvas /></div>
		{/if}
	</main>
	<aside class="right-panel">
		<div class="tray-pane"><ProposalTray /></div>
		<div class="inspector-pane"><Inspector /></div>
	</aside>

	<ReentryPanel />

	{#if ws.notice}
		<div class="toast" role="status">
			{ws.notice}
			<button class="dismiss" onclick={() => (ws.notice = null)} aria-label="Dismiss">✕</button>
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
		color: #2c2921;
		background: #f6f3ec;
	}
	.app {
		display: grid;
		grid-template-areas:
			'toolbar toolbar toolbar'
			'left center right';
		grid-template-columns: 270px 1fr 400px;
		grid-template-rows: 48px 1fr;
		height: 100vh;
	}
	.toolbar {
		grid-area: toolbar;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 14px;
		background: #fffdf8;
		border-bottom: 1px solid #e0dbcf;
	}
	.logo {
		font-weight: 800;
		letter-spacing: 0.02em;
		font-size: 16px;
		color: #3d5537;
	}
	.ops {
		display: flex;
		gap: 6px;
	}
	.ops button {
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		border: 1px solid #c9c4b8;
		background: #fff;
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
		color: #4d473c;
	}
	.ops button:hover:not(:disabled) {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.ops button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.ops button.busy {
		opacity: 1;
		border-color: #3b5bdb;
		color: #3b5bdb;
		cursor: progress;
		animation: busy-pulse 1.2s ease-in-out infinite;
	}
	@keyframes busy-pulse {
		50% {
			opacity: 0.55;
		}
	}
	.selection-hint {
		font-size: 11.5px;
		color: #8a8375;
		flex: 1;
	}
	.right {
		display: flex;
		gap: 6px;
	}
	.right button {
		font: inherit;
		font-size: 12px;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
		color: #4d473c;
	}
	.right button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.export {
		font-size: 12px;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 5px 10px;
		color: #4d473c;
		text-decoration: none;
	}
	.export:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.load-state {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #8a8375;
		font-size: 13px;
	}
	.load-state.error {
		color: #8a3a2a;
	}
	.load-state button {
		font: inherit;
		font-size: 12px;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
	}
	.left {
		grid-area: left;
		background: #fbf9f3;
		border-right: 1px solid #e0dbcf;
		min-height: 0;
		display: grid;
		grid-template-rows: minmax(0, 55%) minmax(0, 45%);
	}
	.scratch-pane {
		border-bottom: 1px solid #e0dbcf;
		min-height: 0;
	}
	.library-pane {
		min-height: 0;
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
		background: #fbf9f3;
		border-left: 1px solid #e0dbcf;
		display: grid;
		grid-template-rows: minmax(0, 58%) minmax(0, 42%);
		min-height: 0;
	}
	.tray-pane {
		border-bottom: 1px solid #e0dbcf;
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
		background: #2c2921;
		color: #fdf8ec;
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
		display: flex;
		gap: 12px;
		align-items: center;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		max-width: 60ch;
	}
	.toast .dismiss {
		background: none;
		border: none;
		color: #fdf8ec;
		cursor: pointer;
		font-size: 12px;
		padding: 0;
	}
</style>
