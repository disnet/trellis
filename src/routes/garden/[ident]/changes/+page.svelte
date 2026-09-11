<script lang="ts">
	import { authorshipLabel, formatDate } from '$lib/garden/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const view = $derived(data.view);
</script>

<svelte:head>
	<title>What changed — {view.garden.title}</title>
</svelte:head>

<nav class="crumb">
	<a href={data.base}>← {view.garden.title}</a>
</nav>

<h1>What changed</h1>
<p class="intro">
	Every public revision, newest first. A revision replaces the version before it; earlier versions
	stay readable on each thought's page.
</p>

<ol class="log">
	{#each view.changes as change (change.revisionRkey)}
		<li>
			<span class="date">{formatDate(change.revision.publishedAt)}</span>
			<div class="entry">
				<a href="{data.base}/thought/{encodeURIComponent(change.thoughtRkey)}"
					>{change.thoughtTitle}</a
				>
				{#if !change.revision.prev}
					<span class="badge">first published</span>
				{:else if change.prev && change.prev.status !== change.revision.status}
					<span class="badge">{change.prev.status} → {change.revision.status}</span>
				{:else}
					<span class="badge">revised</span>
				{/if}
				<span class="who">{authorshipLabel(change.revision.authorship)}</span>
				{#if change.revision.changeNote}
					<p class="note">{change.revision.changeNote}</p>
				{/if}
			</div>
		</li>
	{/each}
</ol>

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
	h1 {
		font-size: 26px;
		font-weight: 800;
		margin: 0 0 8px;
	}
	.intro {
		color: var(--ink-muted);
		font-size: 14.5px;
		margin: 0 0 28px;
		line-height: 1.55;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	.log li {
		display: flex;
		gap: 14px;
	}
	.date {
		flex: none;
		width: 92px;
		font-size: 12.5px;
		color: var(--ink-quiet);
		padding-top: 2px;
	}
	.entry {
		font-size: 14.5px;
		line-height: 1.5;
	}
	.entry a {
		color: inherit;
		font-weight: 600;
		text-decoration: none;
		border-bottom: 1.5px dotted var(--blue);
	}
	.entry a:hover {
		color: var(--blue);
	}
	.badge {
		font-size: 12px;
		color: var(--ink-faded);
		background: var(--pill-fill);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0 8px;
		margin-left: 6px;
		white-space: nowrap;
	}
	.who {
		display: block;
		font-size: 12.5px;
		color: var(--ink-quiet);
	}
	.note {
		margin: 4px 0 0;
		color: var(--ink-soft);
	}
</style>
