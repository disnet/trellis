import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(async () => { await server.close(); });
const load = (path) => server.ssrLoadModule(`/src/${path}`);
const { extractUrls, resolveLink, resolveContextLinks } = await load('lib/server/agent/links.ts');
const { buildUserPrompt } = await load('lib/server/agent/prompt.ts');

const POST_URL = 'https://bsky.app/profile/b0tster.yeag.gay/post/3muslubvj2s27';

/** Stand in for the public AT Protocol read API; records what was requested. */
function mockFetch(routes) {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(String(url));
		const route = routes.find(([match]) => String(url).includes(match));
		if (!route) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
		const [, status, body] = route;
		return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	};
	return { fetchImpl, calls };
}

const threadBody = {
	thread: {
		post: {
			author: { handle: 'b0tster.yeag.gay', displayName: 'PSX Bunlith' },
			record: { text: 'BLUESKY 38 IS AI SLOP', createdAt: '2026-09-05T23:07:54.752Z' },
			embed: {
				$type: 'app.bsky.embed.images#view',
				images: [{ alt: 'screenshot of the repo, with CLAUDE circled' }, {}]
			}
		},
		parent: {
			post: { author: { handle: 'someone.bsky.social' }, record: { text: 'the original claim' } }
		}
	}
};

test('URLs are pulled out of prose without their trailing punctuation', () => {
	assert.deepEqual(extractUrls(`see (${POST_URL}), and https://example.com/a.`), [
		POST_URL,
		'https://example.com/a'
	]);
	assert.deepEqual(extractUrls('no links here'), []);
	// A repeated link is resolved once.
	assert.deepEqual(extractUrls(`${POST_URL} ${POST_URL}`), [POST_URL]);
});

test('a Bluesky post resolves through the public API, not the unreadable web page', async () => {
	const { fetchImpl, calls } = mockFetch([['app.bsky.feed.getPostThread', 200, threadBody]]);
	const link = await resolveLink(POST_URL, fetchImpl);

	assert.equal(calls.length, 1);
	assert.ok(calls[0].startsWith('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread'));
	assert.ok(calls[0].includes(encodeURIComponent('at://b0tster.yeag.gay/app.bsky.feed.post/3muslubvj2s27')));
	assert.equal(link.label, 'Bluesky post by PSX Bunlith (@b0tster.yeag.gay)');
	assert.equal(link.error, undefined);
	assert.match(link.content, /BLUESKY 38 IS AI SLOP/);
	assert.match(link.content, /Posted: 2026-09-05/);
	// Alt text is often the only description of a screenshot's argument.
	assert.match(link.content, /Image \(alt text\): screenshot of the repo, with CLAUDE circled/);
	assert.match(link.content, /Image \(no alt text\)/);
	// A reply is not decomposable without what it replies to.
	assert.match(link.content, /In reply to:[\s\S]*the original claim/);
});

test('quoted posts and link cards come through the embed', async () => {
	const { fetchImpl } = mockFetch([
		['getPostThread', 200, {
			thread: {
				post: {
					author: { handle: 'a.bsky.social' },
					record: { text: 'agreed', createdAt: '2026-09-05T00:00:00Z' },
					embed: {
						$type: 'app.bsky.embed.recordWithMedia#view',
						record: { record: { $type: 'app.bsky.embed.record#viewRecord', author: { handle: 'b.bsky.social' }, value: { text: 'the quoted claim' } } },
						media: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/paper', title: 'A Paper', description: 'On slop.' } }
					}
				}
			}
		}]
	]);
	const link = await resolveLink(POST_URL, fetchImpl);
	assert.match(link.content, /Quoting @b\.bsky\.social: "the quoted claim"/);
	assert.match(link.content, /Linked: https:\/\/example\.com\/paper — A Paper — On slop\./);
});

test('a profile URL resolves; an unresolvable post is reported, never invented', async () => {
	const { fetchImpl } = mockFetch([
		['app.bsky.actor.getProfile', 200, { handle: 'b0tster.yeag.gay', displayName: 'PSX Bunlith', description: 'Gay af game dev' }]
	]);
	const profile = await resolveLink('https://bsky.app/profile/b0tster.yeag.gay', fetchImpl);
	assert.equal(profile.label, 'Bluesky profile PSX Bunlith (@b0tster.yeag.gay)');
	assert.match(profile.content, /Gay af game dev/);

	const missing = mockFetch([['getPostThread', 400, { error: 'NotFound', message: 'Post not found' }]]);
	const failed = await resolveLink(POST_URL, missing.fetchImpl);
	assert.equal(failed.content, undefined);
	assert.equal(failed.error, 'Post not found');
});

test('links with no resolver are left to the agent’s own fetch tool', async () => {
	const { fetchImpl, calls } = mockFetch([]);
	assert.equal(await resolveLink('https://example.com/a', fetchImpl), null);
	assert.equal(await resolveLink('not a url', fetchImpl), null);
	// bsky.app URLs that are neither a post nor a profile claim nothing.
	assert.equal(await resolveLink('https://bsky.app/settings', fetchImpl), null);
	assert.equal(calls.length, 0);
});

test('context links are resolved from scratch and focus, then rendered into the prompt', async () => {
	const { fetchImpl } = mockFetch([['getPostThread', 200, threadBody]]);
	const context = {
		thoughts: [
			{ id: 't1', type: 'claim', status: 'tentative', title: 'A claim', statement: 'Body.', inFocus: true, selected: true, retrieved: false, source: POST_URL },
			{ id: 't2', type: 'claim', status: 'tentative', title: 'Out of focus', statement: 'See https://bsky.app/profile/x/post/y', inFocus: false, selected: false, retrieved: false }
		],
		relations: [],
		selectedIds: ['t1'],
		retrievedIds: [],
		scratch: { id: 's1', body: `worth decomposing: ${POST_URL}` }
	};

	context.links = await resolveContextLinks(context, fetchImpl);
	// Deduplicated across scratch and the thought's source; the out-of-focus
	// thought's link is not fetched.
	assert.equal(context.links.length, 1);

	const prompt = buildUserPrompt('decompose', context);
	assert.match(prompt, /Resolved links \(read by the server; do not fetch these again\):/);
	assert.match(prompt, /BLUESKY 38 IS AI SLOP/);
});
