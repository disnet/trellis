// Reads a published garden straight from its personal data server: resolve
// the identity, list the garden's records over the public XRPC endpoints, and
// assemble the reader's view. No index service — the repo is the source.
//
// Everything fetched here is untrusted public data. Records are shape-checked
// through the lexicon guards, only manifest members render, and bodies stay
// plain text for Svelte to escape.

import {
	COLLECTIONS,
	GARDEN_KEY_RE,
	parseAtUri,
	readGardenRecord,
	readRelationRecord,
	readRevisionRecord,
	readThoughtRecord,
	readTreatmentRecord,
	type GardenRecord,
	type RelationRecord,
	type RevisionRecord,
	type ThoughtRecord,
	type TreatmentRecord
} from './lexicon';

type Fetch = typeof fetch;

const HANDLE_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
// Server-side env overrides point identity resolution at a dev or test
// directory; in the browser the public defaults always apply.
const env = (name: string): string | undefined =>
	(globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[name];
const PUBLIC_APPVIEW = env('TRELLIS_APPVIEW_URL') ?? 'https://public.api.bsky.app';
const PLC_DIRECTORY = env('TRELLIS_PLC_URL') ?? 'https://plc.directory';

export interface GardenIdentity {
	did: string;
	handle?: string;
	pds: string;
}

// --- SSRF guard ---
// The renderer fetches hosts derived from the request: a did:web domain, the
// well-known handle fallback, and the PDS endpoint named by the DID document.
// On a public deployment those are attacker-chosen, so every outbound host is
// DNS-resolved and rejected if it lands in private, loopback, link-local, or
// carrier-NAT space, and plain http is refused. TRELLIS_GARDEN_ALLOW_PRIVATE=1
// disables the guard for local development against a dev PDS. Known limit:
// addresses are checked per lookup, not pinned per connection, so a DNS
// rebinding TOCTOU remains; the JSON-only parsing and record validation keep
// what such a request could exfiltrate to well-formed garden records.

const allowPrivateHosts = () => env('TRELLIS_GARDEN_ALLOW_PRIVATE') === '1';

/** True for addresses no public service should resolve to. Exported for tests. */
export function isPrivateAddress(ip: string): boolean {
	if (ip.includes('.') && !ip.includes(':')) {
		const parts = ip.split('.').map(Number);
		if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
		const [a, b] = parts;
		return (
			a === 0 || // unspecified / "this network"
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0) || // 192.0.0/24 special-purpose
			(a === 198 && (b === 18 || b === 19)) || // benchmarking
			a >= 224 // multicast + reserved + broadcast
		);
	}
	const lower = ip.toLowerCase();
	// IPv4 embedded in IPv6 (::ffff:10.0.0.1) is judged by its IPv4 part.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
	if (mapped) return isPrivateAddress(mapped[1]);
	if (lower === '::' || lower === '::1') return true;
	return (
		lower.startsWith('fc') || lower.startsWith('fd') || // unique-local fc00::/7
		lower.startsWith('fe8') || lower.startsWith('fe9') ||
		lower.startsWith('fea') || lower.startsWith('feb') || // link-local fe80::/10
		lower.startsWith('ff') // multicast
	);
}

/** A URL hostname as a bare IP address, or null when it is a DNS name.
 *  URL.hostname wraps IPv6 literals in brackets, which no address parser
 *  accepts. Telling the two apart matters: isPrivateAddress() judges
 *  addresses, and reports anything unparseable as private, so handing it a
 *  DNS name would reject every real host. */
async function ipLiteral(hostname: string): Promise<string | null> {
	const bare =
		hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
	const { isIP } = await import('node:net');
	return isIP(bare) ? bare : null;
}

/** Refuses URLs a public renderer must not fetch. Passes everything in the
 *  browser (its own network rules apply) and under the dev override.
 *  Exported for tests, which otherwise run with the guard disabled. */
