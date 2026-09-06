import { json } from '@sveltejs/kit';
import { isModelSelection } from '$lib/models';
import { activeGraphId, db } from '$lib/server/db';
import { deleteProseDraft, generateProse, getProseTreatments, listProseDrafts } from '$lib/server/store';
import { PROSE_GUIDANCE_LIMIT, type ProseStyle } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const graphId = activeGraphId();
	if (url.searchParams.get('list') === '1') return json({ graphId, drafts: listProseDrafts() });
	const workingSetId = url.searchParams.get('workingSetId');
	if (!workingSetId) return json({ error: 'Choose a group first.' }, { status: 400 });
	if (!db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(workingSetId, graphId))
		return json({ error: 'Unknown group.' }, { status: 404 });
	return json({ graphId, workingSetId, treatments: getProseTreatments(workingSetId) });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (body?.action === 'delete') {
		if (typeof body.draftId !== 'string' || !body.draftId)
			return json({ error: 'Unknown draft.' }, { status: 400 });
		const error = deleteProseDraft(body.draftId);
		if (error) return json({ error }, { status: 404 });
		return json({ ok: true });
	}
	if (typeof body?.workingSetId !== 'string' || !body.workingSetId)
		return json({ error: 'Choose a group first.' }, { status: 400 });
	if (!isModelSelection(body?.selection))
		return json({ error: 'Invalid provider or model.' }, { status: 400 });
	if (body.guidance !== undefined && typeof body.guidance !== 'string')
		return json({ error: 'Writing guidance must be text.' }, { status: 400 });
	if (typeof body.guidance === 'string' && body.guidance.length > PROSE_GUIDANCE_LIMIT)
		return json({ error: `Writing guidance must be at most ${PROSE_GUIDANCE_LIMIT} characters.` }, { status: 400 });
	const result = await generateProse(body.workingSetId, body.style as ProseStyle, body.selection, body.guidance ?? '');
	if ('error' in result) return json(result, { status: 400 });
	return json({ treatment: result.treatment });
};
