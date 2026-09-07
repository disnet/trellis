import { json } from '@sveltejs/kit';
import { createThought, deleteThoughts, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	// Deletion takes the thought out of the graph for good (undo aside); creating
	// is the default, unnamed action this endpoint has always had.
	if (body?.action === 'delete') {
		const result = deleteThoughts(body?.thoughtIds);
		if ('error' in result) return json({ error: result.error }, { status: 400 });
		return json({ state: getState(), deleted: result.deleted });
	}
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
