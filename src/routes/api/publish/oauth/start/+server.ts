import { json } from '@sveltejs/kit';
import { startOauth } from '$lib/server/publish/oauth';
import type { RequestHandler } from './$types';

/** Begin OAuth sign-in: resolve the handle to its authorization server, run
 *  PAR, and hand back the URL the browser should visit. The redirect returns
 *  to this app's /oauth/callback on the loopback origin. */
export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.json().catch(() => null);
	const handle = typeof body?.handle === 'string' ? body.handle.trim() : '';
	if (!handle) return json({ error: 'Enter the account handle (or DID).' }, { status: 400 });
	try {
		const authorizationUrl = await startOauth(url, handle);
		return json({ url: authorizationUrl.toString() });
	} catch (error) {
		return json(
			{ error: `Could not start sign-in: ${error instanceof Error ? error.message : 'unknown error'}` },
			{ status: 400 }
		);
	}
};
