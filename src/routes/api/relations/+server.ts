import { json } from '@sveltejs/kit';
import { createRelation, deleteRelation, getState, updateRelation } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	// Direct human edits to the graph's relations: creating is the default,
	// unnamed action; editing and deleting are named, like thought deletion.
	let error: string | null;
	if (body?.action === 'delete') error = deleteRelation(body?.relationId);
	else if (body?.action === 'update')
		error = updateRelation(body?.relationId, { type: body?.type, reverse: body?.reverse });
	else
		error = createRelation({
			fromThoughtId: body?.fromThoughtId,
			toThoughtId: body?.toThoughtId,
			type: body?.type
		});
	if (error) return json({ error }, { status: 400 });
	return json({ state: getState() });
};
