<script lang="ts">
	import type { ThoughtType } from '$lib/types';

	let { type }: { type: ThoughtType } = $props();
</script>

<span class="chip {type}">{type}</span>

<style>
	/* The six specimen-tag pairings, exactly as bound in DESIGN.md. */
	.chip {
		display: inline-block;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-radius: 4px;
		padding: 1px 7px;
	}
	.claim { background: var(--moss); color: var(--moss-ink); }
	.question { background: var(--violet); color: var(--violet-ink); }
	.concept { background: var(--slate); color: var(--slate-ink); }
	.example { background: var(--clay); color: var(--clay-ink); }
	.prediction { background: var(--plum); color: var(--plum-ink); }
	.evidence { background: var(--ochre); color: var(--ochre-ink); }
</style>
