import { json } from '@sveltejs/kit';
import {
	addToWorkingSet,
	clearWorkingSet,
	createWorkingSet,
	deleteWorkingSet,
	getState,
	openNeighborhood,
	removeFromWorkingSet,
	renameWorkingSet,
	switchWorkingSet,
	updatePositions
} from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/workingset mutates the transient working-set projection only:
//   { items }                          → persist card positions (best-effort)
//   { action: 'add', items }           → add thoughts to the active set
//   { action: 'remove', thoughtId }    → drop one thought from the active set
//   { action: 'clear' }                → start fresh with an empty active set
//   { action: 'create', name?, thoughtIds? } → new working set, made active,
//                                              optionally seeded with thoughts
//   { action: 'switch', workingSetId } → change which set is active
//   { action: 'rename', workingSetId, name }
//   { action: 'delete', workingSetId } → delete a set (membership only)
//   { action: 'neighborhood', thoughtId } → new set seeded with a thought + its
//                                           1-hop neighbors, made active
// None of these touch the durable graph.
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
	if (body?.action === 'create') {
		const error = createWorkingSet(body.name, body.thoughtIds);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'switch') {
		const error = switchWorkingSet(body.workingSetId);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'rename') {
		const error = renameWorkingSet(body.workingSetId, body.name);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'neighborhood') {
		const error = openNeighborhood(body.thoughtId);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'delete') {
		const error = deleteWorkingSet(body.workingSetId);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}

	const items = Array.isArray(body?.items) ? body.items : [];
	updatePositions(items);
	return json({ ok: true });
};
