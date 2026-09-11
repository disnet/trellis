import { finishOauth } from '$lib/server/publish/oauth';
import { readPublishCredentials, savePublishCredentials } from '$lib/server/publish/settings';

/** The loopback OAuth redirect target. Exchanges the code, stores the
 *  connected identity, and returns the browser to the publish page. Token
 *  material is persisted by the OAuth client's own store, never here. */
export const GET = async ({ url }: { url: URL }) => {
	const back = (query: string) =>
		new Response(null, { status: 303, headers: { Location: `/publish?${query}` } });
	try {
		const { did, handle, origin } = await finishOauth(url);
		savePublishCredentials({
			...readPublishCredentials(),
			method: 'oauth',
			did,
			handle,
			oauthOrigin: origin
		});
		return back('oauth=connected');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Sign-in failed.';
		return back(`oauthError=${encodeURIComponent(message)}`);
	}
};
