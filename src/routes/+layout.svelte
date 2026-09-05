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
	/* The palette (DESIGN.md "The Naturalist's Field Desk"). Core tokens carry the
	   documented names; the extended set below them names the recurring derived
	   fills so no component reaches for a raw hex. */
	:global(:root) {
		/* The One Ink — interaction only: selection, focus, hover, busy. */
		--blue: #3b5bdb;
		--blue-deep: #2c47b8; /* active-view text on --blue-wash */
		--blue-wash: #e9edfb;
		--focus-glow: #3b5bdb33;
		/* Warm inks */
		--ink: #2c2921;
		--ink-soft: #4d473c;
		--ink-faded: #5a523f;
		--ink-muted: #6d675c;
		--ink-quiet: #8a8375;
		/* Paper */
		--paper: #f6f3ec;
		--paper-panel: #fbf9f3;
		--paper-raised: #fffdf8;
		--card-white: #ffffff;
		--parchment: #fdf8ec;
		--inset-fill: #f2eee4; /* recessed strips: notes, history, table heads */
		--chip-neutral: #eee9dd;
		--pill-fill: #faf7f0;
		/* Warm lines */
		--hairline: #e0dbcf;
		--card-border: #c9c4b8;
		--control-border: #d5d0c4;
		--divider: #eae5d9;
		--dot-grid: #ddd8cc;
		--edge-ink: #a89f8d;
		--construction: #cfc8b8;
		/* Gold means proposed */
		--gold: #b08a3e;
		--gold-soft: #c9a860;
		--gold-ink: #8a6a1f;
		--gold-deep: #7a5c15; /* small-text proposal ink */
		--gold-tag: #f5e9c9;
		--pin-fill: #faf6ea;
		--pin-border: #dcd3bd;
		/* Specimen tags — the six bound type pairings */
		--moss: #e3ecdf;
		--moss-ink: #3d5537;
		--violet: #e5e1f2;
		--violet-ink: #4a4174;
		--slate: #dfe9ef;
		--slate-ink: #35586b;
		--surfaced-slate: #6b7f8a;
		--surfaced-fill: #f0f4f6;
		--clay: #f2e6df;
		--clay-ink: #6b4a35;
		--plum: #f2dfe7;
		--plum-ink: #6b3550;
		--confidence-fill: #faf2f6;
		--confidence-border: #ddb8c8;
		--ochre: #ece5c8;
		--ochre-ink: #635417;
		/* Decisions */
		--accept-green: #7fa876;
		--accept-fill: #f4f8f2;
		--rust: #8a3a2a;
		--rust-wash: #f8ece8;
		/* Warm light */
		--shadow-rest: 0 1px 3px rgba(60, 50, 30, 0.12);
		--shadow-lift: 0 6px 16px rgba(60, 50, 30, 0.2);
		--ring-selection: 0 0 0 3px rgba(59, 91, 219, 0.18);
		--shadow-menu: 0 6px 24px #382f201f;
		--shadow-toast: 0 4px 14px rgba(0, 0, 0, 0.25);
		--shadow-modal: 0 10px 40px rgba(40, 33, 18, 0.3);
	}

	/* The browser surfaces carry the design too: warm caret, blue-tinted
	   selection, warm thin scrollbars, themed placeholders, and a keyboard focus
	   ring in the working ink. */
	:global(:root) {
		caret-color: var(--blue);
		accent-color: var(--blue);
		scrollbar-color: var(--card-border) transparent;
	}
	:global(::selection) {
		background: rgba(59, 91, 219, 0.16);
	}
	:global(::placeholder) {
		color: var(--ink-muted);
		opacity: 1;
	}
	:global(:focus-visible) {
		outline: 2px solid var(--blue);
		outline-offset: 1px;
	}

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
