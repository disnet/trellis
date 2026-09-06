import { json } from '@sveltejs/kit';
import { isModelSelection } from '$lib/models';
import { getState, invoke } from '$lib/server/store';
import type { AgentAction } from '$lib/types';
import type { RequestHandler } from './$types';

const ACTIONS: AgentAction[] = ['decompose', 'develop', 'challenge', 'connect'];

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const action = body?.action as AgentAction;
	const selectedIds = Array.isArray(body?.selectedIds) ? (body.selectedIds as string[]) : [];
	const scratchBody = typeof body?.scratchBody === 'string' ? body.scratchBody : undefined;
	const noteId = typeof body?.noteId === 'string' ? body.noteId : undefined;

	if (!ACTIONS.includes(action)) return json({ error: 'Unknown operation.' }, { status: 400 });
	if (body.selection !== undefined && !isModelSelection(body.selection))
		return json({ error: 'Invalid provider or model.' }, { status: 400 });

	if (body.conversationId !== undefined && typeof body.conversationId !== 'string')
		return json({ error: 'Invalid discussion.' }, { status: 400 });
	const result = await invoke(action, selectedIds, scratchBody, body.selection, noteId, body.conversationId);
	// Generation failures are recoverable: nothing was staged, the scratch note
	// (if any) is preserved, and the client may simply invoke again.
	if ('error' in result)
		return json({ error: result.error }, { status: result.generationFailed ? 502 : 400 });
	return json({ state: getState(), changeSetId: result.changeSetId });
};
