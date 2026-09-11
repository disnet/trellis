import { error } from '@sveltejs/kit';
import { loadGarden } from '$lib/garden/reader';
import type { LayoutServerLoad } from './$types';

// Reads the whole garden straight from the author's PDS on every request —
// the repo is the source of truth and there is no index service to run.
export const load: LayoutServerLoad = async ({ params, fetch }) => {
	const view = await loadGarden(params.ident, fetch);
	if (!view) throw error(404, 'No garden is published at this identity.');
	return { view, base: `/garden/${encodeURIComponent(params.ident)}` };
};
