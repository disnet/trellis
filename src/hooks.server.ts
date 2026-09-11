import type { Handle } from '@sveltejs/kit';

// The workspace API has no auth — it is a local, single-user app. When this
// build is deployed publicly to serve gardens (TRELLIS_RENDERER_ONLY=1), only
// the reading surface and its assets are reachable; the workspace and every
// /api route disappear.
const RENDERER_ONLY = process.env.TRELLIS_RENDERER_ONLY === '1';

const PUBLIC_PREFIXES = ['/garden', '/_app/', '/favicon'];

export const handle: Handle = async ({ event, resolve }) => {
	if (RENDERER_ONLY && !PUBLIC_PREFIXES.some((p) => event.url.pathname.startsWith(p)))
		return new Response('Not found', { status: 404 });
	return resolve(event);
};
