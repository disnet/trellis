import { json } from '@sveltejs/kit';
import { activeGraphId } from '$lib/server/db';
import { connectWriter } from '$lib/server/publish/connect';
import { buildReleasePlan, executeRelease, getPublishConfig } from '$lib/server/publish/release';
import type { RequestHandler } from './$types';

/** Publish the previewed release. The plan is rebuilt from current local
 *  state (the preview may be minutes old), the change notes are attached to
 *  the new revisions, and every write is reported individually. Re-running
 *  after a failure publishes only what is still missing. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const notes: Record<string, string> = {};
	if (body?.changeNotes && typeof body.changeNotes === 'object')
		for (const [k, v] of Object.entries(body.changeNotes))
			if (typeof v === 'string') notes[k] = v;

	const graphId = activeGraphId();
	const config = getPublishConfig(graphId);
	if (!config) return json({ error: 'Preview the release before publishing.' }, { status: 400 });
	try {
		const connection = await connectWriter();
		if ('error' in connection) return json({ error: connection.error }, { status: 400 });
		const plan = buildReleasePlan(graphId, config, connection.writer.did, notes);
		const outcome = await executeRelease(plan, connection.writer);
		return json({ outcome });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Publishing failed.' }, { status: 400 });
	}
};
