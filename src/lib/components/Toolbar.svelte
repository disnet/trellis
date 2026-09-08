<script lang="ts">
	import { workspace as ws } from '$lib/workspace.svelte';
	import type { AgentAction } from '$lib/types';
	import Icon from './Icon.svelte';
	import ModelSwitcher from './ModelSwitcher.svelte';
	import { appearance } from '$lib/appearance.svelte';
	let viewportWidth = $state(1440);
	const compact = $derived(viewportWidth < 1000 * appearance.fontScale);
	const operations: { action: AgentAction; label: string; hint: string }[] = [
		{ action: 'decompose', label: 'Decompose', hint: 'Split the selected thoughts into atomic thoughts' },
		{ action: 'develop', label: 'Develop', hint: 'Extend or refine the selected thoughts' },
		{ action: 'challenge', label: 'Challenge', hint: 'Propose objections and assumptions' },
		{ action: 'connect', label: 'Connect', hint: 'Find and link related thoughts' }
	];
	const activeGroup = $derived(ws.workingSets.find(group => group.id === ws.activeWorkingSetId));
	async function invoke(action: AgentAction) { const err = await ws.invoke(action); if (err) ws.notice = err; }
	async function undo() { const err = await ws.undoLast(); if (err) ws.notice = err; }
</script>

<svelte:window bind:innerWidth={viewportWidth} />
<div class="toolbar" class:compact aria-label="Thought actions" role="group">
	<div class="capture">
		<button class="new-note" disabled={ws.loading || !!ws.loadError} title="Jot a note on the canvas (N)" onclick={() => ws.compose()}><Icon name="plus" /> New note</button>
		<button class="undo" disabled={ws.undoLabel === null} aria-label="Undo last change" title={ws.undoLabel ?? 'Undo last change'} onclick={undo}><Icon name="undo" /></button>
	</div>
	<div class="agent">
		<div class="context">
			<span class="selection" aria-live="polite">
				{#if ws.invoking}Proposing…
				{:else if ws.selectedIds.length}{ws.selectedIds.length} thought{ws.selectedIds.length === 1 ? '' : 's'} selected
				{:else}Select thoughts to work with the agent{/if}
			</span>
			{#if activeGroup}<span class="group-context" title={'Agent context includes “' + activeGroup.name + '”'}>+ {activeGroup.name}</span>{/if}
		</div>
		<div class="operations" role="group" aria-label="Agent operations">
			{#each operations as { action, label, hint }}
				<button title={ws.selectedIds.length ? hint : 'Select one or more thoughts first'} class:busy={ws.invoking === action} disabled={ws.invoking !== null || ws.selectedIds.length === 0} onclick={() => invoke(action)}>{ws.invoking === action ? label + '…' : label}</button>
			{/each}
		</div>
	</div>
	<div class="model"><span class="model-label">Model</span><ModelSwitcher compact={viewportWidth < 480} /></div>
</div>

<style>
	.toolbar { box-sizing: border-box; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 16px; padding: 12px; border: 1px solid var(--hairline); border-radius: 14px; background: var(--paper-raised); box-shadow: var(--shadow-menu); }
	.capture { display: flex; align-items: center; gap: 4px; }
	button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 32px; padding: 4px 12px; white-space: nowrap; font: inherit; font-size: var(--fs-12); font-weight: 600; color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; cursor: pointer; }
	button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	button:disabled { opacity: .45; cursor: not-allowed; }
	button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	.undo { padding-inline: 8px; background: transparent; border-color: transparent; }
	.agent { display: flex; flex-direction: column; gap: 4px; padding-inline: 16px; border-inline: 1px solid var(--hairline); min-width: 0; }
	.context { display: flex; align-items: baseline; gap: 8px; font-size: var(--fs-11); color: var(--ink-muted); }
	.selection { white-space: nowrap; }
	.group-context { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.operations { display: flex; gap: 4px; }
	.model { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.model-label { font-size: var(--fs-11); color: var(--ink-muted); padding-left: 4px; }
	button.busy { opacity: 1; color: var(--blue); border-color: var(--blue); cursor: progress; }
	.toolbar.compact { gap: 8px; padding: 8px; flex-wrap: wrap; justify-content: center; }
	.compact .agent { order: 3; flex-basis: 100%; padding: 8px 0 0; border-inline: 0; border-top: 1px solid var(--hairline); }
	.compact .context, .compact .operations { justify-content: center; }
	.compact .model { margin-left: auto; }
	.compact .model-label { display: none; }
	.compact .operations button { flex: 1; padding-inline: 8px; }
	@media (max-width: 480px) { .context { flex-wrap: wrap; gap: 4px; } .selection { white-space: normal; } .operations { flex-wrap: wrap; } .operations button { flex-basis: calc(50% - 4px); } }
</style>
