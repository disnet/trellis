<script lang="ts">
	import {
		appearance,
		FONT_SCALE_MAX,
		FONT_SCALE_MIN,
		FONT_SCALE_STEP
	} from '$lib/appearance.svelte';
	import Icon from './Icon.svelte';

	let open = $state(false);
	const atMin = $derived(appearance.fontScale <= FONT_SCALE_MIN);
	const atMax = $derived(appearance.fontScale >= FONT_SCALE_MAX);
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

<div class="switcher">
	<button class="trigger" aria-expanded={open} aria-controls="appearance-options"
		title="Appearance — text size" onclick={() => open = !open}>
		Aa{#if !appearance.isDefault}<span class="pct">{appearance.fontPercent}%</span>{/if}
		<Icon name="chevron-down" size="0.9em" />
	</button>
	{#if open}
		<div class="options" id="appearance-options">
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
				<button class="done" onclick={() => open = false}>Done</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.switcher { position: relative; flex-shrink: 0; }
	button { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--control-border); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
	button:disabled { opacity: .45; cursor: not-allowed; }
	button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	.pct { margin-left: 5px; font-variant-numeric: tabular-nums; color: var(--ink-muted); }
	.options { position: absolute; top: calc(100% + 10px); right: 0; z-index: 100; width: 230px; padding: 14px; background: var(--paper-raised); border: 1px solid var(--control-border); border-radius: 8px; box-shadow: var(--shadow-menu); text-align: left; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--fs-12); font-weight: 600; }
	.stepper { display: flex; align-items: center; gap: 6px; }
	.stepper button { padding: 3px 8px; line-height: 1.2; }
	output { font-size: var(--fs-11-5); font-variant-numeric: tabular-nums; color: var(--ink-muted); min-width: 4ch; text-align: center; }
	input[type='range'] { width: 100%; margin: 10px 0 0; accent-color: var(--blue); }
	.foot { display: flex; gap: 6px; margin-top: 12px; }
	.foot button { flex: 1; }
	.done { border-color: var(--card-border); }
</style>
