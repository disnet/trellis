// The public garden's atproto vocabulary: record shapes Trellis publishes to a
// personal data server, plus the shared helpers for building and reading them.
// Client-safe — used by the publish preview, the release builder on the
// server, and the public renderer. Mirrors docs/public-garden-direction.md
// "Lexicon sketch"; the JSON lexicon documents live in lexicons/.
//
// Records here are the *public representation*, never the local workspace
// rows: no conversations, no writing guidance, no proposed operations, no
// unpublished revision history.

import type { Confidence, RelationType, ThoughtStatus, ThoughtType } from '$lib/types';

/** Lexicon namespace. One constant so the NSID domain can change in one place
 *  before records are published anywhere that matters. */
export const NSID_PREFIX = 'com.disnetdev.trellis';

export const COLLECTIONS = {
	garden: `${NSID_PREFIX}.garden`,
	thought: `${NSID_PREFIX}.thought`,
	revision: `${NSID_PREFIX}.revision`,
	relation: `${NSID_PREFIX}.relation`,
	treatment: `${NSID_PREFIX}.treatment`
} as const;
export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** The one garden record per repo. */
export const GARDEN_RKEY = 'self';

// Runtime copies of the closed vocabularies (types.ts holds only the types;
// the agent wire schema's copies live under server/ and cannot be imported
// from client code).
export const THOUGHT_TYPES: ThoughtType[] = ['claim', 'question', 'concept', 'example', 'prediction', 'evidence'];
export const THOUGHT_STATUSES: ThoughtStatus[] = ['tentative', 'developing', 'believed', 'contested', 'retired'];
export const RELATION_TYPES: RelationType[] = ['supports', 'contradicts', 'depends_on', 'example_of', 'supersedes', 'related_to'];

// Published text limits (matches the workspace's own limits, plus the
// garden-only fields).
export const TITLE_LIMIT = 300;
export const STATEMENT_LIMIT = 4000;
export const SOURCE_LIMIT = 500;
export const CHANGE_NOTE_LIMIT = 1000;
export const GARDEN_TITLE_LIMIT = 120;
export const GARDEN_SUMMARY_LIMIT = 3000;
export const TREATMENT_BODY_LIMIT = 30_000;

/** Confidence as it travels in records. The atproto data model has no float
 *  type (DAG-CBOR restriction), so numeric values are decimal strings. */
export interface PublicConfidence {
	/** Decimal string, 0–1. */
	probability?: string;
	low?: string;
	high?: string;
	unit?: string;
	/** ISO date (YYYY-MM-DD). */
	resolveBy?: string;
}

export function toPublicConfidence(c: Confidence): PublicConfidence {
	const out: PublicConfidence = {};
	if (c.probability !== undefined) out.probability = String(c.probability);
	if (c.low !== undefined) out.low = String(c.low);
	if (c.high !== undefined) out.high = String(c.high);
	if (c.unit !== undefined) out.unit = c.unit;
	if (c.resolveBy !== undefined) out.resolveBy = c.resolveBy;
	return out;
}

/** Back to display form; malformed numbers from foreign records drop out. */
export function fromPublicConfidence(c: PublicConfidence): Confidence {
	const num = (v: string | undefined) => {
		if (v === undefined) return undefined;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	};
	const out: Confidence = {};
	const probability = num(c.probability);
	if (probability !== undefined) out.probability = probability;
	const low = num(c.low);
	const high = num(c.high);
	if (low !== undefined && high !== undefined) {
		out.low = low;
		out.high = high;
	}
	if (typeof c.unit === 'string') out.unit = c.unit;
	if (typeof c.resolveBy === 'string') out.resolveBy = c.resolveBy;
	return out;
}

/** Who wrote the words. Acceptance into the workspace is a separate act and
 *  is implied for everything published: ratification precedes publication. */
export interface Authorship {
	actor: 'human' | 'agent';
	/** The human edited the agent's proposal before accepting it. */
	editedFromProposal?: boolean;
}

/** A thought's current public state. rkey = the local thought id, so identity
 *  is stable across releases and prose references resolve unchanged. */
export interface ThoughtRecord {
	$type: string;
	thoughtType: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	/** Predictions only. */
	confidence?: PublicConfidence;
	/** Evidence only: citation, URL, or dataset. */
	source?: string;
	/** at-uri of the revision record holding this exact content. */
	currentRevision: string;
	/** When the thought was first captured locally (ISO datetime). */
	createdAt: string;
	/** When it first appeared in a release; stable thereafter. */
	firstPublishedAt: string;
}

