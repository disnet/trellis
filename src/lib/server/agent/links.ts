// Server-side link resolution for agent context. Some sources the person pastes
// into a note cannot be read by any web-fetch tool: bsky.app is a client-rendered
// SPA whose served HTML carries no post text and — deliberately — no
// og:description, so a fetch of the page yields nothing but the author handle.
// The agent then has nothing to decompose and says so.
//
// Rather than teach every adapter's fetch tool about individual sites, we resolve
// the links we know how to resolve here, before the prompt is built, and inline
// the result into the context. Ordering is stable (first appearance in the text),
// so identical graph state still produces an identical request; only the resolved
// content itself varies, and every failure is reported to the agent rather than
// hidden. URLs with no resolver are left alone — the agent's own web-fetch tool
// handles those exactly as before.

import type { AgentContext } from './context';

export interface ResolvedLink {
	url: string;
	/** Short provenance label, e.g. "Bluesky post by @handle". */
	label: string;
	/** Plain-text rendering of what the link holds. Absent when resolution failed. */
	content?: string;
	/** Why resolution failed, when it did — shown to the agent, not swallowed. */
	error?: string;
}

/** Injectable for tests; production passes the global. */
export type FetchLike = typeof globalThis.fetch;

/** Resolve at most this many links per invocation, in order of appearance. */
const MAX_LINKS = 6;
const TIMEOUT_MS = 8_000;
/** Per-link cap on inlined content, so one thread cannot crowd out the graph. */
const MAX_CONTENT = 4_000;

const truncate = (text: string, limit = MAX_CONTENT) =>
	text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;

/**
 * URLs in free text. Trailing sentence punctuation and a trailing closing paren
 * are dropped — "(see https://example.com/a)." must not resolve to ")." on the end.
 */
