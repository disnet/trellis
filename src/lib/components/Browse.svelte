<script lang="ts">
	// Graph-wide browse table (the third center view): every thought in the
	// active graph, sortable and filterable. Read-only over the durable graph;
	// its verbs are membership only (add to the active working set, promote a
	// filter to a new one).
	import { dialogs } from '$lib/dialogs.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import { effectivePayload, type Thought, type ThoughtStatus, type ThoughtType } from '$lib/types';
	import Icon from './Icon.svelte';

	const ws = workspace;

	const TYPES: ThoughtType[] = ['claim', 'prediction', 'question', 'concept', 'example', 'evidence'];
	const STATUSES: ThoughtStatus[] = ['tentative', 'developing', 'believed', 'contested', 'retired'];

	type SortKey = 'title' | 'type' | 'status' | 'degree' | 'updatedAt' | 'createdAt';
	type StatusFilter = 'all' | 'attention' | ThoughtStatus;

	let query = $state('');
	let typeFilter = $state<'all' | ThoughtType>('all');
	let statusFilter = $state<StatusFilter>('all');
	let authorFilter = $state<'all' | 'human' | 'agent'>('all');
	let linkFilter = $state<'all' | 'connected' | 'orphan'>('all');
	let setFilter = $state<'all' | 'in' | 'out'>('all');
	let sortKey = $state<SortKey>('updatedAt');
	let sortDir = $state<'asc' | 'desc'>('desc');

	// Connection count per thought, both directions.
	const degrees = $derived.by((): Map<string, number> => {
		const out = new Map<string, number>();
		for (const r of ws.relations) {
			out.set(r.fromThoughtId, (out.get(r.fromThoughtId) ?? 0) + 1);
			out.set(r.toThoughtId, (out.get(r.toThoughtId) ?? 0) + 1);
		}
		return out;
	});

	function provenance(t: Thought): 'human' | 'agent' {
		return t.revisions[0]?.actorType === 'agent' && !t.revisions.some((r) => r.actorType === 'human')
			? 'agent'
			: 'human';
	}

	// Thoughts with a non-rejected pending revision, same marker as the outline.
	const pendingRevisionIds = $derived.by((): Set<string> => {
		const out = new Set<string>();
		for (const cs of ws.pendingChangeSets) {
			for (const op of cs.operations) {
				const p = effectivePayload(op);
				if (p.op === 'revise_thought' && op.decision !== 'rejected') out.add(p.thoughtId);
			}
		}
		return out;
	});

	const totalThoughts = $derived(Object.keys(ws.thoughts).length);

	const rows = $derived.by((): Thought[] => {
		const q = query.trim().toLowerCase();
		const list = Object.values(ws.thoughts).filter((t) => {
			if (q && !t.title.toLowerCase().includes(q) && !t.statement.toLowerCase().includes(q))
				return false;
			if (typeFilter !== 'all' && t.type !== typeFilter) return false;
			if (statusFilter === 'attention') {
				if (t.status !== 'contested' && t.status !== 'tentative') return false;
			} else if (statusFilter !== 'all' && t.status !== statusFilter) return false;
			if (authorFilter !== 'all' && provenance(t) !== authorFilter) return false;
			const deg = degrees.get(t.id) ?? 0;
			if (linkFilter === 'connected' && deg === 0) return false;
			if (linkFilter === 'orphan' && deg > 0) return false;
			// Membership facets only mean something while a working set is active.
			if (ws.lensActive) {
				if (setFilter === 'in' && !ws.inWorkingSet(t.id)) return false;
				if (setFilter === 'out' && ws.inWorkingSet(t.id)) return false;
			}
			return true;
		});
		const dir = sortDir === 'asc' ? 1 : -1;
		const cmp = (a: Thought, b: Thought): number => {
			switch (sortKey) {
				case 'title':
					return a.title.localeCompare(b.title);
				case 'type':
					return TYPES.indexOf(a.type) - TYPES.indexOf(b.type);
				case 'status':
					return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
				case 'degree':
					return (degrees.get(a.id) ?? 0) - (degrees.get(b.id) ?? 0);
				case 'createdAt':
					return a.createdAt - b.createdAt;
				default:
					return a.updatedAt - b.updatedAt;
			}
		};
		return list.sort((a, b) => dir * cmp(a, b) || b.updatedAt - a.updatedAt);
	});

	// --- presets: one-click filter + sort configurations ---

	interface Preset {
		key: string;
		label: string;
		hint: string;
		apply: () => void;
		active: () => boolean;
	}

	function resetFilters() {
		query = '';
		typeFilter = 'all';
		statusFilter = 'all';
		authorFilter = 'all';
		linkFilter = 'all';
		setFilter = 'all';
		sortKey = 'updatedAt';
		sortDir = 'desc';
	}

	const noFacets = () =>
		typeFilter === 'all' && authorFilter === 'all' && setFilter === 'all' && query.trim() === '';

	const presets: Preset[] = [
		{
			key: 'all',
			label: 'All',
			hint: 'Every thought, most recently updated first',
			apply: resetFilters,
			active: () =>
				noFacets() && statusFilter === 'all' && linkFilter === 'all' && sortKey === 'updatedAt'
		},
		{
			key: 'attention',
			label: 'Needs attention',
			hint: 'Contested and tentative thoughts',
			apply: () => {
				resetFilters();
				statusFilter = 'attention';
			},
			active: () => noFacets() && statusFilter === 'attention' && linkFilter === 'all'
		},
		{
			key: 'central',
			label: 'Most central',
			hint: 'Most-connected thoughts first',
			apply: () => {
				resetFilters();
				linkFilter = 'connected';
				sortKey = 'degree';
				sortDir = 'desc';
			},
			active: () =>
				noFacets() && statusFilter === 'all' && linkFilter === 'connected' && sortKey === 'degree'
		},
		{
			key: 'orphans',
			label: 'Orphans',
			hint: 'Thoughts with no relations at all',
			apply: () => {
				resetFilters();
				linkFilter = 'orphan';
			},
			active: () => noFacets() && statusFilter === 'all' && linkFilter === 'orphan'
		}
	];

	// --- sorting ---

	const HEADERS: { key: SortKey; label: string; defaultDir: 'asc' | 'desc' }[] = [
		{ key: 'type', label: 'Type', defaultDir: 'asc' },
		{ key: 'title', label: 'Title', defaultDir: 'asc' },
		{ key: 'status', label: 'Status', defaultDir: 'asc' },
		{ key: 'degree', label: 'Links', defaultDir: 'desc' },
		{ key: 'updatedAt', label: 'Updated', defaultDir: 'desc' }
	];

	function sortBy(key: SortKey, defaultDir: 'asc' | 'desc') {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = defaultDir;
		}
	}

	function ago(ts: number): string {
		const s = Math.max(0, (Date.now() - ts) / 1000);
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
		return new Date(ts).toLocaleDateString();
	}

	// --- actions ---

	async function run(fn: () => Promise<string | null>) {
		const err = await fn();
		if (err) ws.notice = err;
	}

	/** Selected thoughts not yet in the active working set. */
	const stageable = $derived(ws.selectedIds.filter((id) => !ws.inWorkingSet(id)));

	function promoteName(): string {
		const q = query.trim();
		if (q) return q;
		const preset = presets.find((p) => p.key !== 'all' && p.active());
		if (preset) return preset.label;
		return 'From browse';
	}

	async function promote() {
		const ids = rows.map((t) => t.id);
		if (ids.length > 30) {
			const ok = await dialogs.confirm(
				`Open a new group with all ${ids.length} matching thoughts?`,
				'Open group'
			);
			if (!ok) return;
		}
		await run(() => ws.createSetFrom(promoteName(), ids));
	}
