<script lang="ts">
	// The publication review: connect an atproto account, title the garden and
	// pick its front-door essay, read the exact diff that would go public,
	// attach change notes, and publish. Local state is the source of truth throughout —
	// this page only ever writes to the PDS through the publish API.
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { dialogs } from '$lib/dialogs.svelte';
	import type { ProseDraftSummary } from '$lib/types';

	interface Credentials {
		method?: 'oauth' | 'password';
		service: string;
		identifier: string;
		hasPassword: boolean;
		did?: string;
		handle?: string;
	}
	interface PlannedPutDto {
		collection: string;
		rkey: string;
		kind: string;
		label: string;
		isNew: boolean;
		record: object;
	}
	interface PlanDto {
		puts: PlannedPutDto[];
		deletes: { collection: string; rkey: string; kind: string; label: string }[];
		unchanged: number;
		newThoughts: { thoughtId: string; title: string }[];
		changedThoughts: { thoughtId: string; title: string; changes: string[] }[];
		warnings: string[];
	}
	interface WriteResultDto {
		action: 'put' | 'delete';
		kind: string;
		label: string;
		ok: boolean;
		error?: string;
	}
	interface OutcomeDto {
		status: 'complete' | 'partial' | 'failed' | 'noop';
		results: WriteResultDto[];
		finishedAt: number;
	}
	interface LiveGardenDto {
		graphId: string;
		graphName: string;
		key: string;
		title: string;
		thoughts: number;
		lastPublishedAt: number;
	}
	interface StatusDto {
		graphId: string;
		graphName: string;
		credentials: Credentials;
		config: { key: string; treatmentId: string | null; title: string; summary: string };
		configured: boolean;
		gardens: LiveGardenDto[];
		live: {
			garden: boolean;
			thoughts: number;
			revisions: number;
			relations: number;
			treatments: number;
			lastPublishedAt: number | null;
		};
		lastRelease: OutcomeDto | null;
		gardenIdent: string | null;
	}

	let status = $state<StatusDto | null>(null);
	let notice = $state('');
	let busy = $state('');

	// Account forms — OAuth first, app password as the fallback.
	let oauthHandle = $state('');
	let service = $state('https://bsky.social');
	let identifier = $state('');
	let appPassword = $state('');

	// Release form
	let title = $state('');
	let summary = $state('');
	let key = $state('');
	let treatmentId = $state('');
	let drafts = $state<ProseDraftSummary[]>([]);

	// Review state
	let plan = $state<PlanDto | null>(null);
	let changeNotes = $state<Record<string, string>>({});
	let outcome = $state<OutcomeDto | null>(null);

	const connected = $derived(!!status?.credentials.did);
	/** Gardens published from other graphs — live beside this one, untouched
	 *  by this release. */
	const otherGardens = $derived(
		(status?.gardens ?? []).filter((g) => g.graphId !== status?.graphId)
	);
	const thisGarden = $derived(status?.gardens.find((g) => g.graphId === status?.graphId));
	const gardenUrl = $derived(
		status?.gardenIdent
			? `/garden/${encodeURIComponent(status.gardenIdent)}/${encodeURIComponent(key || 'garden')}`
			: ''
	);

	$effect(() => {
		// Returning from the PDS authorization page lands here with a result in
		// the query string; surface it once and clean the URL.
		const params = new URLSearchParams(window.location.search);
		if (params.get('oauth') === 'connected') notice = 'Connected via OAuth.';
		const oauthError = params.get('oauthError');
		if (oauthError) notice = `Sign-in failed: ${oauthError}`;
		if (params.get('oauth') || oauthError)
			history.replaceState(null, '', window.location.pathname);
		void load();
	});

	async function load() {
		status = await (await fetch('/api/publish')).json();
		if (status) {
			service = status.credentials.service;
			identifier = status.credentials.identifier;
			oauthHandle = status.credentials.handle ?? '';
			title = status.config.title || status.graphName;
			summary = status.config.summary;
			key = status.config.key;
			treatmentId = status.config.treatmentId ?? '';
		}
		await loadDrafts();
	}

	/** Every essay draft in the graph, whichever group it was written from. */
	async function loadDrafts() {
		const res = await fetch('/api/prose?list=1');
		const data = await res.json();
		drafts = data.drafts ?? [];
		if (treatmentId && !drafts.some((d) => d.id === treatmentId)) treatmentId = '';
	}

	async function post(path: string, body: object): Promise<{ ok: boolean; data: any }> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
		return { ok: res.ok, data };
	}

	async function signInWithOauth() {
		notice = '';
		busy = 'oauth';
		const { ok, data } = await post('/api/publish/oauth/start', { handle: oauthHandle });
		if (!ok) {
			busy = '';
			notice = data.error;
			return;
		}
		// Off to the PDS authorization page; it redirects back to /publish.
		window.location.href = data.url;
	}

	async function disconnect() {
		notice = '';
		busy = 'disconnect';
		const { ok, data } = await post('/api/publish/oauth/disconnect', {});
		busy = '';
		if (!ok) {
			notice = data.error;
			return;
		}
		if (status) status.credentials = data.credentials;
		plan = null;
		notice = 'Disconnected. Published records are untouched.';
	}

	async function connect() {
		notice = '';
		busy = 'connect';
		const { ok, data } = await post('/api/publish/settings', { service, identifier, appPassword });
		busy = '';
		if (!ok) {
			notice = data.error;
			return;
		}
		appPassword = '';
		if (status) status.credentials = data.credentials;
		notice = `Connected as ${data.credentials.handle ?? data.credentials.did}.`;
	}

	async function preview() {
		notice = '';
		outcome = null;
		busy = 'preview';
		const { ok, data } = await post('/api/publish/preview', {
			key,
			treatmentId: treatmentId || null,
			title,
			summary
		});
		busy = '';
		if (!ok) {
			plan = null;
			notice = data.error;
			return;
		}
		plan = data.plan;
		changeNotes = Object.fromEntries(
			(data.plan.changedThoughts as PlanDto['changedThoughts']).map((c) => [
				c.thoughtId,
				changeNotes[c.thoughtId] ?? ''
			])
		);
	}

	async function publish() {
		notice = '';
		busy = 'publish';
		const { ok, data } = await post('/api/publish/run', { changeNotes });
		busy = '';
		if (!ok) {
			notice = data.error;
			return;
		}
		outcome = data.outcome;
		plan = null;
		const statusRes = await fetch('/api/publish');
		status = await statusRes.json();
	}

	async function withdraw() {
		const confirmed = await dialogs.confirm(
			'Take the whole garden down? Every published record is deleted from your repository. Third-party copies cannot be recalled. Your local graph is untouched.',
			'Withdraw garden'
		);
		if (!confirmed) return;
		notice = '';
		busy = 'withdraw';
		const { ok, data } = await post('/api/publish/withdraw', {});
		busy = '';
		if (!ok) {
			notice = data.error;
			return;
		}
		outcome = data.outcome;
		plan = null;
		const statusRes = await fetch('/api/publish');
		status = await statusRes.json();
	}

	const draftLabel = (d: ProseDraftSummary) =>
		`${d.style} — “${d.title}”${d.groupName ? ` · ${d.groupName}` : ''} (${new Date(
			d.generatedAt
		).toLocaleDateString()})${d.stale ? ' · no longer matches its thoughts' : ''}`;
