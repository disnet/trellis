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
	switchWorkingSet
} from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/workingset mutates working-set (lens) membership only:
//   { action: 'add', thoughtIds }      → add thoughts to the active set
//   { action: 'remove', thoughtId }    → drop one thought from the active set
//   { action: 'clear' }                → empty the active set
//   { action: 'create', name?, thoughtIds? } → new working set, made active,
//                                              optionally seeded with thoughts
//   { action: 'switch', workingSetId } → change which set is active; null
//                                        returns to the base state (no lens)
//   { action: 'rename', workingSetId, name }
//   { action: 'delete', workingSetId } → delete a set (membership only)
//   { action: 'neighborhood', thoughtId } → new set holding a thought + its
//                                           1-hop neighbors, made active
// None of these touch the durable graph or its canvas layout (POST
// /api/canvas owns positions).
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);

	if (body?.action === 'add') {
		const thoughtIds = Array.isArray(body.thoughtIds) ? body.thoughtIds : [];
		const error = addToWorkingSet(thoughtIds);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'remove') {
		const error = removeFromWorkingSet(body.thoughtId);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'clear') {
		const error = clearWorkingSet();
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'create') {
		const error = createWorkingSet(body.name, body.thoughtIds);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}
	if (body?.action === 'switch') {
		const error = switchWorkingSet(body.workingSetId ?? null);
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

	return json({ error: 'Unknown working-set action.' }, { status: 400 });
};
