<script lang="ts">
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	const handle = $derived(data.identity.handle ?? data.identity.did);
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="garden">
	<main>
		{@render children()}
	</main>
	<footer>
		<span
			>A public garden by <strong>{handle}</strong> — thoughts carry their status, sources, and
			revisions.</span
		>
		{#if data.gardens.length > 1}
			<span class="others">
				More from {handle}:
				{#each data.gardens as garden, i (garden.key)}<a
						href="{data.identBase}/{encodeURIComponent(garden.key)}">{garden.record.title}</a
					>{#if i < data.gardens.length - 1}<span class="sep"> · </span>{/if}{/each}
			</span>
		{/if}
		<span class="grown">Grown in Trellis · published on the AT Protocol</span>
	</footer>
</div>

<style>
	/* The garden is a reading surface on the same warm paper as the desk, but
	   at reading sizes. It ships no JavaScript, so type is fixed rather than
	   driven by the workspace appearance scale. */
	.garden {
		min-height: 100vh;
		background: var(--paper);
		color: var(--ink);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		font-size: 16px;
		display: flex;
		flex-direction: column;
	}
	main {
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		padding: 48px 20px 64px;
		box-sizing: border-box;
		flex: 1;
	}
	footer {
		border-top: 1px solid var(--hairline);
		background: var(--paper-panel);
		color: var(--ink-muted);
		font-size: 12.5px;
		padding: 18px 20px 28px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: center;
		text-align: center;
	}
	.grown {
		color: var(--ink-quiet);
	}
	.others a {
		color: var(--ink-muted);
		text-decoration: none;
		border-bottom: 1px dotted var(--control-border);
	}
	.others a:hover {
		color: var(--blue);
	}
	.sep {
		color: var(--ink-quiet);
	}
</style>