/** A selected public version of a thought. Published once, then immutable;
 *  retained until deliberately withdrawn. Local history is not public
 *  history — only the state at each release gets a revision record. */
export interface RevisionRecord {
	$type: string;
	/** at-uri of the thought this is a version of. */
	thought: string;
	/** at-uri of the previous *public* revision, absent on the first. */
	prev?: string;
	title: string;
	statement: string;
	status: ThoughtStatus;
	confidence?: PublicConfidence;
	source?: string;
	authorship: Authorship;
	/** Optional author-reviewed explanation of what changed and why. */
	changeNote?: string;
	/** When this content was written locally (ISO datetime). */
	createdAt: string;
	/** When this revision was released. */
	publishedAt: string;
}

/** A typed connection between two published thoughts. Pins the revisions that
 *  were current when the relation was first published, so readers can see the
 *  version the link engaged with even after the thoughts move on. */
export interface RelationRecord {
	$type: string;
	/** at-uri of the subject thought record. */
	from: string;
	/** at-uri of the object thought record. */
	to: string;
	fromRevision: string;
	toRevision: string;
	relationType: RelationType;
	createdBy: 'human' | 'agent';
	createdAt: string;
	publishedAt: string;
}

/** A publication-approved prose view. Always a derived, visibly agent-authored
 *  artifact; the author's selection of this exact draft is the approval. The
 *  private writing guidance never publishes. */
export interface TreatmentRecord {
	$type: string;
	title: string;
	/** Plain text with [[thought-id]] references — never HTML. */
	body: string;
	style: string;
	agentAuthored: true;
	/** Adapter:model that generated the prose. */
	model: string;
	/** at-uris of the exact source revisions this prose was written from. */
	sourceRevisions: string[];
	generatedAt: string;
	publishedAt: string;
}

/** The garden's front door and release manifest. The manifest identifies the
 *  coherent set of live records: renderers must show manifest members only,
 *  so readers never see a half-published release. */
export interface GardenRecord {
	$type: string;
	title: string;
	/** Author-written introduction, plain text. */
	summary?: string;
	/** at-uris of pinned thoughts — direct entry points into the structure. */
	pinned: string[];
	/** at-uri of the approved treatment shown as the front-door essay. */
	treatment?: string;
	release: {
		publishedAt: string;
		thoughts: string[];
		/** Every live revision record, including retained history. */
		revisions: string[];
		relations: string[];
	};
	createdAt: string;
}

// --- at-uris ---

export const RKEY_RE = /^[A-Za-z0-9._:~-]{1,512}$/;

export function atUri(did: string, collection: string, rkey: string): string {
	return `at://${did}/${collection}/${rkey}`;
}

export function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
	const m = /^at:\/\/(did:[a-z0-9]+:[A-Za-z0-9._:%-]+)\/([a-zA-Z0-9.-]+)\/([A-Za-z0-9._:~-]{1,512})$/.exec(uri);
	return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

// --- rendering vocabulary ---

/** Public rendering labels for relation types. The data keeps the precise
 *  vocabulary; the reading surface softens it to direct attention at ideas
 *  rather than combat ("contradicts" renders as "in tension with",
 *  "supersedes" as "rethought as"). `forward` reads from the subject's page,
 *  `reverse` from the object's. */
export const RELATION_LABELS: Record<RelationType, { forward: string; reverse: string }> = {
	supports: { forward: 'supports', reverse: 'supported by' },
	contradicts: { forward: 'in tension with', reverse: 'in tension with' },
	depends_on: { forward: 'depends on', reverse: 'needed by' },
	example_of: { forward: 'an example of', reverse: 'illustrated by' },
	supersedes: { forward: 'rethinks', reverse: 'rethought as' },
	related_to: { forward: 'related to', reverse: 'related to' }
};

export const STATUS_LABELS: Record<ThoughtStatus, string> = {
	tentative: 'tentative',
	developing: 'developing',
	believed: 'believed',
	contested: 'contested',
	retired: 'retired'
};

// --- readers' validation ---
// Published records arrive from other people's repositories: untrusted data.
// Each guard returns the typed record or null; renderers skip what fails.

