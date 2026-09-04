import { json } from '@sveltejs/kit';
import {
	createGraph,
	getState,
	reentrySummary,
	renameGraph,
	switchGraph
} from '$lib/server/store';
import type { RequestHandler } from './$types';

// POST /api/graphs manages which isolated knowledge base is active:
//   { action: 'create', name? }         → new empty graph, made active
//   { action: 'switch', graphId }       → swap the entire workspace to that graph
//   { action: 'rename', graphId, name }
// Entering a graph (create or switch) also returns that graph's re-entry
// summary — switching swaps the whole workspace, summary included.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);

	if (body?.action === 'create') {
		const error = createGraph(body.name);
		if (error) return json({ error }, { status: 400 });
		return json({ reentry: reentrySummary(), state: getState() });
	}
	if (body?.action === 'switch') {
		const error = switchGraph(body.graphId);
		if (error) return json({ error }, { status: 400 });
		return json({ reentry: reentrySummary(), state: getState() });
	}
	if (body?.action === 'rename') {
		const error = renameGraph(body.graphId, body.name);
		if (error) return json({ error }, { status: 400 });
		return json({ state: getState() });
	}

	return json({ error: 'Unknown action.' }, { status: 400 });
};
