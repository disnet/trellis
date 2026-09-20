import { json } from '@sveltejs/kit';
import { isModelSelection } from '$lib/models';
import { activeGraphId } from '$lib/server/db';
import { discardBrief, openBrief, sendBriefMessage } from '$lib/server/briefs';
import type { RequestHandler } from './$types';

/** The open brief for the active graph, or null. */
export const GET: RequestHandler = () => json({ graphId: activeGraphId(), brief: openBrief() ?? null });

/** One turn: append the person's message, reply, and redraft the brief. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || body.graphId !== activeGraphId()) return json({ error: 'The graph changed. Reopen the brief.' }, { status: 409 });
	if (!isModelSelection(body.selection) || typeof body.body !== 'string' || typeof body.messageId !== 'string' || body.messageId.length > 100 || !body.messageId)
		return json({ error: 'Invalid brief request.' }, { status: 400 });
	try {
		await sendBriefMessage(body.body, body.messageId, body.selection);
		return json({ graphId: body.graphId, brief: openBrief() ?? null });
	} catch (e) { return json({ error: (e as Error).message }, { status: 400 }); }
};

/** Forget the open brief. */
export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || body.graphId !== activeGraphId()) return json({ error: 'The graph changed. Reopen the brief.' }, { status: 409 });
	discardBrief();
	return json({ graphId: body.graphId, brief: null });
};
