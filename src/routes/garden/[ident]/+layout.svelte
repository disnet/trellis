<script lang="ts">
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	const handle = $derived(data.view.identity.handle ?? data.view.identity.did);
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
</style>