</script>

<svelte:head>
	<title>Publish garden — Trellis</title>
</svelte:head>

<div class="page">
	<header class="top">
		<a class="back" href="/"><Icon name="undo" /> Back to the workspace</a>
		<h1>Publish garden</h1>
		<p class="sub">
			Publishing puts this graph — reviewed diff and all — into your own atproto repository and
			renders it as a public website. Ratifying a thought changes local state; publication is this
			separate, deliberate act.
		</p>
	</header>

	{#if notice}
		<p class="notice" role="status">{notice}</p>
	{/if}

	{#if status}
		{#if status.gardens.length && status.gardenIdent}
			<section class="card live">
				<div class="section-head">What's live</div>
				<p class="hint">
					Each graph you publish is its own garden; they sit side by side under your identity, and
					<a class="garden-link" href="/garden/{encodeURIComponent(status.gardenIdent)}"
						>/garden/{status.gardenIdent}</a
					> lists them all.
				</p>
				<ul class="gardens">
					{#each status.gardens as garden (garden.graphId)}
						<li class={garden.graphId === status.graphId ? 'current' : ''}>
							<a
								class="garden-link"
								href="/garden/{encodeURIComponent(status.gardenIdent)}/{encodeURIComponent(
									garden.key
								)}">{garden.title}</a
							>
							<span class="garden-meta">
								{garden.graphName}{garden.graphId === status.graphId ? ' · this graph' : ''} ·
								{garden.thoughts} thoughts
							</span>
						</li>
					{/each}
				</ul>
				{#if thisGarden}
					<p class="hint">
						This graph's garden holds {status.live.thoughts} thoughts, {status.live.revisions} revisions,
						{status.live.relations} connections{status.live.treatments ? ', 1 essay' : ''}.
					</p>
				{/if}
				{#if status.lastRelease && status.lastRelease.status !== 'complete'}
					<p class="warn">
						The last release {status.lastRelease.status === 'noop'
							? 'had nothing to publish'
							: `finished ${status.lastRelease.status}`} — preview and publish again to retry what
						is missing.
					</p>
				{/if}
				{#if thisGarden}
					<button class="danger" onclick={withdraw} disabled={busy !== ''}>
						{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw this graph’s garden…'}
					</button>
				{/if}
			</section>
		{/if}

		<section class="card">
			<div class="section-head">1 · Account</div>
			<p class="hint">
				Records publish to your own data repository under your identity. Sign in through your PDS —
				Trellis never sees your password.
			</p>
			{#if connected}
				<div class="row">
					<span class="ok">✓ {status.credentials.handle ?? status.credentials.did}</span>
					<span class="hint-inline"
						>via {status.credentials.method === 'oauth' ? 'OAuth' : 'app password'}</span
					>
					{#if status.credentials.method === 'oauth'}
						<button onclick={disconnect} disabled={busy !== ''}>
							{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
						</button>
					{/if}
				</div>
			{/if}
			{#if !connected || status.credentials.method !== 'oauth'}
				<div class="row oauth-row">
					<label class="grow"
						>Handle
						<input bind:value={oauthHandle} placeholder="you.bsky.social" /></label
					>
					<button class="primary-action" onclick={signInWithOauth} disabled={busy !== '' || !oauthHandle.trim()}>
						{busy === 'oauth' ? 'Redirecting…' : 'Sign in via your PDS'}
					</button>
				</div>
			{/if}
			<details class="fallback">
				<summary>Use an app password instead (for a PDS without OAuth)</summary>
				<div class="grid">
					<label>PDS service <input bind:value={service} placeholder="https://bsky.social" /></label>
					<label>Handle <input bind:value={identifier} placeholder="you.example.com" /></label>
					<label
						>App password
						<input
							type="password"
							bind:value={appPassword}
							placeholder={status.credentials.hasPassword ? '•••• (unchanged)' : 'xxxx-xxxx-xxxx-xxxx'}
						/></label
					>
				</div>
				<div class="row">
					<button onclick={connect} disabled={busy !== ''}>
						{busy === 'connect' ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
					</button>
				</div>
			</details>
		</section>

		<section class="card">
			<div class="section-head">2 · The release</div>
			<div class="grid">
				<label>Garden title <input bind:value={title} maxlength={120} /></label>
				<label
					>Garden address
					<input
						bind:value={key}
						maxlength={63}
						placeholder="my-garden"
						onchange={() => (plan = null)}
					/></label
				>
				<label
					>Front-door essay
					<select bind:value={treatmentId} onchange={() => (plan = null)}>
						<option value="">None — thoughts only</option>
						{#each drafts as d (d.id)}
							<option value={d.id}>{draftLabel(d)}</option>
						{/each}
					</select></label
				>
			</div>
			<label class="wide"
				>Introduction (optional, in your own words)
				<textarea bind:value={summary} rows="3" maxlength={3000}></textarea></label
			>
			<p class="hint">
				The whole graph publishes — every thought, every connection between them, and the selected
				essay. Conversations, notes, proposals, writing guidance, and unpublished history stay
				local. Other graphs you publish keep their own gardens, untouched by this release.
			</p>
			{#if gardenUrl}
				<p class="hint">
					This garden reads at <code>{gardenUrl}</code>.
					{#if thisGarden && thisGarden.key !== key}
						Changing the address moves it: the garden at <code>{thisGarden.key}</code> comes down in
						this release and old links stop working.
					{/if}
				</p>
			{/if}
			<div class="row">
				<button onclick={preview} disabled={busy !== '' || !connected}>
					{busy === 'preview' ? 'Building preview…' : 'Preview the release'}
				</button>
				{#if !connected}<span class="hint">Connect the account first.</span>{/if}
			</div>
		</section>

		{#if plan}
			<section class="card">
				<div class="section-head">3 · Review</div>
				{#each plan.warnings as warning, i (i)}
					<p class="warn">{warning}</p>
				{/each}
				{#if !plan.puts.length && !plan.deletes.length}
					<p>Everything is already live — there is nothing to publish.</p>
				{:else}
					{#if plan.newThoughts.length}
						<h3>Going public for the first time</h3>
						<ul>
							{#each plan.newThoughts as t (t.thoughtId)}
								<li>{t.title}</li>
							{/each}
						</ul>
					{/if}
					{#if plan.changedThoughts.length}
						<h3>Public revisions</h3>
						<p class="hint">
							Readers ask “what changed your mind?” — a short note travels with each revision.
						</p>
						<ul class="revisions">
							{#each plan.changedThoughts as c (c.thoughtId)}
								<li>
									<span class="rev-title">{c.title}</span>
									<span class="rev-changes">{c.changes.join(' · ')}</span>
									<textarea
										rows="2"
										maxlength={1000}
										placeholder="Why did this change? (optional, published)"
										bind:value={changeNotes[c.thoughtId]}
									></textarea>
								</li>
							{/each}
						</ul>
					{/if}
					{#if plan.deletes.length}
						<h3>Coming down</h3>
						<ul>
							{#each plan.deletes as d (d.collection + d.rkey)}
								<li>{d.label}</li>
							{/each}
						</ul>
					{/if}
					<p class="hint">
						{plan.puts.length} record(s) to write, {plan.deletes.length} to delete,
						{plan.unchanged} unchanged.
					</p>
					<details>
						<summary>Inspect the exact records</summary>
						<pre>{JSON.stringify(plan.puts.map((p) => p.record), null, 2)}</pre>
					</details>
					<div class="row">
						<button class="primary" onclick={publish} disabled={busy !== ''}>
							{busy === 'publish' ? 'Publishing…' : 'Publish this release'}
						</button>
					</div>
				{/if}
			</section>
		{/if}

		{#if outcome}
			<section class="card">
				<div class="section-head">Result — {outcome.status}</div>
				{#if outcome.status === 'noop'}
					<p>Nothing needed publishing.</p>
				{:else}
					<ul class="results">
						{#each outcome.results as r, i (i)}
							<li class={r.ok ? 'ok-row' : 'err-row'}>
								<span class="mark">{r.ok ? '✓' : '✕'}</span>
								<span>{r.action === 'delete' ? 'deleted' : 'published'} {r.label}</span>
								{#if r.error}<span class="err">{r.error}</span>{/if}
							</li>
						{/each}
					</ul>
					{#if outcome.status !== 'complete'}
						<p class="warn">Some writes failed. Preview and publish again to retry only those.</p>
					{/if}
				{/if}
			</section>
		{/if}
	{:else}
		<p class="hint">Loading…</p>
	{/if}
</div>

<AppDialog />

<style>
	.page {
		min-height: 100vh;
		background: var(--paper);
		color: var(--ink);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		font-size: var(--fs-13);
		padding: 32px 20px 80px;
	}
	.page > * {
		max-width: 720px;
		margin-left: auto;
		margin-right: auto;
	}
	.top {
		margin-bottom: 20px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-muted);
		text-decoration: none;
		font-size: var(--fs-12);
		margin-bottom: 16px;
	}
	.back:hover {
		color: var(--blue);
	}
	h1 {
		font-size: var(--fs-22);
		font-weight: 800;
		margin: 0 0 6px;
	}
	.sub {
		color: var(--ink-soft);
		line-height: 1.5;
		margin: 0;
	}
	.notice {
		background: var(--parchment);
		border: 1px solid var(--gold-soft);
		color: var(--gold-deep);
		border-radius: 8px;
		padding: 10px 14px;
		margin: 0 auto 16px;
	}
	.card {
		background: var(--paper-panel);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		padding: 18px 20px;
		margin-bottom: 16px;
		box-shadow: var(--shadow-rest);
	}
	.section-head {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: var(--fs-11);
		font-weight: 700;
		color: var(--ink-muted);
		margin-bottom: 10px;
	}
	.hint {
		color: var(--ink-quiet);
		font-size: var(--fs-12);
		line-height: 1.5;
		margin: 0 0 10px;
	}
	.warn {
		border: 1.5px dashed var(--gold-soft);
		background: var(--parchment);
		color: var(--gold-deep);
		border-radius: 8px;
		font-size: var(--fs-12);
		padding: 8px 12px;
		margin: 0 0 10px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
		margin-bottom: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-11);
		font-weight: 600;
		color: var(--ink-faded);
	}
	label.wide {
		margin-bottom: 12px;
	}
	input,
	select,
	textarea {
		font: inherit;
		font-size: var(--fs-12-5);
		font-weight: 400;
		color: var(--ink);
		background: var(--card-white);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 7px 9px;
	}
	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--blue);
		outline: 2px solid var(--focus-glow);
	}
	textarea {
		resize: vertical;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 600;
		color: var(--ink-soft);
		background: var(--card-white);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 6px 14px;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		color: var(--blue);
		border-color: var(--blue);
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button.danger:hover:not(:disabled) {
		color: var(--rust);
		border-color: var(--rust);
	}
	.ok {
		color: var(--moss-ink);
		font-weight: 600;
	}
	.hint-inline {
		color: var(--ink-quiet);
		font-size: var(--fs-11);
	}
	.oauth-row {
		align-items: flex-end;
		margin-bottom: 10px;
	}
	.oauth-row .grow {
		flex: 1;
		max-width: 320px;
	}
	.fallback {
		margin-top: 6px;
	}
	.fallback summary {
		color: var(--ink-quiet);
		font-size: var(--fs-11-5);
	}
	.fallback .grid {
		margin-top: 10px;
	}
	h3 {
		font-size: var(--fs-13);
		font-weight: 700;
		margin: 14px 0 6px;
	}
	ul {
		margin: 0 0 8px;
		padding-left: 20px;
		line-height: 1.6;
	}
	.revisions {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.revisions li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: var(--card-white);
		border: 1px solid var(--card-border);
		border-radius: 8px;
		padding: 10px 12px;
	}
	.rev-title {
		font-weight: 600;
	}
	.rev-changes {
		font-size: var(--fs-11);
		color: var(--ink-muted);
	}
	details {
		margin: 10px 0;
	}
	summary {
		cursor: pointer;
		color: var(--ink-muted);
		font-size: var(--fs-12);
	}
	pre {
		background: var(--inset-fill);
		border: 1px solid var(--divider);
		border-radius: 8px;
		padding: 12px;
		overflow: auto;
		max-height: 360px;
		font-size: var(--fs-11);
	}
	.results {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.results li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.mark {
		font-weight: 700;
	}
	.ok-row .mark {
		color: var(--accept-green);
	}
	.err-row .mark,
	.err {
		color: var(--rust);
	}
	.err {
		font-size: var(--fs-11);
	}
	.garden-link {
		color: var(--blue);
		font-weight: 600;
		text-decoration: none;
	}
	.live p {
		margin: 0 0 10px;
		line-height: 1.5;
	}
	.gardens {
		list-style: none;
		padding: 0;
		margin: 0 0 12px;
		display: grid;
		gap: 8px;
	}
	.gardens li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-left: 2px solid var(--divider);
		padding-left: 10px;
	}
	.gardens li.current {
		border-left-color: var(--blue);
	}
	.garden-meta {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
	code {
		font-size: var(--fs-11-5);
		background: var(--inset-fill);
		border: 1px solid var(--divider);
		border-radius: 4px;
		padding: 1px 5px;
	}
</style>
