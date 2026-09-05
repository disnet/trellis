<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/appearance.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	/* The type scale. Every font-size in the app is one of these tokens, so the
	   appearance control can resize the whole interface from a single variable.
	   Token names carry their base size in px; --font-scale is set on the root
	   element by $lib/appearance.svelte. */
	:global(:root) {
		--font-scale: 1;
		--fs-9: calc(9px * var(--font-scale));
		--fs-10: calc(10px * var(--font-scale));
		--fs-11: calc(11px * var(--font-scale));
		--fs-11-5: calc(11.5px * var(--font-scale));
		--fs-12: calc(12px * var(--font-scale));
		--fs-12-5: calc(12.5px * var(--font-scale));
		--fs-13: calc(13px * var(--font-scale));
		--fs-15: calc(15px * var(--font-scale));
		--fs-16: calc(16px * var(--font-scale));
		--fs-17: calc(17px * var(--font-scale));
	}
</style>
