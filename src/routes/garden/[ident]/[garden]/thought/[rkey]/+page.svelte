<script lang="ts">
	import { authorshipLabel, formatDate, sourceHref } from '$lib/garden/format';
	import { fromPublicConfidence, RELATION_LABELS } from '$lib/garden/lexicon';
	import StatusPill from '$lib/garden/ui/StatusPill.svelte';
	import TypeChip from '$lib/garden/ui/TypeChip.svelte';
	import { formatConfidence } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const view = $derived(data.view);
	const thought = $derived(view.byRkey[data.rkey]);
	/** Oldest first from the reader; show newest first, current on top. */
	const history = $derived([...thought.revisions].reverse());
	const current = $derived(history[0]);
	const outgoing = $derived(view.relations.filter((r) => r.fromRkey === thought.rkey));
	const incoming = $derived(view.relations.filter((r) => r.toRkey === thought.rkey));
	const src = $derived(thought.record.source ? sourceHref(thought.record.source) : null);
</script>

<svelte:head>
	<title>{thought.record.title} — {view.garden.title}</title>
</svelte:head>

<nav class="crumb">
	<a href={data.base}>← {view.garden.title}</a>
</nav>

<article>
	<header class="head">
		<span class="tags">
			<TypeChip type={thought.record.thoughtType} />
			<StatusPill status={thought.record.status} />
			{#if thought.record.confidence}
				<span class="confidence"
					>{formatConfidence(fromPublicConfidence(thought.record.confidence))}</span
				>
			{/if}
		</span>
		<h1>{thought.record.title}</h1>
	</header>

	<p class="statement">{thought.record.statement}</p>

	{#if thought.record.source}
		<p class="source">
			Source:
			{#if src}
				<a href={src} rel="noopener nofollow">{thought.record.source}</a>
			{:else}
				{thought.record.source}
			{/if}
		</p>
	{/if}

	{#if current}
		<p class="provenance">
			This version {authorshipLabel(current.record.authorship)} · first published
			{formatDate(thought.record.firstPublishedAt)}{#if history.length > 1}&nbsp;· last revised
				{formatDate(current.record.publishedAt)}{/if}
		</p>
	{/if}

	{#if outgoing.length || incoming.length}
		<section>
			<h2 class="section-label">Connections</h2>
			<ul class="relations">
				{#each outgoing as rel (rel.uri)}
					{@const other = view.byRkey[rel.toRkey]}
					<li>
						<span class="rel-label">{RELATION_LABELS[rel.record.relationType].forward}</span>
						<a href="{data.base}/thought/{encodeURIComponent(rel.toRkey)}">{other.record.title}</a>
						<span class="rel-status">{other.record.status}</span>
					</li>
				{/each}
				{#each incoming as rel (rel.uri)}
					{@const other = view.byRkey[rel.fromRkey]}
					<li>
						<span class="rel-label">{RELATION_LABELS[rel.record.relationType].reverse}</span>
						<a href="{data.base}/thought/{encodeURIComponent(rel.fromRkey)}">{other.record.title}</a>
						<span class="rel-status">{other.record.status}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if history.length > 1}
		<section>
			<h2 class="section-label">How this thought has moved</h2>
			<ol class="history">
				{#each history as rev, i (rev.rkey)}
					<li>
						<span class="rev-date">{formatDate(rev.record.publishedAt)}</span>
						<div class="rev-body">
							<span class="rev-head">
								{#if i === 0}<strong>current</strong> ·{/if}
								{rev.record.status} · {authorshipLabel(rev.record.authorship)}
							</span>
							{#if rev.record.changeNote}
								<p class="rev-note">{rev.record.changeNote}</p>
							{/if}
							{#if i > 0}
								<details>
									<summary>Read this earlier version</summary>
									<p class="rev-title">{rev.record.title}</p>
									<p class="rev-statement">{rev.record.statement}</p>
									{#if rev.record.confidence}
										<p class="rev-statement">
											Confidence: {formatConfidence(fromPublicConfidence(rev.record.confidence))}
										</p>
									{/if}
								</details>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</article>

<style>
	.crumb {
		margin-bottom: 28px;
		font-size: 13.5px;
	}
	.crumb a {
		color: var(--ink-muted);
		text-decoration: none;
	}
	.crumb a:hover {
		color: var(--blue);
	}
	.head {
		margin-bottom: 14px;
	}
	.tags {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 10px;
	}
	.confidence {
		font-size: 12px;
		font-weight: 700;
		color: var(--plum-ink);
		background: var(--confidence-fill);
		border: 1px solid var(--confidence-border);
		border-radius: 999px;
		padding: 1px 9px;
	}
	h1 {
		font-size: 26px;
		font-weight: 800;
		margin: 0;
		line-height: 1.25;
	}
	.statement {
		font-size: 17px;
		line-height: 1.65;
		color: var(--ink-soft);
		white-space: pre-line;
		margin: 0 0 14px;
	}
	.source {
		font-size: 14px;
		color: var(--ink-faded);
		margin: 0 0 8px;
		overflow-wrap: anywhere;
	}
	.source a {
		color: inherit;
		border-bottom: 1.5px dotted var(--blue);
		text-decoration: none;
	}
	.source a:hover {
		color: var(--blue);
	}
	.provenance {
		font-size: 12.5px;
		color: var(--ink-quiet);
		margin: 0;
	}

	.section-label {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-muted);
		margin: 36px 0 12px;
	}
	.relations {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.relations li {
		font-size: 14.5px;
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.rel-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
		background: var(--chip-neutral);
		border-radius: 4px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	.relations a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1.5px dotted var(--blue);
	}
	.relations a:hover {
		color: var(--blue);
	}
	.rel-status {
		font-size: 12px;
		color: var(--ink-quiet);
	}

	.history {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	.history li {
		display: flex;
		gap: 14px;
	}
	.rev-date {
		flex: none;
		width: 92px;
		font-size: 12.5px;
		color: var(--ink-quiet);
		padding-top: 2px;
	}
	.rev-body {
		border-left: 2px solid var(--divider);
		padding-left: 14px;
		font-size: 14px;
	}
	.rev-head {
		color: var(--ink-faded);
	}
	.rev-note {
		margin: 6px 0 0;
		color: var(--ink-soft);
		line-height: 1.55;
	}
	details {
		margin-top: 8px;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
		color: var(--ink-muted);
	}
	summary:hover {
		color: var(--blue);
	}
	.rev-title {
		font-weight: 600;
		margin: 8px 0 4px;
	}
	.rev-statement {
		margin: 0 0 4px;
		color: var(--ink-soft);
		line-height: 1.55;
		white-space: pre-line;
	}
</style>
