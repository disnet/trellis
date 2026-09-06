import { json } from '@sveltejs/kit';
import { isModelSelection } from '$lib/models';
import { activeGraphId } from '$lib/server/db';
import { getConversations, sendMessage } from '$lib/server/conversations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	try {
		const target = { thoughtId: url.searchParams.get('thoughtId') || undefined, operationId: url.searchParams.get('operationId') || undefined };
		return json({ graphId: activeGraphId(), conversations: getConversations(target) });
	} catch (e) { return json({ error: (e as Error).message }, { status: 400 }); }
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || body.graphId !== activeGraphId()) return json({ error: 'The graph changed. Reopen the discussion.' }, { status: 409 });
	if (!isModelSelection(body.selection) || typeof body.body !== 'string' || typeof body.messageId !== 'string' || body.messageId.length > 100 || !body.messageId ||
		(body.thoughtId !== undefined && typeof body.thoughtId !== 'string') || (body.operationId !== undefined && typeof body.operationId !== 'string'))
		return json({ error: 'Invalid conversation request.' }, { status: 400 });
	try {
		await sendMessage({ thoughtId: body.thoughtId, operationId: body.operationId }, body.body, body.messageId, body.selection);
		return json({ graphId: body.graphId, conversations: getConversations({ thoughtId: body.thoughtId, operationId: body.operationId }, body.graphId) });
	} catch (e) { return json({ error: (e as Error).message }, { status: 400 }); }
};
