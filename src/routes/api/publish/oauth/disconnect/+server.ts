import { json } from '@sveltejs/kit';
import { disconnectOauth } from '$lib/server/publish/oauth';
import {
	readPublishCredentials,
	redactCredentials,
	savePublishCredentials
} from '$lib/server/publish/settings';
import type { RequestHandler } from './$types';

/** Revoke the OAuth grant (best-effort) and forget the connected identity.
 *  Published records are untouched — this only disconnects the account. */
export const POST: RequestHandler = async () => {
	const credentials = readPublishCredentials();
	if (credentials.method === 'oauth' && credentials.did)
		await disconnectOauth(credentials.oauthOrigin, credentials.did);
	// Any kept app password reconnects through its own form, which re-verifies
	// the account and sets the method again.
	savePublishCredentials({
		...credentials,
		method: undefined,
		did: undefined,
		handle: undefined,
		oauthOrigin: undefined
	});
	return json({ credentials: redactCredentials(readPublishCredentials()) });
};
