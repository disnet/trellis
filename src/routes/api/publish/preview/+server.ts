import { json } from '@sveltejs/kit';
import { activeGraphId } from '$lib/server/db';
import {
	buildReleasePlan,
	gardenAddress,
	savePublishConfig,
	type PublishConfig
} from '$lib/server/publish/release';
import { readPublishCredentials } from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Compute the publication diff for review. Saves the configuration so the
 *  run and future sessions reuse it; writes nothing to the PDS. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const graphId = activeGraphId();
	const title = typeof body?.title === 'string' ? body.title : '';
	const config: PublishConfig = {
		// An address the author never edited is the one the graph already
		// publishes under, or a fresh slug from the title.
		key: typeof body?.key === 'string' && body.key.trim() ? body.key.trim() : gardenAddress(graphId, title),
		treatmentId: typeof body?.treatmentId === 'string' && body.treatmentId ? body.treatmentId : null,
		title,
		summary: typeof body?.summary === 'string' ? body.summary : ''
	};
	const credentials = readPublishCredentials();
	if (!credentials.did)
		return json({ error: 'Connect your atproto account first (records need its identity).' }, { status: 400 });
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
