import { json } from '@sveltejs/kit';
import { getState, reviseThought } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => null);
	const error = reviseThought(params.id, {
		title: body?.title,
		statement: body?.statement,
		status: body?.status,
		confidence: body?.confidence,
		source: body?.source
	});
	if (error) return json({ error }, { status: 400 });
	return json({ state: getState() });
};
