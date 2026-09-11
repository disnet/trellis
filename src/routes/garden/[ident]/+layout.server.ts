import { error } from '@sveltejs/kit';
import { listGardens, resolveIdentity } from '$lib/garden/reader';
import type { LayoutServerLoad } from './$types';

// Identity resolution and the list of gardens published under it, shared by
// the index and by every page of every garden — an author can publish several
// graphs side by side into one repository.
export const load: LayoutServerLoad = async ({ params, fetch }) => {
	const identity = await resolveIdentity(params.ident, fetch);
	if (!identity) throw error(404, 'No atproto identity resolves at this address.');
	const gardens = await listGardens(identity, fetch);
	if (!gardens.length) throw error(404, 'No garden is published at this identity.');
	return {
		identity,
		gardens: gardens.map((g) => ({ key: g.key, record: g.record })),
		identBase: `/garden/${encodeURIComponent(params.ident)}`
	};
};
