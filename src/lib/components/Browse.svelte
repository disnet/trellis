<script lang="ts">
	// Graph-wide browse table (the third center view). Unlike Canvas and Outline,
	// which project the working set, this shows every thought in the active graph
	// so it can be sorted, filtered, and staged onto the canvas. Read-only over
	// the durable graph; its verbs are membership only (add to set, promote a
	// filter to a new working set).
	import { workspace } from '$lib/workspace.svelte';
	import { effectivePayload, type Thought, type ThoughtStatus, type ThoughtType } from '$lib/types';

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
			if (setFilter === 'in' && !ws.inWorkingSet(t.id)) return false;
			if (setFilter === 'out' && ws.inWorkingSet(t.id)) return false;
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
			label: '⚠ Needs attention',
			hint: 'Contested and tentative thoughts',
			apply: () => {
				resetFilters();
				statusFilter = 'attention';
			},
			active: () => noFacets() && statusFilter === 'attention' && linkFilter === 'all'
		},
		{
			key: 'central',
			label: '◉ Most central',
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
			label: '◌ Orphans',
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
		if (preset) return preset.label.replace(/^\S+\s/, '').replace(/^./, (c) => c.toUpperCase());
		return 'From browse';
	}

	async function promote() {
		const ids = rows.map((t) => t.id);
		if (
			ids.length > 30 &&
			!confirm(`Open a new working set with all ${ids.length} matching thoughts?`)
		)
			return;
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
				<select bind:value={setFilter} aria-label="Filter by working-set membership">
					<option value="all">Set: any</option>
					<option value="in">in this set</option>
					<option value="out">not in this set</option>
				</select>
			</div>
			<span class="count" aria-live="polite">
				{rows.length} of {totalThoughts} thought{totalThoughts === 1 ? '' : 's'}
			</span>
			{#if stageable.length > 0}
				<button
					class="action"
					title="Add the selected thoughts to the active working set"
					onclick={() => run(() => ws.addToSet(stageable))}
				>
					＋ Add {stageable.length} selected to set
				</button>
			{/if}
			<button
				class="action promote"
				disabled={rows.length === 0}
				title="Open a new working set containing every thought matching the current filter"
				onclick={promote}
			>
				⌗ New set from results
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
									<span class="dir">{sortKey === h.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
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
								{#if inSet}
									<span class="in-set">in set</span>
								{:else}
									<button
										class="add"
										title="Add to the active working set"
										onclick={(ev) => {
											ev.stopPropagation();
											run(() => ws.addToSet([t.id]));
										}}
									>+ add</button>
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
		background: #f6f3ec;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 14px;
		background: #fbf9f3;
		border-bottom: 1px solid #e0dbcf;
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
		font-size: 11.5px;
		font-weight: 600;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 999px;
		padding: 3px 11px;
		cursor: pointer;
		color: #4d473c;
		white-space: nowrap;
	}
	.chip:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.chip.active {
		border-color: #3b5bdb;
		background: #e9edfb;
		color: #2c47b8;
	}
	input[type='search'] {
		flex: 1;
		min-width: 180px;
		max-width: 380px;
		margin-left: auto;
		box-sizing: border-box;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 5px 8px;
		font: inherit;
		font-size: 13px;
		background: #fffdf8;
	}
	input[type='search']:focus {
		outline: 2px solid #3b5bdb33;
		border-color: #3b5bdb;
	}
	.facets {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.facets select {
		font: inherit;
		font-size: 11.5px;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 3px 6px;
		background: #fffdf8;
		color: #4d473c;
	}
	.count {
		font-size: 11.5px;
		color: #8a8375;
		margin-left: auto;
		white-space: nowrap;
	}
	.action {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid #c9c4b8;
		background: #fff;
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
		color: #4d473c;
		white-space: nowrap;
	}
	.action:hover:not(:disabled) {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.action:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.action.promote {
		border-color: #3d5537;
		color: #3d5537;
	}
	.action.promote:hover:not(:disabled) {
		background: #e3ecdf;
		border-color: #3d5537;
		color: #3d5537;
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #8a8375;
		font-size: 13px;
	}
	.table-wrap {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: #f1ede2;
		border-bottom: 1px solid #d5d0c4;
		text-align: left;
		padding: 0;
	}
	.sort {
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #6d675c;
		border: none;
		background: none;
		padding: 7px 10px;
		cursor: pointer;
		width: 100%;
		text-align: left;
		white-space: nowrap;
	}
	.sort:hover {
		color: #3b5bdb;
	}
	.dir {
		font-size: 9px;
	}
	tbody tr {
		background: #fffdf8;
		border-bottom: 1px solid #eae5d9;
		cursor: pointer;
	}
	tbody tr:hover {
		background: #fdf9ef;
	}
	tbody tr.selected {
		background: #e9edfb;
		box-shadow: inset 3px 0 0 #3b5bdb;
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
		color: #6d675c;
		font-variant-numeric: tabular-nums;
	}
	.col-updated {
		color: #8a8375;
		font-size: 11.5px;
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
	.title {
		font-weight: 600;
		color: #2c2921;
		line-height: 1.3;
	}
	.pin {
		font-size: 11px;
		color: #8a6a1f;
	}
	.revision {
		font-weight: 700;
		color: #8a6a1f;
	}
	.statement {
		margin: 4px 0 0;
		color: #4d473c;
		font-weight: 400;
		line-height: 1.4;
		font-size: 12px;
		max-width: 72ch;
	}
	.status {
		font-size: 10px;
		border: 1px solid #d5d0c4;
		border-radius: 999px;
		padding: 1px 7px;
		color: #5a523f;
		background: #faf7f0;
	}
	.in-set {
		font-size: 10px;
		color: #3d5537;
		background: #e3ecdf;
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	.add {
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
	.add:hover {
		border-color: #3b5bdb;
		color: #3b5bdb;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
