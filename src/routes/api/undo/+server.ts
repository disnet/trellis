import { json } from '@sveltejs/kit';
import { getState, undoLastApply } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	const error = undoLastApply();
	if (error) return json({ error }, { status: 400 });
	return json({ state: getState() });
};
