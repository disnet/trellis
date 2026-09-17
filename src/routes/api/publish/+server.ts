import { json } from '@sveltejs/kit';
import { activeGraphId, db } from '$lib/server/db';
import {
	gardenAddress,
	getPublishConfig,
	lastReleaseOutcome,
	liveCounts,
	liveGardens
} from '$lib/server/publish/release';
import { readPublishCredentials, redactCredentials } from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Publishing status for the active graph: account, configuration, what is
 *  live, how the last release went, and every garden this workspace has
 *  published into the repository. Credentials are always redacted. */
export const GET: RequestHandler = () => {
	const graphId = activeGraphId();
	const credentials = readPublishCredentials();
	const graph = db.prepare('SELECT name FROM graphs WHERE id = ?').get(graphId) as
		| { name: string }
		| undefined;
	const saved = getPublishConfig(graphId);
	const config = {
		key: saved?.key || gardenAddress(graphId, saved?.title || graph?.name || ''),
		treatmentId: saved?.treatmentId ?? null,
		title: saved?.title ?? '',
		summary: saved?.summary ?? ''
	};
	return json({
		graphId,
		graphName: graph?.name ?? '',
		credentials: redactCredentials(credentials),
		config,
		configured: saved !== null,
		live: liveCounts(graphId),
		// Several graphs can be published into one repository side by side.
		gardens: liveGardens(),
		lastRelease: lastReleaseOutcome(graphId),
		gardenIdent: credentials.handle ?? credentials.did ?? null,
		// The desktop app authorizes in the system browser, so its sign-in
		// finishes out of the window's sight and has to be waited for.
		desktop: !!process.env.TRELLIS_DESKTOP
	});
};
