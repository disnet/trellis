<script lang="ts">
	import type { ThoughtStatus } from '$lib/types';

	let { status }: { status: ThoughtStatus } = $props();
</script>

<!-- Status is epistemic state, so it never relies on color alone: the pill
     carries the word itself, with border style marking the settled/unsettled
     divide (dashed = still moving, solid = held, dotted = retired). -->
<span class="pill {status}">{status}</span>

<style>
	.pill {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		border-radius: 999px;
		padding: 1px 9px;
		background: var(--pill-fill);
		color: var(--ink-faded);
		border: 1px solid var(--control-border);
	}
	.tentative,
	.developing {
		border-style: dashed;
	}
	.contested {
		border-style: dashed;
		color: var(--rust);
		border-color: var(--rust);
		background: var(--rust-wash);
	}
	.retired {
		border-style: dotted;
		color: var(--ink-quiet);
	}
</style>
