// A minimal XRPC client for the handful of com.atproto calls publishing
// needs: sign in with an app password, put/delete records, and list what a
// repo holds. Hand-rolled in the same spirit as the Bluesky link resolver —
// the repo keeps dependencies lean and the surface here is tiny.

type Fetch = typeof fetch;

export interface PdsSession {
	service: string;
	did: string;
	handle: string;
	accessJwt: string;
}

export class XrpcError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
		this.name = 'XrpcError';
	}
}

async function call(
	fetchImpl: Fetch,
	service: string,
	nsid: string,
	options: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: unknown; jwt?: string }
): Promise<unknown> {
	const search = options.params ? `?${new URLSearchParams(options.params)}` : '';
	const res = await fetchImpl(`${service}/xrpc/${nsid}${search}`, {
		method: options.method ?? 'POST',
		headers: {
			...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			...(options.jwt ? { Authorization: `Bearer ${options.jwt}` } : {})
		},
		body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
		signal: AbortSignal.timeout(30_000)
	});
	const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
	if (!res.ok)
		throw new XrpcError(res.status, data.error ?? 'Unknown', data.message ?? data.error ?? `${nsid} failed (${res.status}).`);
	return data;
}

export async function createSession(
	service: string,
	identifier: string,
	appPassword: string,
	fetchImpl: Fetch = fetch
): Promise<PdsSession> {
	const data = (await call(fetchImpl, service, 'com.atproto.server.createSession', {
		body: { identifier, password: appPassword }
	})) as { did: string; handle: string; accessJwt: string };
	if (!data.did || !data.accessJwt) throw new Error('The PDS returned an incomplete session.');
	return { service, did: data.did, handle: data.handle, accessJwt: data.accessJwt };
}

export async function putRecord(
	session: PdsSession,
	collection: string,
	rkey: string,
	record: object,
	fetchImpl: Fetch = fetch
): Promise<{ uri: string; cid: string }> {
	return (await call(fetchImpl, session.service, 'com.atproto.repo.putRecord', {
		jwt: session.accessJwt,
		body: { repo: session.did, collection, rkey, record }
	})) as { uri: string; cid: string };
}

export async function deleteRecord(
	session: PdsSession,
	collection: string,
	rkey: string,
	fetchImpl: Fetch = fetch
): Promise<void> {
	await call(fetchImpl, session.service, 'com.atproto.repo.deleteRecord', {
		jwt: session.accessJwt,
		body: { repo: session.did, collection, rkey }
	});
}

/** What a release execution needs from an authenticated repo connection —
 *  implemented by the app-password session here and the OAuth session in
 *  ./oauth. */
export interface RepoWriter {
	did: string;
	putRecord(collection: string, rkey: string, record: object): Promise<{ uri: string; cid: string }>;
	deleteRecord(collection: string, rkey: string): Promise<void>;
}

export function passwordWriter(session: PdsSession, fetchImpl: Fetch = fetch): RepoWriter {
	return {
		did: session.did,
		putRecord: (collection, rkey, record) => putRecord(session, collection, rkey, record, fetchImpl),
		deleteRecord: (collection, rkey) => deleteRecord(session, collection, rkey, fetchImpl)
	};
}
