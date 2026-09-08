<script lang="ts">
	import { workspace as ws } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';
	const views = [
		{ id: 'canvas', label: 'Canvas', icon: 'canvas', hint: 'Your whole graph, spatially' },
		{ id: 'outline', label: 'Outline', icon: 'outline', hint: 'Read thoughts as an outline' },
		{ id: 'browse', label: 'Browse', icon: 'browse', hint: 'Sort and filter thoughts' },
		{ id: 'prose', label: 'Prose', icon: null, hint: 'Read a group as prose' }
	] as const;
</script>

<nav class="views" aria-label="Thought views">
	{#each views as view}
		<button class:active={ws.view === view.id} aria-pressed={ws.view === view.id} aria-label={view.label} title={view.hint} onclick={() => ws.view = view.id}>
			{#if view.icon}<Icon name={view.icon} />{:else}<span aria-hidden="true">¶</span>{/if}
			<span>{view.label}</span>
		</button>
	{/each}
	{#if ws.view === 'outline' || ws.view === 'browse'}
		<select aria-label="Thought detail" value={ws.zoom} onchange={(event) => ws.zoom = event.currentTarget.value as 'overview' | 'reading'}>
			<option value="overview">Titles</option>
			<option value="reading">Full statements</option>
		</select>
	{/if}
</nav>

<style>
	.views { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
	select { max-width: 160px; font: inherit; font-size: var(--fs-12); padding: 4px; min-height: 32px; margin-left: 4px; border: 1px solid var(--control-border); border-radius: 6px; color: var(--ink-soft); background: var(--card-white); }
	button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 32px; padding: 4px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink-muted); font: inherit; font-size: var(--fs-12); cursor: pointer; }
	button:hover { color: var(--blue); background: var(--inset-fill); }
	button.active { color: var(--ink); background: var(--card-white); border-color: var(--card-border); font-weight: 600; }
	button:focus-visible, select:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	@media (max-width: 600px) { button { padding: 4px 8px; gap: 4px; } }
</style>
