import { json } from '@sveltejs/kit';
import { decide, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => null);
	const error = decide(params.id, String(body?.opId ?? ''), body?.decision);
	if (error) return json({ error }, { status: 400 });
	return json({ state: getState() });
};
