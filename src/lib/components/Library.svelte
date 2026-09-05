<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';

	const ws = workspace;

	let query = $state('');

	// With no query, browse the whole graph, most recently updated first.
	const results = $derived(
		query.trim().length > 0
			? ws.searchGraph(query)
			: Object.values(ws.thoughts).sort((a, b) => b.updatedAt - a.updatedAt)
	);
	const totalThoughts = $derived(Object.keys(ws.thoughts).length);

	// Pinned rail (Phase 6): the graph's landmarks, oldest pin first.
	const pinned = $derived(
		ws.pinnedThoughtIds.map((id) => ws.thoughts[id]).filter((t) => t !== undefined)
	);

	async function run(fn: () => Promise<string | null>) {
		const err = await fn();
		if (err) ws.notice = err;
	}

	async function add(thoughtId: string) {
		const err = await ws.addToSet([thoughtId]);
		if (err) ws.notice = err;
	}

	function locate(thoughtId: string) {
		ws.select(thoughtId);
	}
</script>

<section class="library">
	<h2>Library</h2>
	<p class="hint">
		{totalThoughts} thought{totalThoughts === 1 ? '' : 's'} in the graph ·
		{ws.workingSet.length} in this set
	</p>
	{#if pinned.length > 0}
		<div class="pinned-rail" aria-label="Pinned thoughts">
			<h3>⚑ Pinned</h3>
			<ul class="pins">
				{#each pinned as t (t.id)}
					<li>
						<button class="pin-title" title="Select “{t.title}”" onclick={() => locate(t.id)}>
							{t.title}
						</button>
						<button
							class="pin-open"
							title="Open a new working set with this thought and its neighbors"
							onclick={() => run(() => ws.openNeighborhood(t.id))}
						>⌾ open</button>
						<button
							class="unpin"
							title="Unpin"
							aria-label="Unpin “{t.title}”"
							onclick={() => run(() => ws.togglePin(t.id))}
						>✕</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	<input
		type="search"
		placeholder="Search titles and statements…"
		bind:value={query}
		aria-label="Search the full graph"
	/>
	{#if results.length === 0}
		<p class="hint">No thoughts match.</p>
	{:else}
		<ul class="results">
			{#each results as t (t.id)}
				{@const inSet = ws.inWorkingSet(t.id)}
				<li>
					<div class="result-main">
						<span class="type type-{t.type}">{t.type}</span>
						{#if ws.isPinned(t.id)}<span class="pin-mark" title="Pinned">⚑</span>{/if}
						<span class="title">{t.title}</span>
					</div>
					<div class="result-actions">
						<span class="status">{t.status}</span>
						{#if inSet}
							<button class="link" onclick={() => locate(t.id)}>select</button>
							<span class="in-set">in set</span>
						{:else}
							<button class="add" onclick={() => add(t.id)}>+ add to set</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.library {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		box-sizing: border-box;
		height: 100%;
		overflow: hidden;
	}
	h2 {
		margin: 0;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6d675c;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		color: #8a8375;
		line-height: 1.4;
	}
	.hint.small {
		font-size: 11px;
	}
	input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 6px 8px;
		font: inherit;
		font-size: 13px;
		background: #fffdf8;
	}
	input:focus {
		outline: 2px solid #3b5bdb33;
		border-color: #3b5bdb;
	}
	.pinned-rail {
		border: 1px solid #dcd3bd;
		background: #faf6ea;
		border-radius: 6px;
		padding: 6px 8px;
	}
	.pinned-rail h3 {
		margin: 0 0 4px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a6a1f;
	}
	.pins {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: 130px;
		overflow-y: auto;
	}
	.pins li {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.pin-title {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: #4d473c;
		text-align: left;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.35;
	}
	.pin-title:hover {
		color: #3b5bdb;
	}
	.pin-open {
		font: inherit;
		font-size: 10px;
		font-weight: 600;
		border: 1px solid #c9c4b8;
		background: #fff;
		border-radius: 999px;
		padding: 1px 7px;
		cursor: pointer;
		color: #4d473c;
		white-space: nowrap;
	}
	.pin-open:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.unpin {
		border: none;
		background: none;
		padding: 0 2px;
		font-size: 10px;
		color: #a89f8d;
		cursor: pointer;
		line-height: 1;
	}
	.unpin:hover {
		color: #8a3a2a;
	}
	.pin-mark {
		font-size: 11px;
		color: #8a6a1f;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.results li {
		background: #fffdf8;
		border: 1px solid #e0dbcf;
		border-radius: 6px;
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.result-main {
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.title {
		font-size: 12px;
		font-weight: 600;
		color: #2c2921;
		line-height: 1.3;
	}
	.type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 4px;
		background: #eee9dd;
		color: #5a523f;
		white-space: nowrap;
	}
	.type-claim { background: #e3ecdf; color: #3d5537; }
	.type-question { background: #e5e1f2; color: #4a4174; }
	.type-concept { background: #dfe9ef; color: #35586b; }
	.type-example { background: #f2e6df; color: #6b4a35; }
	.type-prediction { background: #f2dfe7; color: #6b3550; }
	.type-evidence { background: #ece5c8; color: #635417; }
	.result-actions {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.status {
		font-size: 10px;
		color: #8a8375;
		flex: 1;
	}
	.in-set {
		font-size: 10px;
		color: #3d5537;
		background: #e3ecdf;
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	button.add {
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		border: 1px solid #c9c4b8;
		background: #fff;
		border-radius: 999px;
		padding: 2px 9px;
		cursor: pointer;
		color: #4d473c;
		white-space: nowrap;
	}
	button.add:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 11px;
		color: #3b5bdb;
		cursor: pointer;
	}
</style>