export async function isFetchableUrl(raw: string): Promise<boolean> {
	if (allowPrivateHosts()) return true;
	const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
	if (!proc?.versions?.node) return true;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	// An address literal names its destination outright; a DNS name has to be
	// resolved before it can be judged.
	const literal = await ipLiteral(url.hostname);
	if (literal) return !isPrivateAddress(literal);
	try {
		const { lookup } = await import('node:dns/promises');
		const addresses = await lookup(url.hostname, { all: true, verbatim: true });
		return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
	} catch {
		return false; // unresolvable hosts are not fetchable
	}
}

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown | null> {
	if (!(await isFetchableUrl(url))) return null;
	try {
		const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return null;
		return await res.json();
	} catch (error) {
		console.error('garden fetch failed', url, error);
		return null;
	}
}

async function resolveHandleToDid(handle: string, fetchImpl: Fetch): Promise<string | null> {
	const viaAppview = (await getJson(
		fetchImpl,
		`${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
	)) as { did?: string } | null;
	if (viaAppview?.did?.startsWith('did:')) return viaAppview.did;
	// Self-hosted handles the appview has not seen still resolve via well-known.
	const wellKnown = `https://${handle}/.well-known/atproto-did`;
	if (!(await isFetchableUrl(wellKnown))) return null;
	try {
		const res = await fetchImpl(wellKnown, {
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return null;
		const did = (await res.text()).trim();
		return did.startsWith('did:') ? did : null;
	} catch {
		return null;
	}
}

interface DidDocument {
	alsoKnownAs?: string[];
	service?: { id: string; type: string; serviceEndpoint: string }[];
}

async function fetchDidDocument(did: string, fetchImpl: Fetch): Promise<DidDocument | null> {
	if (did.startsWith('did:plc:'))
		return (await getJson(fetchImpl, `${PLC_DIRECTORY}/${did}`)) as DidDocument | null;
	if (did.startsWith('did:web:')) {
		const host = decodeURIComponent(did.slice('did:web:'.length));
		// Only bare-domain did:web (no path segments) is supported here.
		if (host.includes(':') || host.includes('/')) return null;
		return (await getJson(fetchImpl, `https://${host}/.well-known/did.json`)) as DidDocument | null;
	}
	return null;
}

/** Resolve a handle or DID to the identity a garden lives under. */
export async function resolveIdentity(ident: string, fetchImpl: Fetch): Promise<GardenIdentity | null> {
	const did = ident.startsWith('did:')
		? ident
		: HANDLE_RE.test(ident)
			? await resolveHandleToDid(ident, fetchImpl)
			: null;
	if (!did) return null;
	const doc = await fetchDidDocument(did, fetchImpl);
	if (!doc) return null;
	const service = doc.service?.find(
		(s) => s.id.endsWith('#atproto_pds') || s.type === 'AtprotoPersonalDataServer'
	);
	if (!service || typeof service.serviceEndpoint !== 'string') return null;
	let pds: URL;
	try {
		pds = new URL(service.serviceEndpoint);
	} catch {
		return null;
	}
	// The endpoint comes from a document the garden owner controls: it must be
	// https and pass the same private-network guard as every other fetch
	// (plain http is allowed only under the local-dev override).
	if (pds.protocol !== 'https:' && !(allowPrivateHosts() && pds.protocol === 'http:')) return null;
	if (!(await isFetchableUrl(pds.origin))) return null;
	const aka = doc.alsoKnownAs?.find((a) => a.startsWith('at://'));
	return { did, handle: aka?.slice('at://'.length), pds: pds.origin };
}

interface ListedRecord {
	uri: string;
	cid: string;
	value: unknown;
}

async function listAllRecords(
	pds: string,
	did: string,
	collection: string,
	fetchImpl: Fetch
): Promise<ListedRecord[]> {
	const out: ListedRecord[] = [];
	let cursor: string | undefined;
	// Pagination bound keeps a hostile repo from holding the renderer open.
	for (let page = 0; page < 20; page++) {
		const params = new URLSearchParams({ repo: did, collection, limit: '100' });
		if (cursor) params.set('cursor', cursor);
		const res = (await getJson(fetchImpl, `${pds}/xrpc/com.atproto.repo.listRecords?${params}`)) as {
			records?: ListedRecord[];
			cursor?: string;
		} | null;
		if (!res?.records) break;
		out.push(...res.records.filter((r) => typeof r.uri === 'string'));
		if (!res.cursor || res.records.length === 0) break;
		cursor = res.cursor;
	}
	return out;
}

// --- the reader's view ---

export interface PublicThought {
	rkey: string;
	uri: string;
	record: ThoughtRecord;
	/** Live public revisions, oldest first. The last is the current one. */
	revisions: { rkey: string; uri: string; record: RevisionRecord }[];
}

export interface PublicRelation {
	uri: string;
	record: RelationRecord;
	fromRkey: string;
	toRkey: string;
}

export interface ChangeEntry {
	thoughtRkey: string;
	thoughtTitle: string;
	revision: RevisionRecord;
	revisionRkey: string;
	/** The revision this one replaced, when it is itself still live. */
	prev?: RevisionRecord;
}

export interface GardenView {
	identity: GardenIdentity;
	/** The garden's address under that identity. */
	key: string;
	garden: GardenRecord;
	/** Manifest order. */
	thoughts: PublicThought[];
	byRkey: Record<string, PublicThought>;
	relations: PublicRelation[];
	pinnedRkeys: string[];
	treatment?: {
		rkey: string;
		record: TreatmentRecord;
		/** Some source thought has moved past the revisions this prose used. */
		stale: boolean;
	};
	/** Revisions newest-release-first, for "what changed". */
	changes: ChangeEntry[];
}

/** One published garden as the index sees it: enough to list it without
 *  reading the thoughts behind it. */
export interface GardenSummary {
	/** The garden's address — its rkey and its URL segment. */
	key: string;
	uri: string;
	record: GardenRecord;
}

/** Every garden published under an identity, most recently released first.
 *  A repo can hold several: one per graph its author publishes. */
export async function listGardens(
	identity: GardenIdentity,
	fetchImpl: Fetch
): Promise<GardenSummary[]> {
	const rows = await listAllRecords(identity.pds, identity.did, COLLECTIONS.garden, fetchImpl);
	const gardens: GardenSummary[] = [];
	for (const row of rows) {
		const parsed = parseAtUri(row.uri);
		const record = readGardenRecord(row.value);
		// The address is also a URL segment, so it is held to the same shape
		// the publisher writes; anything else is a record we cannot link to.
		if (!parsed || !record || !GARDEN_KEY_RE.test(parsed.rkey)) continue;
		gardens.push({ key: parsed.rkey, uri: row.uri, record });
	}
	return gardens.sort(
		(a, b) => Date.parse(b.record.release.publishedAt) - Date.parse(a.record.release.publishedAt)
	);
}

/** Load one garden of a resolved identity by its address. Null when no such
 *  garden is published. */
export async function loadGardenAt(
	identity: GardenIdentity,
	gardenKey: string,
	fetchImpl: Fetch
): Promise<GardenView | null> {
	const { pds, did } = identity;
	if (!GARDEN_KEY_RE.test(gardenKey)) return null;

	const gardenRes = (await getJson(
		fetchImpl,
		`${pds}/xrpc/com.atproto.repo.getRecord?${new URLSearchParams({
			repo: did,
			collection: COLLECTIONS.garden,
			rkey: gardenKey
		})}`
	)) as { value?: unknown } | null;
	const garden = gardenRes ? readGardenRecord(gardenRes.value) : null;
	if (!garden) return null;

	const [thoughtRows, revisionRows, relationRows, treatmentRows] = await Promise.all([
		listAllRecords(pds, did, COLLECTIONS.thought, fetchImpl),
		listAllRecords(pds, did, COLLECTIONS.revision, fetchImpl),
		listAllRecords(pds, did, COLLECTIONS.relation, fetchImpl),
		listAllRecords(pds, did, COLLECTIONS.treatment, fetchImpl)
	]);

	// The manifest is the release boundary: records the garden does not list
	// are not part of the coherent release and never render.
	const manifest = new Set([
		...garden.release.thoughts,
		...garden.release.revisions,
		...garden.release.relations
	]);

	const revisionsByThoughtUri = new Map<string, { rkey: string; uri: string; record: RevisionRecord }[]>();
	for (const row of revisionRows) {
		if (!manifest.has(row.uri)) continue;
		const record = readRevisionRecord(row.value);
		const parsed = parseAtUri(row.uri);
		if (!record || !parsed) continue;
		const list = revisionsByThoughtUri.get(record.thought) ?? [];
		list.push({ rkey: parsed.rkey, uri: row.uri, record });
		revisionsByThoughtUri.set(record.thought, list);
	}
	for (const list of revisionsByThoughtUri.values())
		list.sort((a, b) => Date.parse(a.record.publishedAt) - Date.parse(b.record.publishedAt));

	const thoughts: PublicThought[] = [];
	const byRkey: Record<string, PublicThought> = {};
	const byUri = new Map<string, PublicThought>();
	for (const uri of garden.release.thoughts) {
		const row = thoughtRows.find((r) => r.uri === uri);
		const parsed = parseAtUri(uri);
		if (!row || !parsed) continue;
		const record = readThoughtRecord(row.value);
		if (!record) continue;
		const thought: PublicThought = {
			rkey: parsed.rkey,
			uri,
			record,
			revisions: revisionsByThoughtUri.get(uri) ?? []
		};
		thoughts.push(thought);
		byRkey[parsed.rkey] = thought;
		byUri.set(uri, thought);
	}

	const relations: PublicRelation[] = [];
	for (const row of relationRows) {
		if (!manifest.has(row.uri)) continue;
		const record = readRelationRecord(row.value);
		if (!record) continue;
		const from = byUri.get(record.from);
		const to = byUri.get(record.to);
		// Both endpoints must be in the release; dangling links never render.
		if (!from || !to) continue;
		relations.push({ uri: row.uri, record, fromRkey: from.rkey, toRkey: to.rkey });
	}

	let treatment: GardenView['treatment'];
	if (garden.treatment) {
		const row = treatmentRows.find((r) => r.uri === garden.treatment);
		const parsed = parseAtUri(garden.treatment);
		const record = row && parsed ? readTreatmentRecord(row.value) : null;
		if (record && parsed) {
			const liveRevisionUris = new Set(thoughts.map((t) => t.record.currentRevision));
			const sourceThoughts = new Set(
				record.sourceRevisions
					.map((uri) => revisionRowThought(uri, revisionsByThoughtUri))
					.filter((u): u is string => u !== null)
			);
			// Stale when any source thought has a newer current revision, or a
			// source revision's thought left the release entirely.
			const stale =
				record.sourceRevisions.some((uri) => {
					const thoughtUri = revisionRowThought(uri, revisionsByThoughtUri);
					return thoughtUri === null || !byUri.has(thoughtUri);
				}) ||
				[...sourceThoughts].some((thoughtUri) => {
					const current = byUri.get(thoughtUri)?.record.currentRevision;
					return current !== undefined && !record.sourceRevisions.includes(current);
				});
			treatment = { rkey: parsed.rkey, record, stale };
		}
	}

	const changes: ChangeEntry[] = [];
	for (const thought of thoughts) {
		for (const rev of thought.revisions) {
			const prev = rev.record.prev
				? thought.revisions.find((r) => r.uri === rev.record.prev)?.record
				: undefined;
			changes.push({
				thoughtRkey: thought.rkey,
				thoughtTitle: thought.record.title,
				revision: rev.record,
				revisionRkey: rev.rkey,
				prev
			});
		}
	}
	changes.sort((a, b) => Date.parse(b.revision.publishedAt) - Date.parse(a.revision.publishedAt));

	const pinnedRkeys = garden.pinned
		.map((uri) => byUri.get(uri)?.rkey)
		.filter((r): r is string => r !== undefined);

	return { identity, key: gardenKey, garden, thoughts, byRkey, relations, pinnedRkeys, treatment, changes };
}

/** Resolve an identity and load one of its gardens — the whole read in one
 *  call, for callers that hold no identity yet. */
export async function loadGarden(
	ident: string,
	gardenKey: string,
	fetchImpl: Fetch
): Promise<GardenView | null> {
	const identity = await resolveIdentity(ident.trim(), fetchImpl);
	return identity ? loadGardenAt(identity, gardenKey, fetchImpl) : null;
}

function revisionRowThought(
	revisionUri: string,
	revisionsByThoughtUri: Map<string, { uri: string; record: RevisionRecord }[]>
): string | null {
	for (const [thoughtUri, list] of revisionsByThoughtUri)
		if (list.some((r) => r.uri === revisionUri)) return thoughtUri;
	return null;
}
