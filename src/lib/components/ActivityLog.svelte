<script lang="ts">
	// Agent activity log (the fifth center view): every model/fixture attempt
	// from the agent_calls table — invocations, outcomes, latency, and errors
	// such as rate limits, which otherwise only flash by as a six-second toast.
	// Read-only and global (calls are not graph-scoped). The list carries only
	// metadata; expanding a row fetches the full request and raw output.
	import { workspace } from '$lib/workspace.svelte';
	import Icon from './Icon.svelte';

	const ws = workspace;

	interface CallSummary {
		id: string;
		action: string;
		adapter: string;
		model: string;
		attempt: number;
		validationErrors: string[];
		error: string | null;
		latencyMs: number;
		usage: string | null;
		effort: string | null;
		changeSetId: string | null;
		createdAt: number;
	}
	interface CallDetail extends CallSummary {
		request: string;
		rawOutput: string | null;
	}

	let calls = $state<CallSummary[]>([]);
	let loaded = $state(false);
	let loadError = $state<string | null>(null);
	let outcomeFilter = $state<'all' | 'problems'>('all');
	let actionFilter = $state('all');
	let adapterFilter = $state('all');
	let expandedId = $state<string | null>(null);
	let detail = $state<CallDetail | null>(null);
	let detailError = $state<string | null>(null);

	type Outcome = 'ok' | 'invalid' | 'error';
	function outcome(c: CallSummary): Outcome {
		if (c.error) return 'error';
		if (c.validationErrors.length) return 'invalid';
		return 'ok';
	}
	const OUTCOME_LABEL: Record<Outcome, string> = {
		ok: 'ok',
		invalid: 'invalid output',
		error: 'error'
	};

	async function load() {
		try {
			const res = await fetch('/api/agent-calls');
			const body = await res.json().catch(() => null);
			if (!res.ok || !body?.calls) throw new Error(body?.error ?? `HTTP ${res.status}`);
			calls = body.calls;
			loadError = null;
		} catch (e) {
			loadError = (e as Error).message;
		}
		loaded = true;
	}

	// Load on mount, and again whenever an invocation or prose generation
	// starts or settles — new attempts land in the table as they happen.
	$effect(() => {
		void ws.invoking;
		void ws.proseGenerating;
		void Object.values(ws.conversationRequests).some(Boolean);
		load();
	});

	async function toggle(id: string) {
		if (expandedId === id) {
			expandedId = null;
			return;
		}
		expandedId = id;
		detail = null;
		detailError = null;
		try {
			const res = await fetch(`/api/agent-calls?id=${encodeURIComponent(id)}`);
			const body = await res.json().catch(() => null);
			if (!res.ok || !body?.call) throw new Error(body?.error ?? `HTTP ${res.status}`);
			// Ignore a slow response for a row that is no longer open.
			if (expandedId === id) detail = body.call;
		} catch (e) {
			if (expandedId === id) detailError = (e as Error).message;
		}
	}

	const actions = $derived([...new Set(calls.map((c) => c.action))].sort());
	const adapters = $derived([...new Set(calls.map((c) => c.adapter))].sort());
	const problemCount = $derived(calls.filter((c) => outcome(c) !== 'ok').length);

	const rows = $derived(
		calls.filter((c) => {
			if (outcomeFilter === 'problems' && outcome(c) === 'ok') return false;
			if (actionFilter !== 'all' && c.action !== actionFilter) return false;
			if (adapterFilter !== 'all' && c.adapter !== adapterFilter) return false;
			return true;
		})
	);

	/** The row's one-line trouble summary, when there is trouble. */
	function problem(c: CallSummary): string | null {
		if (c.error) return c.error;
		if (c.validationErrors.length)
			return c.validationErrors.length === 1
				? c.validationErrors[0]
				: `${c.validationErrors[0]} (+${c.validationErrors.length - 1} more)`;
		return null;
	}

	function ago(ts: number): string {
		const s = Math.max(0, (Date.now() - ts) / 1000);
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
		return new Date(ts).toLocaleDateString();
	}

	function latency(ms: number): string {
		return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
	}

	/** The adapter's usage line, without the wordy suffix: "1.2K in / 300 out". */
	function tokens(usage: string | null): string {
		return usage ? usage.replace(' tokens', '') : '—';
	}
</script>

