<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="missing">
	<h1>{page.status === 404 ? 'No garden here' : 'Something went wrong'}</h1>
	<p>
		{page.error?.message ?? 'This garden could not be loaded.'}
	</p>
</div>

<style>
	.missing {
		min-height: 100vh;
		background: var(--paper);
		color: var(--ink);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 20px;
		text-align: center;
	}
	h1 {
		font-size: 24px;
		font-weight: 800;
		margin: 0;
	}
	p {
		color: var(--ink-muted);
		font-size: 15px;
		margin: 0;
	}
</style>
