// Building and executing a garden release: the allowlisted public snapshot,
// the diff against what is already live, and the record writes themselves.
//
// The publication boundary lives here. A release carries the graph's
// thoughts, their selected public revisions, its relations, one approved
// treatment, and the garden record — nothing else. Conversations, scratch notes, proposed
// operations, writing guidance, and unpublished local history have no path
// into a record. Local state stays the source of truth; publishing is a
// separate deliberate act on a reviewed diff (docs/public-garden-direction.md).

import crypto from 'node:crypto';
import { db } from '../db';
import { getProseTreatment } from '../store';
import { parseProseReference, proseParts } from '$lib/prose-format';
import {
	atUri,
	CHANGE_NOTE_LIMIT,
	COLLECTIONS,
	DEFAULT_GARDEN_RKEY,
	GARDEN_KEY_RE,
	gardenKeyFromTitle,
	GARDEN_SUMMARY_LIMIT,
	GARDEN_TITLE_LIMIT,
	toPublicConfidence,
	type Authorship,
	type GardenRecord,
	type PublicConfidence,
	type RelationRecord,
	type RevisionRecord,
	type ThoughtRecord,
	type TreatmentRecord
} from '$lib/garden/lexicon';
import type { RepoWriter } from './xrpc';

// --- configuration (per graph, in meta) ---

export interface PublishConfig {
	/** The garden's address: its garden-record rkey and the last segment of
	 *  its public URL. One per graph, so a repo can host several gardens. */
	key: string;
	treatmentId: string | null;
	title: string;
	summary: string;
}

function getMeta(key: string): string | null {
	const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value ?? null;
}

function setMeta(key: string, value: string | null) {
	if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key);
	else
		db.prepare(
			'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		).run(key, value);
}

export function getPublishConfig(graphId: string): PublishConfig | null {
	const raw = getMeta(`publish_config:${graphId}`);
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		return {
			key: typeof v.key === 'string' ? v.key : '',
			treatmentId: typeof v.treatmentId === 'string' ? v.treatmentId : null,
			title: typeof v.title === 'string' ? v.title : '',
			summary: typeof v.summary === 'string' ? v.summary : ''
		};
	} catch {
		return null;
	}
}

export function savePublishConfig(graphId: string, config: PublishConfig) {
	setMeta(`publish_config:${graphId}`, JSON.stringify(config));
}

const graphName = (graphId: string) =>
	(db.prepare('SELECT name FROM graphs WHERE id = ?').get(graphId) as { name: string } | undefined)
		?.name ?? 'another graph';

/** Addresses already spoken for by *other* graphs — live garden records and
 *  saved configurations both count, so two graphs never race for one. */
function takenAddresses(graphId: string): Set<string> {
	const taken = new Set<string>();
	for (const row of db
		.prepare('SELECT rkey FROM published_records WHERE collection = ? AND graph_id <> ?')
		.all(COLLECTIONS.garden, graphId) as { rkey: string }[])
		taken.add(row.rkey);
	for (const row of db
		.prepare("SELECT key, value FROM meta WHERE key LIKE 'publish_config:%'")
		.all() as { key: string; value: string }[]) {
		if (row.key === `publish_config:${graphId}`) continue;
		try {
			const key = JSON.parse(row.value)?.key;
			if (typeof key === 'string' && key) taken.add(key);
		} catch {
			// A config we cannot read claims no address.
		}
	}
	return taken;
}

/** This graph's garden address: where it already publishes, else what it has
 *  been configured with, else a free slug derived from its title. A repo can
 *  hold many gardens, so the address has to be stable per graph and unique
 *  across them. */
