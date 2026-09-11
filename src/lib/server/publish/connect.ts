// Turns the stored publish credentials into an authenticated repo writer,
// whichever way the account is connected. OAuth restores (and silently
// refreshes) the saved grant; the app-password fallback signs in fresh and
// verifies the DID has not moved out from under the stored state.

import { oauthWriter, restoreOauthSession } from './oauth';
import { readPublishCredentials } from './settings';
import { createSession, passwordWriter, type RepoWriter } from './xrpc';

export async function connectWriter(): Promise<{ writer: RepoWriter } | { error: string }> {
	const credentials = readPublishCredentials();
	if (credentials.method === 'oauth' && credentials.did) {
		if (!credentials.oauthOrigin)
			return { error: 'The OAuth sign-in is incomplete. Sign in again from the Account section.' };
		const session = await restoreOauthSession(credentials.oauthOrigin, credentials.did);
		if (!session)
			return {
				error: 'The OAuth session is no longer valid (revoked or expired). Sign in again from the Account section.'
			};
		return { writer: oauthWriter(session) };
	}
	if (credentials.did && credentials.appPassword) {
		try {
			const session = await createSession(
				credentials.service,
				credentials.identifier,
				credentials.appPassword
			);
			if (session.did !== credentials.did)
				return {
					error: 'The account resolved to a different DID than expected. Re-check the publish settings.'
				};
			return { writer: passwordWriter(session) };
		} catch (error) {
			return {
				error: `Could not sign in: ${error instanceof Error ? error.message : 'unknown error'}`
			};
		}
	}
	return { error: 'Connect your atproto account first.' };
}
