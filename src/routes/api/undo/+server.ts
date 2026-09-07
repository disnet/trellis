import { json } from '@sveltejs/kit';
import { getState, undoLast } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	const result = undoLast();
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json({ state: getState(), undone: result });
};