export function gardenAddress(graphId: string, title: string): string {
	const live = db
		.prepare('SELECT rkey FROM published_records WHERE graph_id = ? AND collection = ? LIMIT 1')
		.get(graphId, COLLECTIONS.garden) as { rkey: string } | undefined;
	if (live) return live.rkey;
	const configured = getPublishConfig(graphId)?.key;
	if (configured) return configured;
	const taken = takenAddresses(graphId);
	// The first garden in a repo keeps the historical `self` address.
	if (!taken.size) return DEFAULT_GARDEN_RKEY;
	const base = gardenKeyFromTitle(title.trim() || graphName(graphId));
	if (!taken.has(base)) return base;
	for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
	return `${base}-${Date.now()}`;
}

export interface LiveGarden {
	graphId: string;
	graphName: string;
	key: string;
	title: string;
	thoughts: number;
	lastPublishedAt: number;
}

/** Every garden this workspace has live in the connected repo, newest first —
 *  several graphs can be published side by side. */
export function liveGardens(): LiveGarden[] {
	const rows = db
		.prepare('SELECT graph_id, rkey, record, published_at FROM published_records WHERE collection = ?')
		.all(COLLECTIONS.garden) as {
		graph_id: string;
		rkey: string;
		record: string;
		published_at: number;
	}[];
	const gardens: LiveGarden[] = [];
	for (const row of rows) {
		let record: GardenRecord;
		try {
			record = JSON.parse(row.record) as GardenRecord;
		} catch {
			continue;
		}
		gardens.push({
			graphId: row.graph_id,
			graphName: graphName(row.graph_id),
			key: row.rkey,
			title: record.title,
			thoughts: record.release?.thoughts?.length ?? 0,
			lastPublishedAt: row.published_at
		});
	}
	return gardens.sort((a, b) => b.lastPublishedAt - a.lastPublishedAt);
}

// --- the plan ---

export type RecordKind = 'thought' | 'revision' | 'relation' | 'treatment' | 'garden';

export interface PlannedPut {
	collection: string;
	rkey: string;
	record: object;
	hash: string;
	kind: RecordKind;
	label: string;
	isNew: boolean;
}

export interface PlannedDelete {
	collection: string;
	rkey: string;
	kind: RecordKind;
	label: string;
}

/** A thought whose public content this release would revise — the candidates
 *  for an author-written change note. */
export interface ChangedThought {
	thoughtId: string;
	title: string;
	changes: string[];
}

export interface ReleasePlan {
	graphId: string;
	did: string;
	/** New and changed records; the garden record, when present, is last. */
	puts: PlannedPut[];
	/** Records leaving the release; executed after the garden update. */
	deletes: PlannedDelete[];
	unchanged: number;
	newThoughts: { thoughtId: string; title: string }[];
	changedThoughts: ChangedThought[];
	warnings: string[];
}

const hash = (value: object) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Diff on content, not on when it was released: the publish timestamp alone
 *  never makes a record look changed (a retried plan must converge). */
const contentHash = (record: object) => {
	const { publishedAt: _publishedAt, ...rest } = record as { publishedAt?: string };
	return hash(rest);
};
const iso = (ms: number) => new Date(ms).toISOString();

/** Public string form in a fixed field order, so stored and rebuilt
 *  confidence values compare equal. (The atproto data model has no floats.) */
function normalizeConfidence(raw: string | null): PublicConfidence | undefined {
	if (!raw) return undefined;
	try {
		const c = toPublicConfidence(JSON.parse(raw));
		return Object.keys(c).length ? c : undefined;
	} catch {
		return undefined;
	}
}

interface PublishedRow {
	collection: string;
	rkey: string;
	uri: string;
	cid: string | null;
	record: string;
	content_hash: string;
	published_at: number;
}

function publishedRows(graphId: string): Map<string, PublishedRow> {
	const rows = db
		.prepare('SELECT * FROM published_records WHERE graph_id = ?')
		.all(graphId) as PublishedRow[];
	return new Map(rows.map((r) => [`${r.collection}/${r.rkey}`, r]));
}

interface LocalThoughtRow {
	id: string;
	type: string;
	status: string;
	title: string;
	statement: string;
	confidence: string | null;
	source: string | null;
	created_at: number;
}

