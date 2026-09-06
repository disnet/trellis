<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';

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
		{totalThoughts} thought{totalThoughts === 1 ? '' : 's'} in the graph{#if ws.lensActive}
			· {ws.workingSet.length} in the group{/if}
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
							title="Focus this thought and its neighbors in a new group"
							onclick={() => run(() => ws.openNeighborhood(t.id))}
						>⌾ focus</button>
						<button
							class="unpin"
							title="Unpin"
							aria-label="Unpin “{t.title}”"
							onclick={() => run(() => ws.togglePin(t.id))}
						><Icon name="x" size="0.85em" /></button>
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
						<button class="link" onclick={() => locate(t.id)}>select</button>
						{#if ws.lensActive}
							{#if inSet}
								<span class="in-set">in group</span>
							{:else}
								<button class="add" onclick={() => add(t.id)}>+ add to group</button>
							{/if}
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
		font-size: var(--fs-13);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-muted);
	}
	.hint {
		margin: 0;
		font-size: var(--fs-12);
		color: var(--ink-quiet);
		line-height: 1.4;
	}
	.hint.small {
		font-size: var(--fs-11);
	}
	input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 6px 8px;
		font: inherit;
		font-size: var(--fs-13);
		background: var(--paper-raised);
	}
	input:focus {
		outline: 2px solid var(--focus-glow);
		border-color: var(--blue);
	}
	.pinned-rail {
		border: 1px solid var(--pin-border);
		background: var(--pin-fill);
		border-radius: 6px;
		padding: 6px 8px;
	}
	.pinned-rail h3 {
		margin: 0 0 4px;
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--gold-ink);
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
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink-soft);
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
		color: var(--blue);
	}
	.pin-open {
		font: inherit;
		font-size: var(--fs-10);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 999px;
		padding: 1px 7px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
	}
	.pin-open:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.unpin {
		border: none;
		background: none;
		padding: 0 2px;
		font-size: var(--fs-10);
		color: var(--edge-ink);
		cursor: pointer;
		line-height: 1;
	}
	.unpin:hover {
		color: var(--rust);
	}
	.pin-mark {
		font-size: var(--fs-11);
		color: var(--gold-ink);
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
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
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
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
	}
	.type {
		font-size: var(--fs-9);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
		white-space: nowrap;
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.result-actions {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.status {
		font-size: var(--fs-10);
		color: var(--ink-quiet);
		flex: 1;
	}
	.in-set {
		font-size: var(--fs-10);
		color: var(--moss-ink);
		background: var(--moss);
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	button.add {
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 999px;
		padding: 2px 9px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
	}
	button.add:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: var(--fs-11);
		color: var(--ink-muted);
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
		cursor: pointer;
	}
	button.link:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
</style>
