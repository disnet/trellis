import { json } from '@sveltejs/kit';
import { decide, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => null);
	// One op, or a batch: deciding a whole change set from the canvas is a single
	// round trip, so the review bar never lands the graph in a half-decided state.
	const opIds = Array.isArray(body?.opIds)
		? body.opIds.map((id: unknown) => String(id))
		: [String(body?.opId ?? '')];
	for (const opId of opIds) {
		const error = decide(params.id, opId, body?.decision);
		if (error) return json({ error }, { status: 400 });
	}
	return json({ state: getState() });
};
