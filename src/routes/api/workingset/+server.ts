import { json } from '@sveltejs/kit';
import { updatePositions } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const items = Array.isArray(body?.items) ? body.items : [];
	updatePositions(items);
	return json({ ok: true });
};
