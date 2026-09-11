// atproto OAuth for publishing, using the official client so DPoP, PAR,
// PKCE, and token refresh are never hand-rolled. Trellis runs on localhost,
// so it is a *loopback client*: the client_id is the `http://localhost?…`
// form the spec defines for native/local apps, which needs no hosted client
// metadata document. Tokens live in data/oauth.json (mode 0600), beside the
// other publish credentials and never in the graph database.
//
// The client_id embeds the redirect URI, which includes the app's port. The
// origin used at sign-in is therefore stored with the credentials so token
// refresh keeps working when the app later runs on a different port; a new
// sign-in from a new port simply authorizes a new loopback client.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	NodeOAuthClient,
	OAuthSession,
	requestLocalLock,
	type NodeSavedSession,
	type NodeSavedState
} from '@atproto/oauth-client-node';
import { atprotoLoopbackClientMetadata } from '@atproto/oauth-types';
import { COLLECTIONS } from '$lib/garden/lexicon';
import { XrpcError, type RepoWriter } from './xrpc';

/** Exactly the collections Trellis publishes, and nothing else. A bare
 *  `repo:<nsid>` grants create, update, and delete on that one collection, so
 *  the authorization screen names the five record types by hand rather than
 *  asking for the whole repo. (The older `transitional:generic` blanket scope
 *  is refused by servers running the granular permission model, which reply
 *  `Missing required scope "repo:<nsid>?action=create"`.) No `blob:` scope:
 *  publishing writes records only, never uploads.
 *
 *  Changing this list changes the client_id, which embeds the scope — so
 *  stored sign-ins stop refreshing and the account must be reconnected. */
export const OAUTH_SCOPE = ['atproto', ...Object.values(COLLECTIONS).map((nsid) => `repo:${nsid}`)].join(
	' '
);
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

// --- token store (data/oauth.json) ---

interface OauthFileData {
	states: Record<string, { savedAt: number; value: NodeSavedState }>;
	sessions: Record<string, NodeSavedSession>;
}

const storePath = () => process.env.TRELLIS_OAUTH_STORE ?? resolve('data/oauth.json');
const STATE_TTL_MS = 60 * 60 * 1000;

function readStore(): OauthFileData {
	try {
		const value = JSON.parse(readFileSync(storePath(), 'utf8'));
		return {
			states: typeof value.states === 'object' && value.states ? value.states : {},
			sessions: typeof value.sessions === 'object' && value.sessions ? value.sessions : {}
		};
	} catch {
		return { states: {}, sessions: {} };
	}
}

function writeStore(data: OauthFileData) {
	// Abandoned sign-in attempts must not accumulate key material.
	const cutoff = Date.now() - STATE_TTL_MS;
	for (const [key, entry] of Object.entries(data.states))
		if (entry.savedAt < cutoff) delete data.states[key];
	const file = storePath();
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
	renameSync(`${file}.tmp`, file);
}

const stateStore = {
	get: (key: string) => readStore().states[key]?.value,
	set: (key: string, value: NodeSavedState) => {
		const data = readStore();
		data.states[key] = { savedAt: Date.now(), value };
		writeStore(data);
	},
	del: (key: string) => {
		const data = readStore();
		delete data.states[key];
		writeStore(data);
	}
};

const sessionStore = {
	get: (did: string) => readStore().sessions[did],
	set: (did: string, value: NodeSavedSession) => {
		const data = readStore();
		data.sessions[did] = value;
		writeStore(data);
	},
	del: (did: string) => {
		const data = readStore();
		delete data.sessions[did];
		writeStore(data);
	}
};

// --- the loopback client ---

/** The redirect origin for a request to the local app. The spec requires the
 *  IP literal (never the name "localhost") in loopback redirect URIs; a
 *  non-local origin cannot receive the redirect and is refused. */
export function loopbackOrigin(requestUrl: URL): string | null {
	const host = requestUrl.hostname;
	if (host === 'localhost' || host === '127.0.0.1') {
		return `http://127.0.0.1${requestUrl.port ? `:${requestUrl.port}` : ''}`;
	}
	if (host === '[::1]' || host === '::1') {
		return `http://[::1]${requestUrl.port ? `:${requestUrl.port}` : ''}`;
	}
	return null;
}

