import { error } from '@sveltejs/kit';
import { loadGardenAt } from '$lib/garden/reader';
import type { LayoutServerLoad } from './$types';

// Reads the garden straight from the author's PDS on every request — the repo
// is the source of truth and there is no index service to run.
export const load: LayoutServerLoad = async ({ params, parent, fetch }) => {
	const { identity, identBase } = await parent();
	const view = await loadGardenAt(identity, params.garden, fetch);
	if (!view) throw error(404, 'No garden is published at this address.');
	return { view, base: `${identBase}/${encodeURIComponent(params.garden)}` };
};
