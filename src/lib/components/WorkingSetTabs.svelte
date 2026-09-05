<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';

	const ws = workspace;

	let renamingId = $state<string | null>(null);
	let renameDraft = $state('');
	let renameInput = $state<HTMLInputElement>();

	async function run(fn: () => Promise<string | null>) {
		const err = await fn();
		if (err) ws.notice = err;
	}

	function startRename(id: string, currentName: string) {
		renamingId = id;
		renameDraft = currentName;
	}

	$effect(() => {
		if (renamingId) renameInput?.select();
	});

	async function commitRename() {
		const id = renamingId;
		renamingId = null;
		if (!id) return;
		const current = ws.workingSets.find((s) => s.id === id);
		if (!current || renameDraft.trim() === '' || renameDraft.trim() === current.name) return;
		await run(() => ws.renameSet(id, renameDraft));
	}

	async function remove(id: string, name: string) {
		const ok = await dialogs.confirm(
			`Delete working set “${name}”? Thoughts and relations stay in the graph.`,
			'Delete set'
		);
		if (!ok) return;
		await run(() => ws.deleteSet(id));
	}
</script>

<div class="tabs" role="tablist" aria-label="Working sets">
	{#each ws.workingSets as set (set.id)}
		{@const active = set.id === ws.activeWorkingSetId}
		{#if renamingId === set.id}
			<form
				class="tab renaming"
				onsubmit={(e) => {
					e.preventDefault();
					commitRename();
				}}
			>
				<input
					bind:this={renameInput}
					bind:value={renameDraft}
					onblur={commitRename}
					onkeydown={(e) => {
						if (e.key === 'Escape') renamingId = null;
					}}
					aria-label="Rename working set"
					maxlength="40"
				/>
			</form>
		{:else}
			<div class="tab" class:active>
				<button
					class="tab-name"
					role="tab"
					aria-selected={active}
					title={active ? 'Double-click to rename' : `Switch to “${set.name}”`}
					onclick={() => run(() => ws.switchSet(set.id))}
					ondblclick={() => startRename(set.id, set.name)}
				>
					{set.name}
					<span class="count">{set.size}</span>
				</button>
				{#if active && ws.workingSets.length > 1}
					<button
						class="close"
						title="Delete this working set (thoughts stay in the graph)"
						aria-label="Delete working set “{set.name}”"
						onclick={() => remove(set.id, set.name)}
					><Icon name="x" size="0.9em" /></button>
				{/if}
			</div>
		{/if}
	{/each}
	<button class="new-tab" title="New working set" onclick={() => run(() => ws.createSet())}>
		+ New set
	</button>
</div>

<style>
	.tabs {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		background: transparent;
		border-bottom: none;
		overflow-x: auto;
		flex-shrink: 0;
	}
	.tab {
		display: flex;
		align-items: center;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--inset-fill);
		max-width: 220px;
	}
	.tab.active {
		background: var(--paper);
		border-color: var(--card-border);

	}
	.tab-name {
		font: inherit;
		font-size: var(--fs-12);
		color: var(--ink-muted);
		background: none;
		border: none;
		padding: 5px 10px;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.tab.active .tab-name {
		color: var(--ink);
		font-weight: 600;
	}
	.count {
		font-size: var(--fs-10);
		font-weight: 400;
		color: var(--ink-quiet);
		background: var(--hairline);
		border-radius: 999px;
		padding: 0 6px;
	}
	.close {
		border: none;
		background: none;
		font-size: var(--fs-10);
		color: var(--ink-quiet);
		cursor: pointer;
		padding: 2px 8px 2px 0;
		line-height: 1;
	}
	.close:hover {
		color: var(--rust);
	}
	.tab.renaming {
		margin: 0;
		padding: 3px 6px;
	}
	.tab.renaming input {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--blue);
		border-radius: 4px;
		padding: 2px 6px;
		width: 130px;
		background: var(--paper-raised);
		color: var(--ink);
	}
	.new-tab {
		font: inherit;
		font-size: var(--fs-11-5);
		color: var(--ink-muted);
		background: none;
		border: 1px dashed var(--card-border);
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
		white-space: nowrap;
	}
	.new-tab:hover {
		color: var(--blue);
		border-color: var(--blue);
	}
</style>
