<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';

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

	function create() {
		const name = prompt('Name for the new graph:');
		if (name === null) return;
		void run(() => ws.createGraph(name));
	}

	function rename() {
		const current = ws.graphs.find((g) => g.id === ws.activeGraphId);
		if (!current) return;
		const name = prompt('Rename this graph:', current.name);
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
	<button title="Rename this graph" aria-label="Rename this graph" onclick={rename}>✎</button>
	<button
		title="New graph — a separate, isolated knowledge base"
		aria-label="New graph"
		onclick={create}
	>＋</button>
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
		color: #4d473c;
		background: #fff;
		border: 1px solid #c9c4b8;
		border-radius: 6px;
		padding: 4px 6px;
		max-width: 160px;
		cursor: pointer;
	}
	select.compact {
		max-width: 110px;
	}
	select:hover {
		border-color: #3b5bdb;
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 4px 8px;
		cursor: pointer;
		color: #4d473c;
		line-height: 1.2;
	}
	button:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
</style>
