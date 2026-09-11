import { json } from '@sveltejs/kit';
import { createSession } from '$lib/server/publish/xrpc';
import {
	readPublishCredentials,
	redactCredentials,
	savePublishCredentials
} from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Save the publishing account and verify it by signing in. The resolved DID
 *  is stored so previews can build at-uris without another sign-in. An empty
 *  password keeps the one already on file. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const service = typeof body?.service === 'string' ? body.service.trim() : '';
	const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
	const password = typeof body?.appPassword === 'string' ? body.appPassword.trim() : '';
	if (!service || !/^https?:\/\//.test(service))
		return json({ error: 'Enter the PDS service URL (for example https://bsky.social).' }, { status: 400 });
	if (!identifier) return json({ error: 'Enter the account handle or DID.' }, { status: 400 });
	const existing = readPublishCredentials();
	const appPassword = password || existing.appPassword;
	if (!appPassword)
		return json({ error: 'Enter an app password (Settings → App passwords on your PDS).' }, { status: 400 });
	try {
		const session = await createSession(service, identifier, appPassword);
		savePublishCredentials({
			...existing,
			method: 'password',
			service,
			identifier,
			appPassword,
			did: session.did,
			handle: session.handle,
			oauthOrigin: undefined
		});
		return json({ credentials: redactCredentials(readPublishCredentials()) });
	} catch (error) {
		return json(
			{ error: `Could not sign in: ${error instanceof Error ? error.message : 'unknown error'}` },
			{ status: 400 }
		);
	}
};