const str = (v: unknown, limit: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= limit;
const optStr = (v: unknown, limit: number) => v === undefined || (typeof v === 'string' && v.length <= limit);
const isoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const uriList = (v: unknown, max = 5000): v is string[] =>
	Array.isArray(v) && v.length <= max && v.every((u) => typeof u === 'string' && parseAtUri(u) !== null);

function validConfidence(v: unknown): boolean {
	if (v === undefined) return true;
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
	const o = v as Record<string, unknown>;
	return Object.entries(o).every(
		([k, value]) =>
			['probability', 'low', 'high', 'unit', 'resolveBy'].includes(k) &&
			typeof value === 'string' &&
			value.length <= 100
	);
}

function validAuthorship(v: unknown): v is Authorship {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	return (o.actor === 'human' || o.actor === 'agent') &&
		(o.editedFromProposal === undefined || typeof o.editedFromProposal === 'boolean');
}

export function readThoughtRecord(v: unknown): ThoughtRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (!THOUGHT_TYPES.includes(o.thoughtType as ThoughtType)) return null;
	if (!THOUGHT_STATUSES.includes(o.status as ThoughtStatus)) return null;
	if (!str(o.title, TITLE_LIMIT) || !str(o.statement, STATEMENT_LIMIT)) return null;
	if (!optStr(o.source, SOURCE_LIMIT) || !validConfidence(o.confidence)) return null;
	if (typeof o.currentRevision !== 'string' || !parseAtUri(o.currentRevision)) return null;
	if (!isoDate(o.createdAt) || !isoDate(o.firstPublishedAt)) return null;
	return o as unknown as ThoughtRecord;
}

export function readRevisionRecord(v: unknown): RevisionRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (typeof o.thought !== 'string' || !parseAtUri(o.thought)) return null;
	if (o.prev !== undefined && (typeof o.prev !== 'string' || !parseAtUri(o.prev))) return null;
	if (!str(o.title, TITLE_LIMIT) || !str(o.statement, STATEMENT_LIMIT)) return null;
	if (!THOUGHT_STATUSES.includes(o.status as ThoughtStatus)) return null;
	if (!optStr(o.source, SOURCE_LIMIT) || !validConfidence(o.confidence)) return null;
	if (!validAuthorship(o.authorship)) return null;
	if (!optStr(o.changeNote, CHANGE_NOTE_LIMIT)) return null;
	if (!isoDate(o.createdAt) || !isoDate(o.publishedAt)) return null;
	return o as unknown as RevisionRecord;
}

export function readRelationRecord(v: unknown): RelationRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	for (const k of ['from', 'to', 'fromRevision', 'toRevision'] as const)
		if (typeof o[k] !== 'string' || !parseAtUri(o[k] as string)) return null;
	if (!RELATION_TYPES.includes(o.relationType as RelationType)) return null;
	if (o.createdBy !== 'human' && o.createdBy !== 'agent') return null;
	if (!isoDate(o.createdAt) || !isoDate(o.publishedAt)) return null;
	return o as unknown as RelationRecord;
}

export function readTreatmentRecord(v: unknown): TreatmentRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (!str(o.title, TITLE_LIMIT) || !str(o.body, TREATMENT_BODY_LIMIT)) return null;
	if (!str(o.style, 40) || !str(o.model, 200)) return null;
	if (o.agentAuthored !== true) return null;
	if (!uriList(o.sourceRevisions)) return null;
	if (!isoDate(o.generatedAt) || !isoDate(o.publishedAt)) return null;
	return o as unknown as TreatmentRecord;
}

export function readGardenRecord(v: unknown): GardenRecord | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (!str(o.title, GARDEN_TITLE_LIMIT)) return null;
	if (!optStr(o.summary, GARDEN_SUMMARY_LIMIT)) return null;
	if (!uriList(o.pinned, 100)) return null;
	if (o.treatment !== undefined && (typeof o.treatment !== 'string' || !parseAtUri(o.treatment))) return null;
	const r = o.release as Record<string, unknown> | undefined;
	if (typeof r !== 'object' || r === null) return null;
	if (!isoDate(r.publishedAt)) return null;
	if (!uriList(r.thoughts) || !uriList(r.revisions) || !uriList(r.relations)) return null;
	if (!isoDate(o.createdAt)) return null;
	return o as unknown as GardenRecord;
}