export function extractUrls(text: string): string[] {
	const out: string[] = [];
	for (const match of text.match(/\bhttps?:\/\/[^\s<>"'`]+/gi) ?? []) {
		const url = match.replace(/[)\]}>.,;:!?'"]+$/, '');
		if (url && !out.includes(url)) out.push(url);
	}
	return out;
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<Record<string, unknown>> {
	const response = await fetchImpl(url, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!response.ok) {
		const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
		throw new Error(message);
	}
	if (!body) throw new Error('the response was not JSON');
	return body;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const field = (value: any, key: string): string | undefined =>
	typeof value?.[key] === 'string' && value[key].trim() ? value[key].trim() : undefined;

/** "@handle" or "Display Name (@handle)" when a display name is set. */
function describeAuthor(author: any): string {
	const handle = field(author, 'handle') ?? 'unknown';
	const name = field(author, 'displayName');
	return name ? `${name} (@${handle})` : `@${handle}`;
}

/** YYYY-MM-DD; the agent needs the date, not the millisecond. */
function describeDate(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

/**
 * Everything a post carries beyond its text: image alt text, link cards, and
 * quoted posts. Alt text in particular is often the only description of a
 * screenshot that carries the post's actual argument.
 */
function describeEmbed(embed: any): string[] {
	const lines: string[] = [];
	if (!embed) return lines;
	const type = String(embed.$type ?? '');

	for (const image of embed.images ?? []) {
		const alt = field(image, 'alt');
		lines.push(alt ? `Image (alt text): ${alt}` : 'Image (no alt text)');
	}
	if (embed.external) {
		const parts = [field(embed.external, 'title'), field(embed.external, 'description')].filter(
			Boolean
		);
		lines.push(`Linked: ${field(embed.external, 'uri') ?? '?'}${parts.length ? ` — ${parts.join(' — ')}` : ''}`);
	}
	if (type.startsWith('app.bsky.embed.video')) {
		const alt = field(embed, 'alt');
		lines.push(alt ? `Video (alt text): ${alt}` : 'Video (no alt text)');
	}

	// A quote post: record#view wraps the quoted post directly; recordWithMedia
	// nests it one level deeper and carries its own media alongside.
	const quoted = embed.record?.record ?? embed.record;
	if (quoted && String(quoted.$type ?? '').includes('viewRecord')) {
		const text = field(quoted.value, 'text');
		lines.push(`Quoting ${describeAuthor(quoted.author)}: ${text ? `"${text}"` : '(no text)'}`);
		lines.push(...describeEmbed(quoted.embeds?.[0]).map((line) => `  ${line}`));
	} else if (quoted && String(quoted.$type ?? '').includes('notFound')) {
		lines.push('Quoting a post that is no longer available.');
	}
	if (embed.media) lines.push(...describeEmbed(embed.media));
	return lines;
}

function describePost(post: any): string {
	const lines = [`Author: ${describeAuthor(post.author)}`];
	const date = describeDate(post.record?.createdAt);
	if (date) lines.push(`Posted: ${date}`);
	lines.push('Text:', '"""', field(post.record, 'text') ?? '(no text)', '"""');
	lines.push(...describeEmbed(post.embed));
	return lines.join('\n');
}

/**
 * bsky.app URLs, resolved through the AT Protocol's public read API — no auth,
 * no rate-limit key, and it accepts a handle in place of a DID.
 */
async function resolveBluesky(url: URL, fetchImpl: FetchLike): Promise<ResolvedLink | null> {
	const [profile, actor, kind, rkey] = url.pathname.split('/').filter(Boolean);
	if (profile !== 'profile' || !actor) return null;

	if (kind === 'post' && rkey) {
		const api = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread');
		api.searchParams.set('uri', `at://${actor}/app.bsky.feed.post/${rkey}`);
		api.searchParams.set('depth', '0');
		// One level of parent: a reply read without what it replies to is usually
		// not decomposable into anything standalone.
		api.searchParams.set('parentHeight', '1');
		const thread = (await getJson(api.href, fetchImpl)).thread as any;
		if (!thread?.post) throw new Error('the post is unavailable (deleted, blocked, or private)');

		const sections = [describePost(thread.post)];
		if (thread.parent?.post) {
			sections.push(`In reply to:\n${describePost(thread.parent.post)}`);
		}
		return {
			url: url.href,
			label: `Bluesky post by ${describeAuthor(thread.post.author)}`,
			content: truncate(sections.join('\n\n'))
		};
	}

	if (kind === undefined) {
		const api = new URL('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile');
		api.searchParams.set('actor', actor);
		const person = (await getJson(api.href, fetchImpl)) as any;
		const lines = [`Handle: @${field(person, 'handle') ?? actor}`];
		const name = field(person, 'displayName');
		if (name) lines.push(`Display name: ${name}`);
		const bio = field(person, 'description');
		if (bio) lines.push('Bio:', '"""', bio, '"""');
		return {
			url: url.href,
			label: `Bluesky profile ${describeAuthor(person)}`,
			content: truncate(lines.join('\n'))
		};
	}

	return null;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const RESOLVERS: {
	hosts: string[];
	resolve: (url: URL, fetchImpl: FetchLike) => Promise<ResolvedLink | null>;
}[] = [{ hosts: ['bsky.app', 'www.bsky.app'], resolve: resolveBluesky }];

/**
 * Resolve one URL, or null when no resolver claims it — the caller leaves those
 * to the agent's own web-fetch tool. A resolver that claims the URL and then
 * fails returns a link carrying the error, so the agent knows the source exists
 * but could not be read and does not silently invent its contents.
 */
export async function resolveLink(href: string, fetchImpl: FetchLike): Promise<ResolvedLink | null> {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	const resolver = RESOLVERS.find((r) => r.hosts.includes(url.hostname.toLowerCase()));
	if (!resolver) return null;
	try {
		return await resolver.resolve(url, fetchImpl);
	} catch (e) {
		return {
			url: url.href,
			label: url.hostname,
			error: e instanceof Error ? e.message : 'the source could not be read'
		};
	}
}

/**
 * Resolve the links reachable from the context, scratch input first — that is
 * the text the person just handed the agent — then the sources and statements of
 * the thoughts in focus.
 */
export async function resolveContextLinks(
	context: AgentContext,
	fetchImpl: FetchLike = globalThis.fetch
): Promise<ResolvedLink[]> {
	const texts: string[] = [];
	if (context.scratch) texts.push(context.scratch.body);
	for (const thought of context.thoughts) {
		if (!thought.inFocus) continue;
		texts.push(`${thought.source ?? ''} ${thought.statement}`);
	}

	const hrefs: string[] = [];
	for (const text of texts) {
		for (const href of extractUrls(text)) if (!hrefs.includes(href)) hrefs.push(href);
	}

	const resolved = await Promise.all(
		hrefs.slice(0, MAX_LINKS).map((href) => resolveLink(href, fetchImpl))
	);
	return resolved.filter((link): link is ResolvedLink => link !== null);
}
