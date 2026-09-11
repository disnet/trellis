import { json } from '@sveltejs/kit';
import { activeGraphId } from '$lib/server/db';
import { getPublishConfig, lastReleaseOutcome, liveCounts } from '$lib/server/publish/release';
import { readPublishCredentials, redactCredentials } from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Publishing status for the active graph: account, configuration, what is
 *  live, and how the last release went. Credentials are always redacted. */
export const GET: RequestHandler = () => {
	const graphId = activeGraphId();
	const credentials = readPublishCredentials();
	return json({
		graphId,
		credentials: redactCredentials(credentials),
		config: getPublishConfig(graphId),
		live: liveCounts(graphId),
		lastRelease: lastReleaseOutcome(graphId),
		gardenIdent: credentials.handle ?? credentials.did ?? null
	});
};
