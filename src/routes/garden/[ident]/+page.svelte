<script lang="ts">
	// The identity's front door: every garden published under it. One author
	// can keep several graphs growing in public side by side.
	import { formatDate } from '$lib/garden/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const handle = $derived(data.identity.handle ?? data.identity.did);
	const gardens = $derived(data.gardens);
</script>

<svelte:head>
	<title>Gardens by {handle}</title>
	<meta name="description" content="The public thinking gardens of {handle}." />
</svelte:head>

<header class="front">
	<p class="kicker">Thinking gardens</p>
	<h1>{handle}</h1>
	<p class="byline">
		{gardens.length === 1 ? 'One garden' : `${gardens.length} gardens`} growing in public — each a
		graph of thoughts with its own status, sources, and revisions.
	</p>
</header>

<ul class="gardens">
	{#each gardens as garden (garden.key)}
		<li>
			<a class="card" href="{data.identBase}/{encodeURIComponent(garden.key)}">
				<span class="card-title">{garden.record.title}</span>
				{#if garden.record.summary}
					<span class="card-summary">{garden.record.summary}</span>
				{/if}
				<span class="card-meta">
					{garden.record.release.thoughts.length}
					{garden.record.release.thoughts.length === 1 ? 'thought' : 'thoughts'}
					{#if garden.record.treatment}<span class="dot">·</span> with an essay{/if}
					<span class="dot">·</span> last release {formatDate(garden.record.release.publishedAt)}
				</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.front {
		margin-bottom: 32px;
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
		overflow-wrap: anywhere;
	}
	.byline {
		color: var(--ink-muted);
		font-size: 13.5px;
		line-height: 1.55;
		margin: 0;
	}
	.gardens {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--card-white);
		border: 1.5px solid var(--card-border);
		border-radius: 8px;
		box-shadow: var(--shadow-rest);
		padding: 18px 20px;
		text-decoration: none;
		color: inherit;
	}
	.card:hover {
		border-color: var(--blue);
	}
	.card-title {
		font-weight: 700;
		font-size: 19px;
	}
	.card-summary {
		font-size: 14.5px;
		line-height: 1.55;
		color: var(--ink-soft);
		white-space: pre-line;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-meta {
		font-size: 12.5px;
		color: var(--ink-quiet);
	}
	.dot {
		padding: 0 2px;
	}
</style>
