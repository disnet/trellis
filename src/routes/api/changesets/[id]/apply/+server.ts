import { json } from '@sveltejs/kit';
import { applyChangeSet, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => null);
	const positions =
		body?.positions && typeof body.positions === 'object' ? body.positions : {};
	const result = applyChangeSet(params.id, positions);
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json({ state: getState(), ...result });
};
