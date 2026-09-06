import { json } from '@sveltejs/kit';
import { convertNote, createNote, deleteNote, getState } from '$lib/server/store';
import type { RequestHandler } from './$types';

// Canvas notes: free-text boxes on the canvas. Create/delete/convert return
// the full state; body and position edits ride the debounced /api/canvas path.
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const action = body?.action;

	if (action === 'create') {
		const result = createNote({ body: body?.body, x: body?.x, y: body?.y });
		if ('error' in result) return json({ error: result.error }, { status: 400 });
		return json({ state: getState(), noteId: result.noteId });
	}
	if (action === 'delete') {
		const err = deleteNote(body?.noteId);
		if (err) return json({ error: err }, { status: 400 });
		return json({ state: getState() });
	}
	if (action === 'convert') {
		const result = convertNote(body?.noteId, {
			type: body?.type,
			status: body?.status,
			title: body?.title,
			statement: body?.statement
		});
		if ('error' in result) return json({ error: result.error }, { status: 400 });
		return json({ state: getState(), thoughtId: result.thoughtId });
	}
	return json({ error: 'Unknown action.' }, { status: 400 });
};
