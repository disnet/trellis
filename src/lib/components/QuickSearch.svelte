<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';

	const ws = workspace;

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let query = $state('');
	let activeIndex = $state(0);
	let busy = $state(false);
	let inputEl = $state<HTMLInputElement>();
	let listEl = $state<HTMLElement>();

	const RECENT_LIMIT = 9;
	const RESULT_LIMIT = 40;

	const searching = $derived(query.trim().length > 0);
	// With no query the modal is a launcher: pinned landmarks first, then the
	// most recently touched thoughts. With a query it is pure search.
	const pinned = $derived(
		searching
			? []
			: ws.pinnedThoughtIds.map((id) => ws.thoughts[id]).filter((t) => t !== undefined)
	);
	const rest = $derived(
		searching
			? ws.searchGraph(query).slice(0, RESULT_LIMIT)
			: Object.values(ws.thoughts)
					.filter((t) => !ws.isPinned(t.id))
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.slice(0, RECENT_LIMIT)
	);
	const items = $derived([...pinned, ...rest]);
	const activeGroup = $derived(ws.workingSets.find((s) => s.id === ws.activeWorkingSetId));

	$effect(() => {
		if (open) {
			query = '';
			queueMicrotask(() => inputEl?.focus());
		}
	});
	// A new query restarts keyboard position at the top; other list changes
	// (an add flipping a row to "in group") keep the position, so a batch of
	// Enter-adds doesn't rewind between each one.
	$effect(() => {
		void query;
		activeIndex = 0;
	});
	$effect(() => {
		if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);
	});
	$effect(() => {
		listEl?.querySelector(`[data-row="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	function close() {
		open = false;
	}

	/** Enter / click. Under a group lens the primary verb is add-and-stay-open,
	 *  so several thoughts can be gathered in one pass; without a lens (or for a
	 *  thought already in the group, or with ⌘ held) it jumps to the thought. */
	async function act(id: string, jump: boolean) {
		if (busy) return;
		if (!jump && ws.lensActive && !ws.inWorkingSet(id)) {
			busy = true;
			try {
				const err = await ws.addToSet([id]);
				if (err) ws.notice = err;
			} finally {
				busy = false;
			}
		} else {
			ws.select(id);
			close();
		}
	}

	async function focusNeighborhood(id: string) {
		if (busy) return;
		busy = true;
		try {
			const err = await ws.openNeighborhood(id);
			if (err) ws.notice = err;
			else close();
		} finally {
			busy = false;
		}
	}

	function browseAll() {
		ws.view = 'browse';
		close();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
		} else if (e.key === 'ArrowDown' && items.length) {
			e.preventDefault();
			activeIndex = (activeIndex + 1) % items.length;
		} else if (e.key === 'ArrowUp' && items.length) {
			e.preventDefault();
			activeIndex = (activeIndex - 1 + items.length) % items.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const t = items[activeIndex];
			if (t) void act(t.id, e.metaKey || e.ctrlKey);
		}
	}
</script>

{#if open}
	<div class="scrim" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && close()}>
		<div class="panel" role="dialog" aria-modal="true" aria-label="Search the graph" tabindex="-1" onkeydown={onKeydown}>
			<div class="search-row">
				<Icon name="search" size="1em" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="quick-search-list"
					aria-activedescendant={items.length ? `qs-row-${activeIndex}` : undefined}
					aria-label="Search titles and statements"
					placeholder="Search titles and statements…"
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			{#if items.length === 0}
				<p class="empty">
					{searching ? 'No thoughts match.' : 'The graph is empty.'}
				</p>
			{:else}
				<ul class="results" id="quick-search-list" role="listbox" bind:this={listEl}>
					{#each items as t, i (t.id)}
						{@const inSet = ws.inWorkingSet(t.id)}
						{#if !searching && pinned.length > 0 && i === 0}
							<li class="section" role="presentation">⚑ Pinned</li>
						{/if}
						{#if !searching && i === pinned.length && rest.length > 0}
							<li class="section" role="presentation">Recent</li>
						{/if}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<li
							id="qs-row-{i}"
							data-row={i}
							role="option"
							aria-selected={i === activeIndex}
							class="row"
							class:active={i === activeIndex}
							onmousemove={() => (activeIndex = i)}
							onclick={(e) => act(t.id, e.metaKey || e.ctrlKey)}
						>
							<span class="type type-{t.type}">{t.type}</span>
							{#if ws.isPinned(t.id)}<span class="pin-mark" title="Pinned">⚑</span>{/if}
							<span class="title">{t.title}</span>
							<span class="meta">
								{#if ws.lensActive && inSet}
									<span class="in-set">in group</span>
								{:else}
									<span class="status">{t.status}</span>
								{/if}
							</span>
							{#if ws.isPinned(t.id)}
								<button
									class="focus-pin"
									title="Focus this thought and its neighbors in a new group"
									onclick={(e) => {
										e.stopPropagation();
										void focusNeighborhood(t.id);
									}}
								>⌾ focus</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<div class="footer">
				<span class="hints">
					{#if ws.lensActive}
						<kbd>↩</kbd> add to “{activeGroup?.name}” · <kbd>⌘↩</kbd> jump
					{:else}
						<kbd>↩</kbd> jump to thought
					{/if}
					· <kbd>esc</kbd> close
				</span>
				<button class="browse" onclick={browseAll}>Browse all <Icon name="browse" size="0.9em" /></button>
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(44, 41, 33, 0.35);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 12vh 16px 16px;
		z-index: 70;
	}
	.panel {
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: var(--shadow-modal);
		width: min(600px, 100%);
		max-height: min(480px, 76vh);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--hairline);
		color: var(--ink-muted);
	}
	input {
		flex: 1;
		border: none;
		background: none;
		font: inherit;
		font-size: var(--fs-14);
		color: var(--ink);
		padding: 0;
	}
	input:focus {
		outline: none;
	}
	input::placeholder {
		color: var(--ink-quiet);
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 6px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}
	.section {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		color: var(--gold-ink);
		padding: 8px 8px 4px;
	}
	.section + .section,
	.row + .section {
		margin-top: 4px;
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 7px;
		padding: 7px 8px;
		border-radius: 6px;
		cursor: pointer;
	}
	.row.active {
		background: var(--inset-fill);
	}
	.title {
		font-size: var(--fs-13);
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.pin-mark {
		font-size: var(--fs-11);
		color: var(--gold-ink);
	}
	.meta {
		flex-shrink: 0;
	}
	.status {
		font-size: var(--fs-10);
		color: var(--ink-quiet);
	}
	.in-set {
		font-size: var(--fs-10);
		color: var(--moss-ink);
		background: var(--moss);
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	.focus-pin {
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
		flex-shrink: 0;
	}
	.focus-pin:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.empty {
		margin: 0;
		padding: 18px 14px;
		font-size: var(--fs-12);
		color: var(--ink-quiet);
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 14px;
		border-top: 1px solid var(--hairline);
		background: var(--paper-panel);
	}
	.hints {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font-family: inherit;
		font-size: var(--fs-10);
		border: 1px solid var(--hairline);
		border-radius: 4px;
		background: var(--card-white);
		padding: 0 4px;
		color: var(--ink-muted);
	}
	.browse {
		display: flex;
		align-items: center;
		gap: 5px;
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 600;
		border: none;
		background: none;
		padding: 2px 0;
		color: var(--ink-soft);
		cursor: pointer;
		white-space: nowrap;
	}
	.browse:hover {
		color: var(--blue);
	}
	.browse:focus-visible,
	.focus-pin:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}
</style>
