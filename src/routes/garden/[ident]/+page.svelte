<script lang="ts">
	import { formatDate } from '$lib/garden/format';
	import ProseBody from '$lib/garden/ui/ProseBody.svelte';
	import StatusPill from '$lib/garden/ui/StatusPill.svelte';
	import TypeChip from '$lib/garden/ui/TypeChip.svelte';
	import { fromPublicConfidence, THOUGHT_TYPES } from '$lib/garden/lexicon';
	import { formatConfidence } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const view = $derived(data.view);
	const handle = $derived(view.identity.handle ?? view.identity.did);
	const pinned = $derived(view.pinnedRkeys.map((r) => view.byRkey[r]).filter(Boolean));
	/** Revisions of already-public thoughts — the evolution worth surfacing. */
	const meaningfulChanges = $derived(view.changes.filter((c) => c.revision.prev));
	const byType = $derived(
		THOUGHT_TYPES.map((type) => ({
			type,
			thoughts: view.thoughts.filter((t) => t.record.thoughtType === type)
		})).filter((g) => g.thoughts.length)
	);
</script>

<svelte:head>
	<title>{view.garden.title} — {handle}</title>
	<meta
		name="description"
		content={view.garden.summary ?? `The evolving thinking of ${handle}: ${view.garden.title}`}
	/>
</svelte:head>

<header class="front">
	<p class="kicker">A thinking garden</p>
	<h1>{view.garden.title}</h1>
	<p class="byline">
		by {handle} · last release {formatDate(view.garden.release.publishedAt)}
	</p>
	{#if view.garden.summary}
		<p class="summary">{view.garden.summary}</p>
	{/if}
</header>

{#if view.treatment}
	<article class="essay">
		<h2 class="essay-title">{view.treatment.record.title}</h2>
		<p class="essay-meta">
			Drafted by {view.treatment.record.model.split(':').pop()} · selected and approved by the author
			· {formatDate(view.treatment.record.publishedAt)}
		</p>
		{#if view.treatment.stale}
			<p class="stale">
				Some thoughts have moved on since this essay was written. The linked cards show the current
				position; a revised essay appears when the author approves one.
			</p>
		{/if}
		<ProseBody body={view.treatment.record.body} byRkey={view.byRkey} base={data.base} />
	</article>
{/if}

{#if pinned.length}
	<section>
		<h2 class="section-label">Pinned thoughts</h2>
		<ul class="cards">
			{#each pinned as thought (thought.rkey)}
				<li>
					<a class="card" href="{data.base}/thought/{encodeURIComponent(thought.rkey)}">
						<span class="card-head">
							<TypeChip type={thought.record.thoughtType} />
							<StatusPill status={thought.record.status} />
						</span>
						<span class="card-title">{thought.record.title}</span>
						<span class="card-statement">{thought.record.statement}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if meaningfulChanges.length}
	<section>
		<h2 class="section-label">What changed</h2>
		<ul class="changes">
			{#each meaningfulChanges.slice(0, 3) as change (change.revisionRkey)}
				<li>
					<span class="change-date">{formatDate(change.revision.publishedAt)}</span>
					<span>
						<a href="{data.base}/thought/{encodeURIComponent(change.thoughtRkey)}"
							>{change.thoughtTitle}</a
						>
						{#if change.prev && change.prev.status !== change.revision.status}
							<span class="shift">{change.prev.status} → {change.revision.status}</span>
						{/if}
						{#if change.revision.changeNote}
							<span class="note">{change.revision.changeNote}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
		<p class="more"><a href="{data.base}/changes">All changes →</a></p>
	</section>
{/if}

<section>
	<h2 class="section-label">All thoughts</h2>
	{#each byType as group (group.type)}
		<div class="type-group">
			<TypeChip type={group.type} />
			<ul class="index">
				{#each group.thoughts as thought (thought.rkey)}
					<li>
						<a href="{data.base}/thought/{encodeURIComponent(thought.rkey)}"
							>{thought.record.title}</a
						>
						<span class="index-status">{thought.record.status}</span>
						{#if thought.record.confidence}
							<span class="index-confidence"
								>{formatConfidence(fromPublicConfidence(thought.record.confidence))}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</section>

<style>
	.front {
		margin-bottom: 40px;
	}
	.kicker {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 12px;
		color: var(--ink-muted);
		margin: 0 0 6px;
	}
	h1 {
		font-size: 30px;
		font-weight: 800;
		letter-spacing: 0.01em;
		margin: 0 0 6px;
	}
	.byline {
		color: var(--ink-muted);
		font-size: 13.5px;
		margin: 0 0 18px;
	}
	.summary {
		font-size: 17px;
		line-height: 1.6;
		color: var(--ink-soft);
		margin: 0;
		white-space: pre-line;
	}

	.essay {
		background: var(--card-white);
		border: 1px solid var(--card-border);
		border-radius: 8px;
		box-shadow: var(--shadow-rest);
		padding: 28px 30px;
		margin: 0 0 40px;
		color: var(--ink-soft);
	}
	.essay-title {
		font-size: 22px;
		font-weight: 700;
		color: var(--ink);
		margin: 0 0 4px;
	}
	.essay-meta {
		font-size: 12.5px;
		color: var(--ink-quiet);
		margin: 0 0 18px;
	}
	.stale {
		border: 1.5px dashed var(--gold-soft);
		background: var(--parchment);
		color: var(--gold-deep);
		border-radius: 8px;
		font-size: 13.5px;
		padding: 10px 14px;
	}

	.section-label {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-muted);
		margin: 40px 0 14px;
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--card-white);
		border: 1.5px solid var(--card-border);
		border-radius: 8px;
		box-shadow: var(--shadow-rest);
		padding: 12px 14px;
		text-decoration: none;
		color: inherit;
	}
	.card:hover {
		border-color: var(--blue);
	}
	.card-head {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.card-title {
		font-weight: 600;
		font-size: 15.5px;
	}
	.card-statement {
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-soft);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.changes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.changes li {
		display: flex;
		gap: 14px;
		font-size: 14.5px;
		line-height: 1.5;
	}
	.change-date {
		flex: none;
		width: 92px;
		color: var(--ink-quiet);
		font-size: 12.5px;
		padding-top: 2px;
	}
	.changes a {
		color: inherit;
		font-weight: 600;
		text-decoration: none;
		border-bottom: 1.5px dotted var(--blue);
	}
	.changes a:hover {
		color: var(--blue);
	}
	.shift {
		font-size: 12px;
		color: var(--ink-faded);
		background: var(--pill-fill);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0 8px;
		margin-left: 6px;
		white-space: nowrap;
	}
	.note {
		display: block;
		color: var(--ink-soft);
	}
	.more {
		margin: 12px 0 0;
		font-size: 13.5px;
	}
	.more a {
		color: var(--ink-muted);
		text-decoration: none;
	}
	.more a:hover {
		color: var(--blue);
	}

	.type-group {
		margin: 0 0 18px;
	}
	.index {
		list-style: none;
		margin: 8px 0 0;
		padding: 0 0 0 2px;
		display: grid;
		gap: 6px;
	}
	.index li {
		font-size: 14.5px;
		display: flex;
		gap: 10px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.index a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1.5px dotted var(--blue);
	}
	.index a:hover {
		color: var(--blue);
	}
	.index-status {
		font-size: 12px;
		color: var(--ink-quiet);
	}
	.index-confidence {
		font-size: 12px;
		color: var(--plum-ink);
	}
</style>
