<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';

	const ws = workspace;

	/** Narrows the graph name when the toolbar is short of room. */
	let { compact = false }: { compact?: boolean } = $props();

	async function run(fn: () => Promise<string | null>) {
		const err = await fn();
		if (err) ws.notice = err;
	}

	async function onSelect(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		const graphId = select.value;
		await run(() => ws.switchGraph(graphId));
		// If the switch failed, snap the control back to reality.
		select.value = ws.activeGraphId;
	}

	async function create() {
		const name = await dialogs.prompt(
			'Name for the new graph — a separate, isolated knowledge base:',
			'',
			'Create graph'
		);
		if (name === null || name.trim() === '') return;
		void run(() => ws.createGraph(name));
	}

	async function rename() {
		const current = ws.graphs.find((g) => g.id === ws.activeGraphId);
		if (!current) return;
		const name = await dialogs.prompt('Rename this graph:', current.name, 'Rename');
		if (name === null || name.trim() === '' || name.trim() === current.name) return;
		void run(() => ws.renameGraph(current.id, name));
	}
</script>

<div
	class="graph-switcher"
	title="Graphs are isolated knowledge bases — search, Connect, and agent context never cross between them"
>
	<select class:compact aria-label="Active graph" value={ws.activeGraphId} onchange={onSelect}>
		{#each ws.graphs as g (g.id)}
			<option value={g.id}>{g.name}</option>
		{/each}
	</select>
	<button title="Rename this graph" aria-label="Rename this graph" onclick={rename}>
		<Icon name="pencil" />
	</button>
	<button
		title="New graph — a separate, isolated knowledge base"
		aria-label="New graph"
		onclick={create}
	><Icon name="plus" /></button>
</div>

<style>
	.graph-switcher {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	select {
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink-soft);
		background: var(--card-white);
		border: 1px solid var(--card-border);
		border-radius: 6px;
		padding: 4px 6px;
		max-width: 160px;
		cursor: pointer;
	}
	select.compact {
		max-width: 110px;
	}
	select:hover {
		border-color: var(--blue);
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 4px 8px;
		cursor: pointer;
		color: var(--ink-soft);
		line-height: 1.2;
	}
	button:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
</style>
