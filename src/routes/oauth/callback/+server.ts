import { finishOauth } from '$lib/server/publish/oauth';
import { readPublishCredentials, savePublishCredentials } from '$lib/server/publish/settings';

/** The loopback OAuth redirect target. Exchanges the code, stores the
 *  connected identity, and returns the browser to the publish page. Token
 *  material is persisted by the OAuth client's own store, never here. */
export const GET = async ({ url }: { url: URL }) => {
	// In the desktop app this request lands in the *system browser*, which
	// showed the authorization page: the app's own window is elsewhere and
	// polls for the result. Sending that browser on to /publish would only
	// hand it a page it is not allowed to load, so it gets a plain notice
	// instead and the window that asked for the sign-in reports the outcome.
	const desktop = !!process.env.TRELLIS_DESKTOP;
	const done = (query: string, heading: string, detail: string) =>
		desktop
			? new Response(page(heading, detail), {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
				})
			: new Response(null, { status: 303, headers: { Location: `/publish?${query}` } });
	try {
		const { did, handle, origin } = await finishOauth(url);
		savePublishCredentials({
			...readPublishCredentials(),
			method: 'oauth',
			did,
			handle,
			oauthOrigin: origin
		});
		return done('oauth=connected', 'Signed in', 'You can close this tab and return to Trellis.');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Sign-in failed.';
		return done(
			`oauthError=${encodeURIComponent(message)}`,
			'Sign-in failed',
			`${message} Close this tab and try again from Trellis.`
		);
	}
};

const escape = (text: string) =>
	text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Self-contained: this page is served to a browser that has no cookie for
 *  the app and so cannot fetch a stylesheet from it. */
const page = (heading: string, detail: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trellis</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: #faf9f7; color: #1c1a17; }
  @media (prefers-color-scheme: dark) { body { background: #171614; color: #ece9e4; } }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { margin: 0; opacity: 0.75; }
</style></head>
<body><main><h1>${escape(heading)}</h1><p>${escape(detail)}</p></main></body></html>
`;
