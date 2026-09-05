<script lang="ts">
	// The chrome icon set: drawn once, in one voice — 16-unit grid, 1.5 stroke,
	// round caps, currentColor. Semantic text badges (✳ ✎ ◇ ↖ ⚑) are system
	// vocabulary and are not icons; they stay as type.
	interface Props {
		name: keyof typeof ICONS;
		/** CSS size; em-relative by default so icons follow the type scale. */
		size?: string;
	}

	let { name, size = '1.1em' }: Props = $props();

	const ICONS = {
		// Views
		canvas: { d: 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z' },
		outline: { d: 'M3 4.5h10M3 8h10M3 11.5h10' },
		browse: { d: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6' },
		// Zoom
		'zoom-in': { d: 'M10.1 10.1l3.4 3.4M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0M7 5.2v3.6M5.2 7h3.6' },
		'zoom-out': { d: 'M10.1 10.1l3.4 3.4M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0M5.2 7h3.6' },
		// Utilities
		clear: { d: 'M13.5 8a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0M4.1 11.9l7.8-7.8' },
		undo: { d: 'M6.5 3.5L3.5 6.5l3 3M3.5 6.5H10a3.5 3.5 0 0 1 0 7H7' },
		download: { d: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10' },
		pencil: { d: 'M11.2 2.8a1.55 1.55 0 0 1 2.2 2.2L6.2 12.2 3 13l0.8-3.2z' },
		plus: { d: 'M8 3.5v9M3.5 8h9' },
		x: { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' },
		ellipsis: { d: 'M3.5 8h.01M8 8h.01M12.5 8h.01', dots: true },
		// Disclosure / sort
		'chevron-down': { d: 'M4.5 6.5L8 10l3.5-3.5' },
		'caret-up': { d: 'M8 5.2L11 9.8H5z', filled: true },
		'caret-down': { d: 'M8 10.8L5 6.2h6z', filled: true }
	} as const;

	const icon = $derived(ICONS[name] as { d: string; filled?: boolean; dots?: boolean });
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	aria-hidden="true"
	focusable="false"
	fill={icon.filled ? 'currentColor' : 'none'}
	stroke={icon.filled ? 'none' : 'currentColor'}
	stroke-width={icon.dots ? 2.6 : 1.5}
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d={icon.d} />
</svg>

<style>
	svg {
		display: inline-block;
		vertical-align: -0.18em;
		flex-shrink: 0;
	}
</style>
