import { json } from '@sveltejs/kit';
import { getState, setPinned } from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/pins mutates per-graph attention state only (Phase 6):
//   { action: 'pin', thoughtId }   → mark a thought as a landmark
//   { action: 'unpin', thoughtId } → remove the mark
// Pins are human-only and direct — never through the proposal tray, and never
// a mutation of the durable graph.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (body?.action !== 'pin' && body?.action !== 'unpin')
		return json({ error: 'Unknown action.' }, { status: 400 });
	const error = setPinned(body.thoughtId, body.action === 'pin');
	if (error) return json({ error }, { status: 400 });
	return json({ state: getState() });
};
