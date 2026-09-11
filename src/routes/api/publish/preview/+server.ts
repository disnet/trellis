import { json } from '@sveltejs/kit';
import { activeGraphId } from '$lib/server/db';
import { buildReleasePlan, savePublishConfig, type PublishConfig } from '$lib/server/publish/release';
import { readPublishCredentials } from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Compute the publication diff for review. Saves the configuration so the
 *  run and future sessions reuse it; writes nothing to the PDS. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const config: PublishConfig = {
		workingSetId: typeof body?.workingSetId === 'string' ? body.workingSetId : '',
		treatmentId: typeof body?.treatmentId === 'string' && body.treatmentId ? body.treatmentId : null,
		title: typeof body?.title === 'string' ? body.title : '',
		summary: typeof body?.summary === 'string' ? body.summary : ''
	};
	const credentials = readPublishCredentials();
	if (!credentials.did)
		return json({ error: 'Connect your atproto account first (records need its identity).' }, { status: 400 });
	const graphId = activeGraphId();
	try {
		const plan = buildReleasePlan(graphId, config, credentials.did);
		savePublishConfig(graphId, config);
		return json({
			plan: {
				puts: plan.puts.map((p) => ({
					collection: p.collection,
					rkey: p.rkey,
					kind: p.kind,
					label: p.label,
					isNew: p.isNew,
					record: p.record
				})),
				deletes: plan.deletes,
				unchanged: plan.unchanged,
				newThoughts: plan.newThoughts,
				changedThoughts: plan.changedThoughts,
				warnings: plan.warnings
			}
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Preview failed.' }, { status: 400 });
	}
};