<div class="activity" aria-label="Agent activity log">
	<header class="controls">
		<div class="row">
			<div class="presets" role="group" aria-label="Outcome filter">
				<button
					class="chip"
					class:active={outcomeFilter === 'all'}
					onclick={() => (outcomeFilter = 'all')}
				>
					All
				</button>
				<button
					class="chip"
					class:active={outcomeFilter === 'problems'}
					title="Errors (rate limits, credentials, network) and invalid model output"
					onclick={() => (outcomeFilter = 'problems')}
				>
					Problems{#if problemCount}&nbsp;<span class="chip-count">{problemCount}</span>{/if}
				</button>
			</div>
			<div class="facets">
				{#if actions.length > 1}
					<select bind:value={actionFilter} aria-label="Filter by operation">
						<option value="all">Operation: any</option>
						{#each actions as a (a)}<option value={a}>{a}</option>{/each}
					</select>
				{/if}
				{#if adapters.length > 1}
					<select bind:value={adapterFilter} aria-label="Filter by adapter">
						<option value="all">Adapter: any</option>
						{#each adapters as a (a)}<option value={a}>{a}</option>{/each}
					</select>
				{/if}
			</div>
			<span class="count" aria-live="polite">
				{rows.length} of {calls.length} call{calls.length === 1 ? '' : 's'}
			</span>
			<button class="action" title="Reload the log" onclick={load}>
				<Icon name="undo" size="0.9em" /> Refresh
			</button>
		</div>
	</header>

	{#if !loaded}
		<div class="empty">Loading the log…</div>
	{:else if loadError}
		<div class="empty error-state">
			<p>Could not load the log: {loadError}</p>
			<button class="action" onclick={load}>Retry</button>
		</div>
	{:else if calls.length === 0}
		<div class="empty">
			No agent calls yet — invoke an operation (Decompose, Develop, Challenge, Connect) or
			generate prose, and every attempt will be recorded here.
		</div>
	{:else if rows.length === 0}
		<div class="empty">No calls match this filter.</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="col-time">When</th>
						<th class="col-action">Operation</th>
						<th class="col-model">Model</th>
						<th class="col-effort">Effort</th>
						<th class="col-outcome">Outcome</th>
						<th class="col-usage">Tokens</th>
						<th class="col-latency">Latency</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as c (c.id)}
						{@const o = outcome(c)}
						{@const trouble = problem(c)}
						<tr
							class:open={expandedId === c.id}
							onclick={() => toggle(c.id)}
						>
							<td class="col-time" title={new Date(c.createdAt).toLocaleString()}>
								{ago(c.createdAt)}
							</td>
							<td class="col-action">
								<span class="op">{c.action}</span>
								{#if c.attempt > 1}<span class="retry" title="Corrective retry after invalid output">retry</span>{/if}
							</td>
							<td class="col-model" title="{c.adapter} · {c.model}">
								<span class="adapter">{c.adapter}</span> {c.model}
							</td>
							<td class="col-effort" title={c.effort
								? `Sent at ${c.effort} reasoning effort`
								: 'Ran at the provider’s default effort'}>
								{c.effort ?? '—'}
							</td>
							<td class="col-outcome">
								<span class="outcome outcome-{o}">{OUTCOME_LABEL[o]}</span>
								{#if trouble}<span class="trouble">{trouble}</span>{/if}
							</td>
							<td class="col-usage" title={c.usage ?? 'The adapter reported no usage'}>
								{tokens(c.usage)}
							</td>
							<td class="col-latency">{latency(c.latencyMs)}</td>
						</tr>
						{#if expandedId === c.id}
							<tr class="detail-row">
								<td colspan="7">
									<div class="detail">
										<dl class="meta">
											<div><dt>Call</dt><dd>{c.id}</dd></div>
											<div><dt>At</dt><dd>{new Date(c.createdAt).toLocaleString()}</dd></div>
											<div><dt>Attempt</dt><dd>{c.attempt}</dd></div>
											{#if c.usage}
												<div><dt>Usage</dt><dd>{c.usage}</dd></div>
											{/if}
											{#if c.changeSetId}
												<div><dt>Change set</dt><dd>{c.changeSetId}</dd></div>
											{/if}
										</dl>
										{#if c.error}
											<section>
												<h3>Error</h3>
												<p class="error-text">{c.error}</p>
											</section>
										{/if}
										{#if c.validationErrors.length}
											<section>
												<h3>Validation errors</h3>
												<ul>
													{#each c.validationErrors as err, i (i)}<li>{err}</li>{/each}
												</ul>
											</section>
										{/if}
										{#if detailError}
											<p class="error-text">Could not load the payloads: {detailError}</p>
										{:else if !detail}
											<p class="loading-detail">Loading the request and output…</p>
										{:else}
											<details>
												<summary>Request ({detail.request.length.toLocaleString()} chars)</summary>
												<pre>{detail.request || '(empty — the call failed before a request was built)'}</pre>
											</details>
											<details>
												<summary>
													Raw output{#if detail.rawOutput}&nbsp;({detail.rawOutput.length.toLocaleString()} chars){/if}
												</summary>
												<pre>{detail.rawOutput ?? '(none — the call failed before the model responded)'}</pre>
											</details>
										{/if}
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.activity {
		height: 100%;
		display: flex;
		flex-direction: column;
		/* The floating center sheet paints the panel ground. */
		background: transparent;
	}
	.controls {
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
	.chip-count {
		font-size: var(--fs-10);
		background: var(--rust-wash, var(--inset-fill));
		color: var(--rust);
		border-radius: 999px;
		padding: 0 5px;
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
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.action:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--ink-quiet);
		font-size: var(--fs-13);
		text-align: center;
		padding: 0 32px;
		max-width: 56ch;
		margin: 0 auto;
	}
	.error-state {
		color: var(--rust);
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
		font-size: var(--fs-11);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--ink-muted);
		padding: 7px 10px;
		white-space: nowrap;
	}
	tbody tr {
		background: var(--paper-raised);
		border-bottom: 1px solid var(--divider);
		cursor: pointer;
	}
	tbody tr:hover:not(.detail-row) {
		background: var(--paper);
	}
	tbody tr.open {
		background: var(--blue-wash);
	}
	td {
		padding: 6px 10px;
		vertical-align: baseline;
	}
	.col-time,
	.col-action,
	.col-model,
	.col-effort,
	.col-usage,
	.col-latency {
		white-space: nowrap;
		width: 1%;
	}
	.col-effort {
		color: var(--ink-quiet);
		font-size: var(--fs-11-5);
	}
	.col-usage {
		text-align: right;
		color: var(--ink-quiet);
		font-size: var(--fs-11-5);
		font-variant-numeric: tabular-nums;
		max-width: 18ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.col-time {
		color: var(--ink-quiet);
		font-size: var(--fs-11-5);
	}
	.col-latency {
		text-align: right;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.op {
		font-size: var(--fs-9);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
	}
	.retry {
		font-size: var(--fs-10);
		color: var(--gold-ink);
		margin-left: 4px;
	}
	.col-model {
		color: var(--ink-soft);
		max-width: 22ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.adapter {
		color: var(--ink-quiet);
		font-size: var(--fs-11);
	}
	.outcome {
		font-size: var(--fs-10);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		background: var(--pill-fill);
		color: var(--ink-faded);
		white-space: nowrap;
	}
	.outcome-ok {
		background: var(--moss);
		color: var(--moss-ink);
		border-color: transparent;
	}
	.outcome-invalid {
		background: var(--ochre);
		color: var(--ochre-ink);
		border-color: transparent;
	}
	.outcome-error {
		background: var(--clay);
		color: var(--rust);
		border-color: transparent;
	}
	.trouble {
		margin-top: 3px;
		color: var(--ink-soft);
		font-size: var(--fs-11-5);
		line-height: 1.4;
		max-width: 64ch;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.detail-row {
		cursor: default;
		background: var(--paper-panel);
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 6px 4px 10px;
		font-size: var(--fs-12);
	}
	.meta {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
		margin: 0;
	}
	.meta div {
		display: flex;
		gap: 5px;
		align-items: baseline;
	}
	.meta dt {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: var(--ink-muted);
	}
	.meta dd {
		margin: 0;
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}
	.detail h3 {
		margin: 0 0 4px;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
	}
	.error-text {
		margin: 0;
		color: var(--rust);
		line-height: 1.5;
		max-width: 80ch;
	}
	.detail ul {
		margin: 0;
		padding-left: 18px;
		color: var(--ink-soft);
		line-height: 1.5;
	}
	.loading-detail {
		margin: 0;
		color: var(--ink-quiet);
	}
	.detail details summary {
		cursor: pointer;
		font-size: var(--fs-11-5);
		font-weight: 600;
		color: var(--ink-soft);
	}
	.detail details summary:hover {
		color: var(--blue);
	}
	.detail pre {
		margin: 6px 0 0;
		padding: 8px 10px;
		background: var(--inset-fill);
		border: 1px solid var(--hairline);
		border-radius: 8px;
		font-size: var(--fs-11);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 320px;
		overflow: auto;
	}
</style>
