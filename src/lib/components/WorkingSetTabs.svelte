<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';

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
		if (!confirm(`Delete working set “${name}”? Thoughts and relations stay in the graph.`)) return;
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
					>✕</button>
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
		align-items: flex-end;
		gap: 4px;
		padding: 6px 10px 0;
		background: #efebe1;
		border-bottom: 1px solid #e0dbcf;
		overflow-x: auto;
		flex-shrink: 0;
	}
	.tab {
		display: flex;
		align-items: center;
		border: 1px solid #d5d0c4;
		border-bottom: none;
		border-radius: 7px 7px 0 0;
		background: #f4f0e6;
		max-width: 220px;
	}
	.tab.active {
		background: #f6f3ec;
		border-color: #c9c4b8;
		/* Blend into the canvas below. */
		margin-bottom: -1px;
		padding-bottom: 1px;
	}
	.tab-name {
		font: inherit;
		font-size: var(--fs-12);
		color: #6d675c;
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
		color: #2c2921;
		font-weight: 600;
	}
	.count {
		font-size: var(--fs-10);
		font-weight: 400;
		color: #8a8375;
		background: #e7e2d5;
		border-radius: 999px;
		padding: 0 6px;
	}
	.tab.active .count {
		background: #e0dbcf;
	}
	.close {
		border: none;
		background: none;
		font-size: var(--fs-10);
		color: #8a8375;
		cursor: pointer;
		padding: 2px 8px 2px 0;
		line-height: 1;
	}
	.close:hover {
		color: #8a3a2a;
	}
	.tab.renaming {
		margin: 0;
		padding: 3px 6px;
	}
	.tab.renaming input {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid #3b5bdb;
		border-radius: 4px;
		padding: 2px 6px;
		width: 130px;
		background: #fffdf8;
		color: #2c2921;
	}
	.new-tab {
		font: inherit;
		font-size: var(--fs-11-5);
		color: #6d675c;
		background: none;
		border: 1px dashed #c9c4b8;
		border-bottom: none;
		border-radius: 7px 7px 0 0;
		padding: 5px 10px;
		cursor: pointer;
		white-space: nowrap;
	}
	.new-tab:hover {
		color: #3b5bdb;
		border-color: #3b5bdb;
	}
</style>
