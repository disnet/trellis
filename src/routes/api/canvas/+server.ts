import { json } from '@sveltejs/kit';
import { updateCanvasPositions } from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/canvas persists card positions on the whole-graph canvas
// (best-effort, debounced by the client): { items: [{ thoughtId, x, y }] }.
// Layout is a projection of the graph — this never touches thoughts,
// relations, or working-set membership.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const items = Array.isArray(body?.items) ? body.items : [];
	updateCanvasPositions(items);
	return json({ ok: true });
};
