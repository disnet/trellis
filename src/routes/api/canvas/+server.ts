import { json } from '@sveltejs/kit';
import { updateCanvasPositions } from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/canvas persists card positions on the whole-graph canvas, and
// canvas-note drags/edits (best-effort, debounced by the client):
// { items: [{ thoughtId, x, y }], notes: [{ id, x, y, body }] }.
// Layout is a projection of the graph — this never touches thoughts,
// relations, or working-set membership.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const items = Array.isArray(body?.items) ? body.items : [];
	const notes = Array.isArray(body?.notes) ? body.notes : [];
	updateCanvasPositions(items, notes);
	return json({ ok: true });
};