const contentOf = (r: {
	title: string;
	statement: string;
	status: string;
	confidence?: PublicConfidence;
	source?: string;
}) =>
	JSON.stringify({
		title: r.title,
		statement: r.statement,
		status: r.status,
		confidence: r.confidence ?? null,
		source: r.source ?? null
	});

/** Compute the full release: what would be written, deleted, and left alone.
 *  Throws with a human-readable message when the graph cannot publish.
 *  `changeNotes` maps thought id → author explanation for this release's
 *  revision of it (collected in the preview, applied on the run). */
export function buildReleasePlan(
	graphId: string,
	config: PublishConfig,
	did: string,
	changeNotes: Record<string, string> = {}
): ReleasePlan {
	const title = config.title.trim();
	if (!title) throw new Error('The garden needs a title.');
	if (title.length > GARDEN_TITLE_LIMIT)
		throw new Error(`The garden title must be at most ${GARDEN_TITLE_LIMIT} characters.`);
	if (config.summary.length > GARDEN_SUMMARY_LIMIT)
		throw new Error(`The introduction must be at most ${GARDEN_SUMMARY_LIMIT} characters.`);
	const gardenKey = config.key.trim();
	if (!GARDEN_KEY_RE.test(gardenKey))
		throw new Error(
			'The garden address must be lowercase letters, digits, and hyphens (at most 63 characters).'
		);
	const addressTaken = db
		.prepare(
			`SELECT graph_id FROM published_records
			 WHERE collection = ? AND rkey = ? AND graph_id <> ?`
		)
		.get(COLLECTIONS.garden, gardenKey, graphId) as { graph_id: string } | undefined;
	if (addressTaken)
		throw new Error(
			`The address “${gardenKey}” already belongs to the published garden of ${graphName(addressTaken.graph_id)}. Choose another.`
		);
	// A garden is the whole graph. Groups organize local work; they never
	// carve up what goes public — a partial graph publishes edges that point
	// at thoughts readers cannot see.
	const thoughts = db
		.prepare(
			`SELECT id, type, status, title, statement, confidence, source, created_at
			 FROM thoughts WHERE graph_id = ? ORDER BY id`
		)
		.all(graphId) as LocalThoughtRow[];
	if (!thoughts.length) throw new Error('This graph has no thoughts to publish.');
	const selected = new Set(thoughts.map((t) => t.id));

	const published = publishedRows(graphId);
	const now = Date.now();
	const warnings: string[] = [];
	const puts: PlannedPut[] = [];
	const desired = new Set<string>();
	let unchanged = 0;
	const newThoughts: ReleasePlan['newThoughts'] = [];
	const changedThoughts: ChangedThought[] = [];

	const keep = (collection: string, rkey: string) => desired.add(`${collection}/${rkey}`);
	const plan = (put: PlannedPut, stored: PublishedRow | undefined) => {
		keep(put.collection, put.rkey);
		if (stored && stored.content_hash === put.hash) unchanged++;
		else puts.push(put);
	};

	const latestLocalRevision = db.prepare(
		`SELECT id, actor_type, edited_from_proposal, created_at FROM thought_revisions
		 WHERE thought_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
	);

	// Thoughts and their public revisions.
	const currentRevisionUri = new Map<string, string>();
	const revisionUris: string[] = [];
	for (const t of thoughts) {
		const thoughtUri = atUri(did, COLLECTIONS.thought, t.id);
		const storedThought = published.get(`${COLLECTIONS.thought}/${t.id}`);
		const storedRecord = storedThought ? (JSON.parse(storedThought.record) as ThoughtRecord) : null;

		// Retain every already-published revision of this thought.
		for (const row of published.values()) {
			if (row.collection !== COLLECTIONS.revision) continue;
			const rec = JSON.parse(row.record) as RevisionRecord;
			if (rec.thought !== thoughtUri) continue;
			keep(COLLECTIONS.revision, row.rkey);
			unchanged++;
		}

		const confidence = normalizeConfidence(t.confidence);
		const fields = {
			title: t.title,
			statement: t.statement,
			status: t.status,
			...(confidence ? { confidence } : {}),
			...(t.source ? { source: t.source } : {})
		};

		const prevUri = storedRecord?.currentRevision;
		const prevRow = prevUri
			? [...published.values()].find(
					(r) => r.collection === COLLECTIONS.revision && atUri(did, r.collection, r.rkey) === prevUri
				)
			: undefined;
		const prevRecord = prevRow ? (JSON.parse(prevRow.record) as RevisionRecord) : null;
		const contentChanged = !prevRecord || contentOf(prevRecord) !== contentOf(fields as RevisionRecord);

		let revisionUri = prevUri;
		if (contentChanged) {
			const local = latestLocalRevision.get(t.id) as
				| { id: string; actor_type: string; edited_from_proposal: number; created_at: number }
				| undefined;
			if (!local) throw new Error(`Thought “${t.title}” has no revision history.`);
			const authorship: Authorship = {
				actor: local.actor_type === 'agent' ? 'agent' : 'human',
				...(local.edited_from_proposal ? { editedFromProposal: true } : {})
			};
			const note = (changeNotes[t.id] ?? '').trim();
			if (note.length > CHANGE_NOTE_LIMIT)
				throw new Error(`The change note for “${t.title}” must be at most ${CHANGE_NOTE_LIMIT} characters.`);
			const revision: RevisionRecord = {
				$type: COLLECTIONS.revision,
				thought: thoughtUri,
				...(prevUri ? { prev: prevUri } : {}),
				...fields,
				authorship,
				...(note && prevUri ? { changeNote: note } : {}),
				createdAt: iso(local.created_at),
				publishedAt: iso(now)
			} as RevisionRecord;
			revisionUri = atUri(did, COLLECTIONS.revision, local.id);
			plan(
				{
					collection: COLLECTIONS.revision,
					rkey: local.id,
					record: revision,
					hash: contentHash(revision),
					kind: 'revision',
					label: `revision of “${t.title}”`,
					isNew: true
				},
				published.get(`${COLLECTIONS.revision}/${local.id}`)
			);
			if (prevRecord) {
				const changes: string[] = [];
				if (prevRecord.title !== t.title) changes.push('title');
				if (prevRecord.statement !== t.statement) changes.push('statement');
				if (prevRecord.status !== t.status) changes.push(`status: ${prevRecord.status} → ${t.status}`);
				if (JSON.stringify(prevRecord.confidence ?? null) !== JSON.stringify(confidence ?? null))
					changes.push('confidence');
				if ((prevRecord.source ?? '') !== (t.source ?? '')) changes.push('source');
				changedThoughts.push({ thoughtId: t.id, title: t.title, changes });
			} else {
				newThoughts.push({ thoughtId: t.id, title: t.title });
			}
		}
		if (!revisionUri) throw new Error(`Could not determine the public revision for “${t.title}”.`);
		currentRevisionUri.set(t.id, revisionUri);
		revisionUris.push(revisionUri);

		const thoughtRecord: ThoughtRecord = {
			$type: COLLECTIONS.thought,
			thoughtType: t.type as ThoughtRecord['thoughtType'],
			status: t.status as ThoughtRecord['status'],
			title: t.title,
			statement: t.statement,
			...(confidence ? { confidence } : {}),
			...(t.source ? { source: t.source } : {}),
			currentRevision: revisionUri,
			createdAt: iso(t.created_at),
			firstPublishedAt: storedRecord?.firstPublishedAt ?? iso(now)
		} as ThoughtRecord;
		plan(
			{
				collection: COLLECTIONS.thought,
				rkey: t.id,
				record: thoughtRecord,
				hash: hash(thoughtRecord),
				kind: 'thought',
				label: `“${t.title}”`,
				isNew: !storedThought
			},
			storedThought
		);
	}
	// Collect the retained revision uris (kept above) into the manifest.
	for (const key of desired) {
		const [collection, rkey] = [key.slice(0, key.lastIndexOf('/')), key.slice(key.lastIndexOf('/') + 1)];
		if (collection === COLLECTIONS.revision) {
			const uri = atUri(did, COLLECTIONS.revision, rkey);
			if (!revisionUris.includes(uri)) revisionUris.push(uri);
		}
	}

	// Every relation in the graph. The endpoints are graph thoughts, so they
	// are always part of the release; a dangling row is skipped rather than
	// publishing a half-visible edge.
	const relationRows = db
		.prepare(
			`SELECT id, from_thought_id, to_thought_id, type, created_by, created_at
			 FROM relations WHERE graph_id = ? ORDER BY id`
		)
		.all(graphId) as {
		id: string;
		from_thought_id: string;
		to_thought_id: string;
		type: string;
		created_by: string;
		created_at: number;
	}[];
	const relationUris: string[] = [];
	for (const r of relationRows) {
		if (!selected.has(r.from_thought_id) || !selected.has(r.to_thought_id)) continue;
		const stored = published.get(`${COLLECTIONS.relation}/${r.id}`);
		relationUris.push(atUri(did, COLLECTIONS.relation, r.id));
		if (stored) {
			// Published relations keep the revisions they engaged at first release.
			keep(COLLECTIONS.relation, r.id);
			unchanged++;
			continue;
		}
		const record: RelationRecord = {
			$type: COLLECTIONS.relation,
			from: atUri(did, COLLECTIONS.thought, r.from_thought_id),
			to: atUri(did, COLLECTIONS.thought, r.to_thought_id),
			fromRevision: currentRevisionUri.get(r.from_thought_id)!,
			toRevision: currentRevisionUri.get(r.to_thought_id)!,
			relationType: r.type as RelationRecord['relationType'],
			createdBy: r.created_by === 'agent' ? 'agent' : 'human',
			createdAt: iso(r.created_at),
			publishedAt: iso(now)
		};
		plan(
			{
				collection: COLLECTIONS.relation,
				rkey: r.id,
				record,
				hash: contentHash(record),
				kind: 'relation',
				label: `relation ${r.type}: ${r.from_thought_id} → ${r.to_thought_id}`,
				isNew: true
			},
			stored
		);
	}

	// The approved treatment. A treatment already live stays exactly as
	// published (readers see it marked stale when its sources move on);
	// publishing a *new* treatment requires it to match its sources now.
	let treatmentUri: string | undefined;
	if (config.treatmentId) {
		const stored = published.get(`${COLLECTIONS.treatment}/${config.treatmentId}`);
		if (stored) {
			keep(COLLECTIONS.treatment, config.treatmentId);
			unchanged++;
			treatmentUri = atUri(did, COLLECTIONS.treatment, config.treatmentId);
			const record = JSON.parse(stored.record) as TreatmentRecord;
			const usesCurrent = record.sourceRevisions.every((uri) =>
				[...currentRevisionUri.values()].includes(uri)
			);
			if (!usesCurrent)
				warnings.push(
					'The published essay no longer matches its sources; readers see it marked as based on earlier versions until you approve a newer draft.'
				);
		} else {
			// Essays are still written from a group; the release only needs the
			// draft itself, wherever it was written.
			const draft = getProseTreatment(config.treatmentId);
			if (!draft) throw new Error('The selected essay draft was not found.');
			if (draft.stale)
				throw new Error(
					'The selected essay no longer matches the thoughts it was written from. Regenerate it, or pick a draft that reflects the current state.'
				);
			const missing = draft.sourceThoughtIds.filter((tid) => !selected.has(tid));
			if (missing.length)
				throw new Error(
					`The selected essay draws on ${missing.length} thought(s) that are no longer in this graph. Regenerate it before publishing.`
				);
			const record: TreatmentRecord = {
				$type: COLLECTIONS.treatment,
				title: draft.title,
				body: draft.body,
				style: draft.style,
				agentAuthored: true,
				model: draft.model,
				sourceRevisions: draft.sourceThoughtIds.map((tid) => currentRevisionUri.get(tid)!),
				generatedAt: iso(draft.generatedAt),
				publishedAt: iso(now)
			};
			// Guidance is deliberately absent: the writing direction stays private.
			for (const part of proseParts(draft.body)) {
				const ref = parseProseReference(part);
				if (ref && !selected.has(ref.thoughtId))
					warnings.push(
						`The essay references a thought that is not being published (${ref.thoughtId}); readers will see plain text there.`
					);
			}
			treatmentUri = atUri(did, COLLECTIONS.treatment, config.treatmentId);
			plan(
				{
					collection: COLLECTIONS.treatment,
					rkey: config.treatmentId,
					record,
					hash: contentHash(record),
					kind: 'treatment',
					label: `essay “${draft.title}”`,
					isNew: true
				},
				stored
			);
		}
	}

	// Pinned entry points.
	const pinnedRows = db
		.prepare('SELECT thought_id FROM pinned_thoughts WHERE graph_id = ? ORDER BY pinned_at, rowid')
		.all(graphId) as { thought_id: string }[];
	const pinnedUris = pinnedRows
		.filter((p) => selected.has(p.thought_id))
		.map((p) => atUri(did, COLLECTIONS.thought, p.thought_id));

	// The garden record: front door plus the release manifest, always written
	// last so readers never see a manifest pointing at missing records.
	const storedGarden = published.get(`${COLLECTIONS.garden}/${gardenKey}`);
	const storedGardenRecord = storedGarden ? (JSON.parse(storedGarden.record) as GardenRecord) : null;
	const gardenRecord: GardenRecord = {
		$type: COLLECTIONS.garden,
		title,
		...(config.summary.trim() ? { summary: config.summary.trim() } : {}),
		pinned: pinnedUris,
		...(treatmentUri ? { treatment: treatmentUri } : {}),
		release: {
			publishedAt: iso(now),
			thoughts: thoughts.map((t) => atUri(did, COLLECTIONS.thought, t.id)),
			revisions: [...revisionUris].sort(),
			relations: [...relationUris].sort()
		},
		createdAt: storedGardenRecord?.createdAt ?? iso(now)
	};
	// The release timestamp alone never forces a rewrite.
	const gardenHash = hash({ ...gardenRecord, release: { ...gardenRecord.release, publishedAt: '' } });
	keep(COLLECTIONS.garden, gardenKey);
	if (!storedGarden || storedGarden.content_hash !== gardenHash) {
		puts.push({
			collection: COLLECTIONS.garden,
			rkey: gardenKey,
			record: gardenRecord,
			hash: gardenHash,
			kind: 'garden',
			label: `garden “${title}”`,
			isNew: !storedGarden
		});
	} else unchanged++;

	// Several gardens share one repo, so two graphs must never claim the same
	// record key: a silent overwrite would make each release undo the other.
	// Local ids are random, so this is a guard against the unlucky case.
	for (const row of db
		.prepare('SELECT graph_id, collection, rkey FROM published_records WHERE graph_id <> ?')
		.all(graphId) as { graph_id: string; collection: string; rkey: string }[]) {
		if (!desired.has(`${row.collection}/${row.rkey}`)) continue;
		throw new Error(
			`The record key “${row.rkey}” is already published by the garden of ${graphName(row.graph_id)}. Publishing would overwrite it.`
		);
	}

	// Everything live that the release no longer includes gets withdrawn.
	const deletes: PlannedDelete[] = [];
	for (const [key, row] of published) {
		if (desired.has(key)) continue;
		const kind = (Object.entries(COLLECTIONS).find(([, c]) => c === row.collection)?.[0] ??
			'thought') as RecordKind;
		let label = `${kind} ${row.rkey}`;
		try {
			const rec = JSON.parse(row.record) as { title?: string };
			if (rec.title) label = `${kind} “${rec.title}”`;
		} catch {
			// The stored JSON is ours; a parse failure still leaves a usable label.
		}
		deletes.push({ collection: row.collection, rkey: row.rkey, kind, label });
	}

	return {
		graphId,
		did,
		puts,
		deletes,
		unchanged,
		newThoughts,
		changedThoughts,
		warnings
	};
}

// --- execution ---

export interface WriteResult {
	action: 'put' | 'delete';
	collection: string;
	rkey: string;
	kind: RecordKind;
	label: string;
	ok: boolean;
	error?: string;
}

export interface ReleaseOutcome {
	status: 'complete' | 'partial' | 'failed' | 'noop';
	results: WriteResult[];
	finishedAt: number;
}

function upsertPublished(graphId: string, put: PlannedPut, uri: string, cid: string | undefined) {
	db.prepare(
		`INSERT INTO published_records (graph_id, collection, rkey, uri, cid, record, content_hash, published_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(graph_id, collection, rkey) DO UPDATE SET
		   uri = excluded.uri, cid = excluded.cid, record = excluded.record,
		   content_hash = excluded.content_hash, published_at = excluded.published_at`
	).run(graphId, put.collection, put.rkey, uri, cid ?? null, JSON.stringify(put.record), put.hash, Date.now());
}

function saveOutcome(graphId: string, outcome: ReleaseOutcome) {
	setMeta(`publish_release:${graphId}`, JSON.stringify(outcome));
}

export function lastReleaseOutcome(graphId: string): ReleaseOutcome | null {
	const raw = getMeta(`publish_release:${graphId}`);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as ReleaseOutcome;
	} catch {
		return null;
	}
}

/** Write a planned release to the PDS. Records land one at a time with the
 *  garden manifest last, so an interrupted release leaves the old manifest
 *  intact and a re-run publishes only what is still missing. */
export async function executeRelease(plan: ReleasePlan, writer: RepoWriter): Promise<ReleaseOutcome> {
	if (!plan.puts.length && !plan.deletes.length) {
		const outcome: ReleaseOutcome = { status: 'noop', results: [], finishedAt: Date.now() };
		saveOutcome(plan.graphId, outcome);
		return outcome;
	}
	const results: WriteResult[] = [];
	let failed = false;

	const gardenPut = plan.puts.find((p) => p.kind === 'garden');
	const contentPuts = plan.puts.filter((p) => p.kind !== 'garden');

	for (const put of contentPuts) {
		try {
			const res = await writer.putRecord(put.collection, put.rkey, put.record);
			upsertPublished(plan.graphId, put, res.uri, res.cid);
			results.push({ action: 'put', ...pick(put), ok: true });
		} catch (error) {
			failed = true;
			results.push({ action: 'put', ...pick(put), ok: false, error: message(error) });
		}
	}

	// The manifest only advances over a complete set of writes; deletions wait
	// for the new manifest so the old release never dangles.
	if (gardenPut) {
		if (failed) {
			results.push({
				action: 'put',
				...pick(gardenPut),
				ok: false,
				error: 'Skipped: earlier writes failed, so the release manifest was not advanced. Publish again to retry.'
			});
		} else {
			try {
				const res = await writer.putRecord(gardenPut.collection, gardenPut.rkey, gardenPut.record);
				upsertPublished(plan.graphId, gardenPut, res.uri, res.cid);
				results.push({ action: 'put', ...pick(gardenPut), ok: true });
			} catch (error) {
				failed = true;
				results.push({ action: 'put', ...pick(gardenPut), ok: false, error: message(error) });
			}
		}
	}

	for (const del of plan.deletes) {
		if (failed) {
			results.push({
				action: 'delete',
				collection: del.collection,
				rkey: del.rkey,
				kind: del.kind,
				label: del.label,
				ok: false,
				error: 'Skipped until the release manifest advances. Publish again to retry.'
			});
			continue;
		}
		try {
			await writer.deleteRecord(del.collection, del.rkey);
			db.prepare('DELETE FROM published_records WHERE graph_id = ? AND collection = ? AND rkey = ?').run(
				plan.graphId,
				del.collection,
				del.rkey
			);
			results.push({ action: 'delete', collection: del.collection, rkey: del.rkey, kind: del.kind, label: del.label, ok: true });
		} catch (error) {
			results.push({
				action: 'delete',
				collection: del.collection,
				rkey: del.rkey,
				kind: del.kind,
				label: del.label,
				ok: false,
				error: message(error)
			});
		}
	}

	const okCount = results.filter((r) => r.ok).length;
	const outcome: ReleaseOutcome = {
		status: okCount === results.length ? 'complete' : okCount > 0 ? 'partial' : 'failed',
		results,
		finishedAt: Date.now()
	};
	saveOutcome(plan.graphId, outcome);
	return outcome;
}

/** Withdraw the whole garden: the front door comes down first, then every
 *  record. Third-party copies cannot be recalled; this removes what Trellis
 *  hosts under the account. */
export async function withdrawGarden(graphId: string, writer: RepoWriter): Promise<ReleaseOutcome> {
	const rows = [...publishedRows(graphId).values()];
	const ordered = [
		...rows.filter((r) => r.collection === COLLECTIONS.garden),
		...rows.filter((r) => r.collection !== COLLECTIONS.garden)
	];
	const results: WriteResult[] = [];
	for (const row of ordered) {
		const kind = (Object.entries(COLLECTIONS).find(([, c]) => c === row.collection)?.[0] ??
			'thought') as RecordKind;
		try {
			await writer.deleteRecord(row.collection, row.rkey);
			db.prepare('DELETE FROM published_records WHERE graph_id = ? AND collection = ? AND rkey = ?').run(
				graphId,
				row.collection,
				row.rkey
			);
			results.push({ action: 'delete', collection: row.collection, rkey: row.rkey, kind, label: `${kind} ${row.rkey}`, ok: true });
		} catch (error) {
			results.push({
				action: 'delete',
				collection: row.collection,
				rkey: row.rkey,
				kind,
				label: `${kind} ${row.rkey}`,
				ok: false,
				error: message(error)
			});
		}
	}
	const okCount = results.filter((r) => r.ok).length;
	const outcome: ReleaseOutcome = {
		status: results.length === 0 || okCount === results.length ? 'complete' : okCount > 0 ? 'partial' : 'failed',
		results,
		finishedAt: Date.now()
	};
	saveOutcome(graphId, outcome);
	return outcome;
}

/** Live counts for the status panel. */
export function liveCounts(graphId: string) {
	const rows = db
		.prepare('SELECT collection, COUNT(*) AS n, MAX(published_at) AS last FROM published_records WHERE graph_id = ? GROUP BY collection')
		.all(graphId) as { collection: string; n: number; last: number }[];
	const count = (c: string) => rows.find((r) => r.collection === c)?.n ?? 0;
	return {
		garden: count(COLLECTIONS.garden) > 0,
		thoughts: count(COLLECTIONS.thought),
		revisions: count(COLLECTIONS.revision),
		relations: count(COLLECTIONS.relation),
		treatments: count(COLLECTIONS.treatment),
		lastPublishedAt: rows.length ? Math.max(...rows.map((r) => r.last)) : null
	};
}

const pick = (p: PlannedPut) => ({ collection: p.collection, rkey: p.rkey, kind: p.kind, label: p.label });
const message = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error.');
