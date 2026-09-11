import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { view } = await parent();
	if (!view.byRkey[params.rkey])
		throw error(404, 'This thought is not part of the published garden.');
	return { rkey: params.rkey };
};