export function loopbackClientId(origin: string): string {
	const redirectUri = `${origin}${OAUTH_CALLBACK_PATH}`;
	return `http://localhost?${new URLSearchParams({ redirect_uri: redirectUri, scope: OAUTH_SCOPE })}`;
}

const clients = new Map<string, NodeOAuthClient>();

export function getOauthClient(origin: string): NodeOAuthClient {
	let client = clients.get(origin);
	if (!client) {
		client = new NodeOAuthClient({
			clientMetadata: atprotoLoopbackClientMetadata(loopbackClientId(origin)),
			handleResolver: process.env.TRELLIS_APPVIEW_URL ?? 'https://public.api.bsky.app',
			responseMode: 'query',
			// Local development against an http dev PDS reuses the garden's
			// private-network override; production stays https-only.
			allowHttp: process.env.TRELLIS_GARDEN_ALLOW_PRIVATE === '1',
			stateStore,
			sessionStore,
			requestLock: requestLocalLock
		});
		clients.set(origin, client);
	}
	return client;
}

/** Begin sign-in: resolves the handle, runs PAR, and returns the
 *  authorization URL to send the browser to. */
export async function startOauth(requestUrl: URL, handle: string): Promise<URL> {
	const origin = loopbackOrigin(requestUrl);
	if (!origin)
		throw new Error('OAuth sign-in works from the local app only (open Trellis on 127.0.0.1).');
	const client = getOauthClient(origin);
	// loopbackOrigin() only produces 127.0.0.1/[::1] origins, which is exactly
	// what the library's template-literal redirect type wants; the runtime
	// string needs a cast to say so.
	const redirectUri = `${origin}${OAUTH_CALLBACK_PATH}` as `http://127.0.0.1:${string}`;
	return client.authorize(handle, {
		redirect_uri: redirectUri,
		// Returned to the callback, where it becomes the display handle.
		state: handle
	});
}

/** Finish sign-in from the redirect request. */
export async function finishOauth(
	requestUrl: URL
): Promise<{ did: string; handle: string; origin: string }> {
	const origin = loopbackOrigin(requestUrl);
	if (!origin) throw new Error('The OAuth callback arrived on a non-local origin.');
	const client = getOauthClient(origin);
	const { session, state } = await client.callback(requestUrl.searchParams);
	return { did: session.did, handle: state ?? session.did, origin };
}

/** The session for a stored sign-in, refreshed if needed. Null when there is
 *  none or the grant is no longer usable (revoked, expired refresh). */
export async function restoreOauthSession(origin: string, did: string): Promise<OAuthSession | null> {
	try {
		return await getOauthClient(origin).restore(did);
	} catch {
		return null;
	}
}

/** Best-effort revocation plus local token removal. */
export async function disconnectOauth(origin: string | undefined, did: string): Promise<void> {
	try {
		if (origin) await getOauthClient(origin).revoke(did);
	} catch {
		// Revocation is best-effort; the tokens are removed locally regardless.
	}
	sessionStore.del(did);
}

// --- publishing over the OAuth session ---

async function oauthXrpc(session: OAuthSession, nsid: string, body: object): Promise<unknown> {
	const res = await session.fetchHandler(`/xrpc/${nsid}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
	if (!res.ok)
		throw new XrpcError(
			res.status,
			data.error ?? 'Unknown',
			data.message ?? data.error ?? `${nsid} failed (${res.status}).`
		);
	return data;
}

export function oauthWriter(session: OAuthSession): RepoWriter {
	return {
		did: session.did,
		putRecord: (collection, rkey, record) =>
			oauthXrpc(session, 'com.atproto.repo.putRecord', {
				repo: session.did,
				collection,
				rkey,
				record
			}) as Promise<{ uri: string; cid: string }>,
		deleteRecord: async (collection, rkey) => {
			await oauthXrpc(session, 'com.atproto.repo.deleteRecord', { repo: session.did, collection, rkey });
		}
	};
}
