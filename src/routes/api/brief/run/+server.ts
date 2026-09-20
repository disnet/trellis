import { json } from '@sveltejs/kit';
import { isModelSelection } from '$lib/models';
import { activeGraphId } from '$lib/server/db';
import { openBrief } from '$lib/server/briefs';
import { getState, runBrief } from '$lib/server/store';
import type { RequestHandler } from './$types';

/** Run the open brief as confirmed on the card. Stages a change set for
 *  review; canonical state is untouched either way. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || body.graphId !== activeGraphId()) return json({ error: 'The graph changed. Reopen the brief.' }, { status: 409 });
	if (body.selection !== undefined && !isModelSelection(body.selection))
		return json({ error: 'Invalid provider or model.' }, { status: 400 });
	const result = await runBrief(body.brief, body.selection);
	if ('error' in result) return json({ error: result.error }, { status: result.generationFailed ? 502 : 400 });
	return json({ state: getState(), changeSetId: result.changeSetId, brief: openBrief() ?? null });
};
