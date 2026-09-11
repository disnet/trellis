// Small display helpers for the public garden pages. Client-safe, no state.

import type { Authorship } from './lexicon';

/** Deterministic date rendering regardless of server locale. */
export function formatDate(isoDate: string): string {
	const ms = Date.parse(isoDate);
	if (Number.isNaN(ms)) return '';
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(ms);
}

/** The honest provenance line: who wrote the words. Publication itself
 *  attests the author's acceptance; it does not certify truth or review. */
export function authorshipLabel(a: Authorship): string {
	if (a.actor === 'human') return 'written by the author';
	return a.editedFromProposal
		? 'drafted by an agent, edited and accepted by the author'
		: 'drafted by an agent, accepted by the author';
}

/** Evidence sources render as links only when they are plainly web URLs;
 *  anything else stays literal text. */
export function sourceHref(source: string): string | null {
	if (!/^https?:\/\/\S+$/.test(source)) return null;
	try {
		const url = new URL(source);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}
