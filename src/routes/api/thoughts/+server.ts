import { json } from '@sveltejs/kit';
import { createThought, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const result = createThought({
		type: body?.type,
		status: body?.status,
		title: body?.title,
		statement: body?.statement,
		confidence: body?.confidence,
		source: body?.source,
		x: body?.x,
		y: body?.y
	});
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json({ state: getState(), thoughtId: result.thoughtId });
};
