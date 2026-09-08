<script lang="ts">
	import {
		appearance,
		FONT_SCALE_MAX,
		FONT_SCALE_MIN,
		FONT_SCALE_STEP
	} from '$lib/appearance.svelte';
	import ControlPopover from './ControlPopover.svelte';

	let open = $state(false);
	const atMin = $derived(appearance.fontScale <= FONT_SCALE_MIN);
	const atMax = $derived(appearance.fontScale >= FONT_SCALE_MAX);
</script>

<ControlPopover label="Appearance" align="right" width={280} bind:open>
	{#snippet trigger()}
		Aa{#if !appearance.isDefault}<span class="pct">{appearance.fontPercent}%</span>{/if}
	{/snippet}
	{#snippet children(close)}
		<div class="options">
			<div class="row">
				<span id="text-size-label">Text size</span>
				<div class="stepper">
					<button aria-label="Smaller text" disabled={atMin}
						onclick={() => appearance.nudgeFontScale(-1)}>A−</button>
					<output aria-live="polite">{appearance.fontPercent}%</output>
					<button aria-label="Larger text" disabled={atMax}
						onclick={() => appearance.nudgeFontScale(1)}>A+</button>
				</div>
			</div>
			<input type="range" aria-labelledby="text-size-label"
				min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP}
				value={appearance.fontScale}
				oninput={(e) => appearance.setFontScale(e.currentTarget.valueAsNumber)} />
			<div class="foot">
				<button disabled={appearance.isDefault} onclick={() => appearance.reset()}>Reset</button>
				<button class="done" onclick={close}>Done</button>
			</div>
		</div>
	{/snippet}
</ControlPopover>

<style>
	button { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--control-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
	button:disabled { opacity: .45; cursor: not-allowed; }
	button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	.pct { margin-left: 5px; font-variant-numeric: tabular-nums; color: var(--ink-muted); }
	.options { padding: 8px; text-align: left; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--fs-12); font-weight: 600; }
	.stepper { display: flex; align-items: center; gap: 6px; }
	.stepper button { padding: 3px 8px; line-height: 1.2; }
	output { font-size: var(--fs-11-5); font-variant-numeric: tabular-nums; color: var(--ink-muted); min-width: 4ch; text-align: center; }
	input[type='range'] { width: 100%; margin: 10px 0 0; accent-color: var(--blue); }
	.foot { display: flex; gap: 6px; margin-top: 12px; }
	.foot button { flex: 1; }
	.done { border-color: var(--card-border); }
</style>
