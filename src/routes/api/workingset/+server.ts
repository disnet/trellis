import { json } from '@sveltejs/kit';
import {
	addToWorkingSet,
	clearWorkingSet,
	getState,
	removeFromWorkingSet,
	updatePositions
} from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/workingset mutates the transient working-set projection only:
//   { items }                      → persist card positions (best-effort)
//   { action: 'add', items }       → add thoughts to the set
//   { action: 'remove', thoughtId }→ drop one thought from the set
//   { action: 'clear' }            → start fresh with an empty set
// Membership changes never touch the durable graph.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);

	if (body?.action === 'add') {
		const items = Array.isArray(body.items) ? body.items : [];
		const error = addToWorkingSet(items);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'remove') {
		const error = removeFromWorkingSet(body.thoughtId);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'clear') {
		clearWorkingSet();
		return json({ state: getState() });
	}

	const items = Array.isArray(body?.items) ? body.items : [];
	updatePositions(items);
	return json({ ok: true });
};
