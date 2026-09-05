// Appearance preferences. View-only and per-browser: how the workspace is
// displayed is never part of the graph, so none of this reaches the server.
// The scale drives --font-scale on the root element, which the type-scale
// tokens in +layout.svelte multiply into every font-size in the app.

import { browser } from '$app/environment';

const STORAGE_KEY = 'trellis:appearance';

export const FONT_SCALE_DEFAULT = 1;
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.05;

/** Snap to a step and clamp, so a hand-edited or stale stored value stays sane. */
function normalize(scale: number): number {
	if (!Number.isFinite(scale)) return FONT_SCALE_DEFAULT;
	const stepped = Math.round(scale / FONT_SCALE_STEP) * FONT_SCALE_STEP;
	const clamped = Math.min(Math.max(stepped, FONT_SCALE_MIN), FONT_SCALE_MAX);
	// Steps of 0.05 accumulate float noise; two decimals is exact for this scale.
	return Math.round(clamped * 100) / 100;
}

class Appearance {
	fontScale = $state(FONT_SCALE_DEFAULT);

	constructor() {
		if (!browser) return;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (saved && typeof saved.fontScale === 'number') this.fontScale = normalize(saved.fontScale);
		} catch {
			// Unreadable preference: the default scale still works.
		}
		this.apply();
	}

	/** Percentage shown in the UI — the scale is easier to talk about than a multiplier. */
	get fontPercent() {
		return Math.round(this.fontScale * 100);
	}

	get isDefault() {
		return this.fontScale === FONT_SCALE_DEFAULT;
	}

	setFontScale(scale: number) {
		this.fontScale = normalize(scale);
		this.apply();
		this.persist();
	}

	/** Move by whole steps, for the A− / A+ buttons and keyboard shortcuts. */
	nudgeFontScale(steps: number) {
		this.setFontScale(this.fontScale + steps * FONT_SCALE_STEP);
	}

	reset() {
		this.setFontScale(FONT_SCALE_DEFAULT);
	}

	private apply() {
		if (!browser) return;
		document.documentElement.style.setProperty('--font-scale', String(this.fontScale));
	}

	private persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontScale: this.fontScale }));
		} catch {
			// Private-mode or full storage: the choice holds for this session only.
		}
	}
}

export const appearance = new Appearance();