</script>

<div class="browse" aria-label="Browse every thought in the graph">
	<header class="controls">
		<div class="row">
			<div class="presets" role="group" aria-label="Preset filters">
				{#each presets as p (p.key)}
					<button class="chip" class:active={p.active()} title={p.hint} onclick={p.apply}>
						{p.label}
					</button>
				{/each}
			</div>
			<input
				type="search"
				placeholder="Search titles and statements…"
				bind:value={query}
				aria-label="Search the full graph"
			/>
		</div>
		<div class="row">
			<div class="facets">
				<select bind:value={typeFilter} aria-label="Filter by type">
					<option value="all">Type: any</option>
					{#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
				</select>
				<select bind:value={statusFilter} aria-label="Filter by status">
					<option value="all">Status: any</option>
					<option value="attention">needs attention</option>
					{#each STATUSES as s (s)}<option value={s}>{s}</option>{/each}
				</select>
				<select bind:value={authorFilter} aria-label="Filter by author">
					<option value="all">Author: any</option>
					<option value="human">✎ you</option>
					<option value="agent">✳ agent</option>
				</select>
				<select bind:value={linkFilter} aria-label="Filter by connections">
					<option value="all">Links: any</option>
					<option value="connected">connected</option>
					<option value="orphan">orphans</option>
				</select>
				{#if ws.lensActive}
					<select bind:value={setFilter} aria-label="Filter by group membership">
						<option value="all">Group: any</option>
						<option value="in">in this group</option>
						<option value="out">not in this group</option>
					</select>
				{/if}
			</div>
			<span class="count" aria-live="polite">
				{rows.length} of {totalThoughts} thought{totalThoughts === 1 ? '' : 's'}
			</span>
			{#if ws.lensActive && stageable.length > 0}
				<button
					class="action"
					title="Add the selected thoughts to the active group"
					onclick={() => run(() => ws.addToSet(stageable))}
				>
					+ Add {stageable.length} selected to group
				</button>
			{/if}
			<button
				class="action promote"
				disabled={rows.length === 0}
				title="Open a new group containing every thought matching the current filter"
				onclick={promote}
			>
				New group from results
			</button>
		</div>
	</header>

	{#if totalThoughts === 0}
		<div class="empty">The graph is empty — decompose something from scratch to begin.</div>
	{:else if rows.length === 0}
		<div class="empty">No thoughts match this filter.</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						{#each HEADERS as h (h.key)}
							<th class="col-{h.key}" aria-sort={sortKey === h.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
								<button class="sort" onclick={() => sortBy(h.key, h.defaultDir)}>
									{h.label}
									{#if sortKey === h.key}
										<Icon name={sortDir === 'asc' ? 'caret-up' : 'caret-down'} size="0.85em" />
									{/if}
								</button>
							</th>
						{/each}
						<th class="col-actions"><span class="visually-hidden">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as t (t.id)}
						{@const inSet = ws.inWorkingSet(t.id)}
						<tr
							class:selected={ws.selectedIds.includes(t.id)}
							onclick={(ev) => ws.select(t.id, ev.shiftKey)}
						>
							<td class="col-type"><span class="type type-{t.type}">{t.type}</span></td>
							<td class="col-title">
								<span class="title">
									{#if ws.isPinned(t.id)}<span class="pin" title="Pinned">⚑</span>{/if}
									{t.title}
									{#if pendingRevisionIds.has(t.id)}
										<span class="revision" title="Revision pending in the tray">◇</span>
									{/if}
								</span>
								{#if ws.zoom === 'reading'}
									<p class="statement">{t.statement}</p>
								{/if}
							</td>
							<td class="col-status"><span class="status">{t.status}</span></td>
							<td class="col-degree">{degrees.get(t.id) ?? 0}</td>
							<td class="col-updated" title={new Date(t.updatedAt).toLocaleString()}>
								{ago(t.updatedAt)}
							</td>
							<td class="col-actions">
								{#if ws.lensActive}
									{#if inSet}
										<span class="in-set">in group</span>
									{:else}
										<button
											class="add"
											title="Add to the active group"
											onclick={(ev) => {
												ev.stopPropagation();
												run(() => ws.addToSet([t.id]));
											}}
										>+ add</button>
									{/if}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.browse {
		height: 100%;
		display: flex;
		flex-direction: column;
		/* The floating center sheet paints the panel ground. */
		background: transparent;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 14px;
		background: var(--paper-panel);
		border-bottom: 1px solid var(--hairline);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.presets {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.chip {
		font: inherit;
		font-size: var(--fs-11-5);
		font-weight: 600;
		border: 1px solid var(--control-border);
		background: var(--card-white);
		border-radius: 999px;
		padding: 3px 11px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
	}
	.chip:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.chip.active {
		border-color: var(--blue);
		background: var(--blue-wash);
		color: var(--blue-deep);
	}
	input[type='search'] {
		flex: 1;
		min-width: 180px;
		max-width: 380px;
		margin-left: auto;
		box-sizing: border-box;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 5px 8px;
		font: inherit;
		font-size: var(--fs-13);
		background: var(--paper-raised);
	}
	input[type='search']:focus {
		outline: 2px solid var(--focus-glow);
		border-color: var(--blue);
	}
	.facets {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.facets select {
		font: inherit;
		font-size: var(--fs-11-5);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 3px 6px;
		background: var(--paper-raised);
		color: var(--ink-soft);
	}
	.count {
		font-size: var(--fs-11-5);
		color: var(--ink-quiet);
		margin-left: auto;
		white-space: nowrap;
	}
	.action {
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
	}
	.action:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	.action:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.action.promote {
		border-color: var(--moss-ink);
		color: var(--moss-ink);
	}
	.action.promote:hover:not(:disabled) {
		background: var(--moss);
		border-color: var(--moss-ink);
		color: var(--moss-ink);
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-quiet);
		font-size: var(--fs-13);
	}
	.table-wrap {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-12-5);
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--inset-fill);
		border-bottom: 1px solid var(--control-border);
		text-align: left;
		padding: 0;
	}
	.sort {
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--ink-muted);
		border: none;
		background: none;
		padding: 7px 10px;
		cursor: pointer;
		width: 100%;
		text-align: left;
		white-space: nowrap;
	}
	.sort:hover {
		color: var(--blue);
	}
	tbody tr {
		background: var(--paper-raised);
		border-bottom: 1px solid var(--divider);
		cursor: pointer;
	}
	tbody tr:hover {
		background: var(--paper);
	}
	tbody tr.selected {
		background: var(--blue-wash);
		box-shadow: inset 3px 0 0 var(--blue);
	}
	td {
		padding: 6px 10px;
		vertical-align: baseline;
	}
	.col-type,
	.col-status,
	.col-degree,
	.col-updated,
	.col-actions {
		white-space: nowrap;
		width: 1%;
	}
	.col-degree {
		text-align: right;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.col-updated {
		color: var(--ink-quiet);
		font-size: var(--fs-11-5);
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
	.title {
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
	}
	.pin {
		font-size: var(--fs-11);
		color: var(--gold-ink);
	}
	.revision {
		font-weight: 700;
		color: var(--gold-ink);
	}
	.statement {
		margin: 4px 0 0;
		color: var(--ink-soft);
		font-weight: 400;
		line-height: 1.4;
		font-size: var(--fs-12);
		max-width: 72ch;
	}
	.status {
		font-size: var(--fs-10);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--ink-faded);
		background: var(--pill-fill);
	}
	.in-set {
		font-size: var(--fs-10);
		color: var(--moss-ink);
		background: var(--moss);
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	.add {
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
	.add:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
