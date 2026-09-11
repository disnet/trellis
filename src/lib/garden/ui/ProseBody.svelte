<script lang="ts">
	// Renders a treatment body on the public page: the same restricted format
	// the workspace uses (headings, paragraphs, thought references), with
	// references resolved to permalinks inside the release. Anything that does
	// not resolve stays literal text — an unpublished thought never leaks more
	// than the label the author approved in the essay.
	import { proseBlocks, proseParts, parseProseReference } from '$lib/prose-format';
	import type { PublicThought } from '$lib/garden/reader';

	let {
		body,
		byRkey,
		base
	}: { body: string; byRkey: Record<string, PublicThought>; base: string } = $props();

	const blocks = $derived(proseBlocks(body));

	function refFor(part: string): { href: string; label: string } | { label: string } | null {
		const ref = parseProseReference(part);
		if (!ref) return null;
		const target = byRkey[ref.thoughtId];
		if (!target) return { label: ref.label ?? ref.thoughtId };
		return {
			href: `${base}/thought/${encodeURIComponent(ref.thoughtId)}`,
			label: ref.label ?? target.record.title
		};
	}
</script>

<div class="prose">
	{#each blocks as block, i (i)}
		{#if block.kind === 'p'}
			<p>
				{#each proseParts(block.text) as part, j (j)}
					{@const ref = refFor(part)}
					{#if ref && 'href' in ref}
						<a href={ref.href}>{ref.label}</a>
					{:else if ref}
						{ref.label}
					{:else}
						{part}
					{/if}
				{/each}
			</p>
		{:else if block.kind === 'h1'}
			<h2>{block.text}</h2>
		{:else}
			<h3>{block.text}</h3>
		{/if}
	{/each}
</div>

<style>
	.prose p {
		margin: 0 0 1.1em;
		line-height: 1.65;
	}
	.prose h2 {
		font-size: 1.25em;
		font-weight: 700;
		color: var(--ink);
		margin: 1.6em 0 0.5em;
	}
	.prose h3 {
		font-size: 1.05em;
		font-weight: 700;
		color: var(--ink);
		margin: 1.4em 0 0.4em;
	}
	.prose a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1.5px dotted var(--blue);
	}
	.prose a:hover {
		color: var(--blue);
	}
</style>
