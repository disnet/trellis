<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';
	import ControlPopover from './ControlPopover.svelte';

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
	<span class="scope-label">Graph</span>
	<select class:compact aria-label="Active graph" value={ws.activeGraphId} onchange={onSelect}>
		{#each ws.graphs as g (g.id)}
			<option value={g.id}>{g.name}</option>
		{/each}
	</select>
	<ControlPopover label="Graph actions" width={240} chevron={false}>
		{#snippet trigger()}<Icon name="ellipsis" />{/snippet}
		{#snippet children(close)}
			<div class="menu-heading">Graph actions</div>
			<button class="action" onclick={() => { close(); create(); }}><Icon name="plus" /> New graph…</button>
			<button class="action" onclick={() => { close(); rename(); }}><Icon name="pencil" /> Rename graph…</button>
			<a class="action" href="/api/export" download onclick={close}><Icon name="download" /> Export graph</a>
			<a class="action" href="/publish" onclick={close}><Icon name="upload" /> Publish garden…</a>
		{/snippet}
	</ControlPopover>
</div>

<style>
	.graph-switcher {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.scope-label { color: var(--ink-muted); font-size: var(--fs-11); padding-left: 8px; }
	select {
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink-soft);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 4px;
		min-height: 32px;
		max-width: 160px;
		cursor: pointer;
	}
	select.compact {
		max-width: 110px;
	}
	select:hover {
		border-color: var(--blue);
	}
	.action {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		text-decoration: none;
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid transparent;
		background: transparent;
		border-radius: 6px;
		padding: 8px;
		min-height: 36px;
		cursor: pointer;
		color: var(--ink-soft);
		line-height: 1.2;
	}
	.action:hover {
		background: var(--inset-fill);
		color: var(--blue);
	}
	.menu-heading { padding: 8px; color: var(--ink-muted); font-size: var(--fs-11); font-weight: 600; }
	.action:focus-visible, select:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
	@media (max-width: 600px) { .scope-label { display: none; } }
</style>
