import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.TRELLIS_DB = ':memory:';
process.env.TRELLIS_AGENT = 'fixture';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const store = await server.ssrLoadModule('/src/lib/server/store.ts');
const { db } = await server.ssrLoadModule('/src/lib/server/db.ts');
const release = await server.ssrLoadModule('/src/lib/server/publish/release.ts');
const xrpc = await server.ssrLoadModule('/src/lib/server/publish/xrpc.ts');
const lex = await server.ssrLoadModule('/src/lib/garden/lexicon.ts');

const did = 'did:plc:releasetest1234';
const session = { service: 'https://pds.test', did, handle: 'me.test', accessJwt: 'jwt' };
const writer = (fetchImpl) => xrpc.passwordWriter(session, fetchImpl);
// A garden is the whole graph, so the scene needs a graph of its own — the
// seeded starter graph would publish with it.
assert.equal(store.createGraph('Release test'), null);
const graphId = store.getState().activeGraphId;

// A fake PDS: records every XRPC call and answers like the real thing.
const calls = [];
const jsonResponse = (value, status = 200) =>
	new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const okFetch = async (url, init) => {
	const body = init?.body ? JSON.parse(init.body) : null;
	calls.push({ url: String(url), body });
	if (String(url).includes('putRecord'))
		return jsonResponse({ uri: `at://${body.repo}/${body.collection}/${body.rkey}`, cid: 'cid-1' });
	return jsonResponse({});
};

/** The publication boundary, stated as the exact keys each record may carry. */
const ALLOWED_KEYS = {
	thought: ['$type', 'thoughtType', 'status', 'title', 'statement', 'confidence', 'source', 'currentRevision', 'createdAt', 'firstPublishedAt'],
	revision: ['$type', 'thought', 'prev', 'title', 'statement', 'status', 'confidence', 'source', 'authorship', 'changeNote', 'createdAt', 'publishedAt'],
	relation: ['$type', 'from', 'to', 'fromRevision', 'toRevision', 'relationType', 'createdBy', 'createdAt', 'publishedAt'],
	treatment: ['$type', 'title', 'body', 'style', 'agentAuthored', 'model', 'sourceRevisions', 'generatedAt', 'publishedAt'],
	garden: ['$type', 'title', 'summary', 'pinned', 'treatment', 'release', 'createdAt']
};

function assertBoundary(plan) {
	for (const put of plan.puts) {
		for (const key of Object.keys(put.record))
			assert(ALLOWED_KEYS[put.kind].includes(key), `${put.kind} record leaks field "${key}"`);
	}
}

// The scene: three thoughts, two relations, a pin, and a group that holds
// only two of the thoughts — the release covers the graph, not the group.
const a = store.createThought({ title: 'Claim A', statement: 'The starting position.', type: 'claim', status: 'believed', x: 0, y: 0 }).thoughtId;
const b = store.createThought({ title: 'Prediction B', statement: 'Something will happen.', type: 'prediction', status: 'tentative', x: 200, y: 0 }).thoughtId;
const c = store.createThought({ title: 'Claim C', statement: 'In no group at all.', type: 'claim', status: 'tentative', x: 400, y: 0 }).thoughtId;
assert.equal(store.reviseThought(b, { title: 'Prediction B', statement: 'Something will happen.', status: 'tentative', confidence: { probability: 0.7, resolveBy: '2027-06-01' } }), null);
const relation = db.prepare("INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, graph_id, created_at) VALUES (?, ?, ?, 'supports', 'human', ?, ?)");
relation.run('r-pub1', b, a, graphId, Date.now());
relation.run('r-pub2', c, a, graphId, Date.now());
assert.equal(store.createWorkingSet('Public', [a, b]), null);
const ws = store.getState().activeWorkingSetId;
assert.equal(store.setPinned(a, true), null);

const config = { key: 'test-garden', treatmentId: null, title: 'Test Garden', summary: 'An intro in my own words.' };

test('the first release publishes the whole graph and nothing else', async () => {
	const plan = release.buildReleasePlan(graphId, config, did);
	assertBoundary(plan);
	assert.deepEqual(
		plan.puts.map((p) => p.kind).sort(),
		['garden', 'relation', 'relation', 'revision', 'revision', 'revision', 'thought', 'thought', 'thought']
	);
	assert.equal(plan.deletes.length, 0);
	assert.equal(plan.newThoughts.length, 3);
	assert.equal(plan.changedThoughts.length, 0);
	// Groups organize local work; they never carve up the garden.
	assert(plan.puts.some((p) => p.kind === 'thought' && p.rkey === c), 'a thought in no group publishes too');

	const garden = plan.puts.find((p) => p.kind === 'garden').record;
	assert.equal(garden.title, 'Test Garden');
	assert.deepEqual(garden.pinned, [lex.atUri(did, lex.COLLECTIONS.thought, a)]);
	assert.equal(garden.release.thoughts.length, 3);
	assert.equal(garden.release.revisions.length, 3);
	assert.equal(garden.release.relations.length, 2);

	// Floats never reach the record: confidence travels as decimal strings.
	const thoughtB = plan.puts.find((p) => p.kind === 'thought' && p.rkey === b).record;
	assert.deepEqual(thoughtB.confidence, { probability: '0.7', resolveBy: '2027-06-01' });

	const outcome = await release.executeRelease(plan, writer(okFetch));
	assert.equal(outcome.status, 'complete');
	assert.equal(outcome.results.filter((r) => r.ok).length, 9);
	// The manifest advances last, so readers never see a half release.
	const putCalls = calls.filter((call) => call.url.includes('putRecord'));
	assert.equal(putCalls.at(-1).body.collection, lex.COLLECTIONS.garden);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM published_records WHERE graph_id = ?').get(graphId).n, 9);
});

test('an unchanged garden has nothing to publish', async () => {
	const plan = release.buildReleasePlan(graphId, config, did);
	assert.equal(plan.puts.length, 0);
	assert.equal(plan.deletes.length, 0);
	const outcome = await release.executeRelease(plan, writer(okFetch));
	assert.equal(outcome.status, 'noop');
});

test('a local edit becomes one public revision with prev, authorship, and the change note', async () => {
	assert.equal(store.reviseThought(a, { title: 'Claim A', statement: 'The revised position.', status: 'contested' }), null);
	const plan = release.buildReleasePlan(graphId, config, did, { [a]: 'A reader pointed at counter-evidence.' });
	assertBoundary(plan);
	assert.deepEqual(plan.puts.map((p) => p.kind).sort(), ['garden', 'revision', 'thought']);
	assert.deepEqual(plan.changedThoughts.map((c) => c.thoughtId), [a]);
	assert(plan.changedThoughts[0].changes.includes('statement'));
	assert(plan.changedThoughts[0].changes.includes('status: believed → contested'));

	const revision = plan.puts.find((p) => p.kind === 'revision').record;
	assert.equal(revision.changeNote, 'A reader pointed at counter-evidence.');
	assert.equal(revision.authorship.actor, 'human');
	assert(revision.prev, 'links the revision it replaces');
	const thought = plan.puts.find((p) => p.kind === 'thought').record;
	assert.equal(thought.currentRevision, lex.atUri(did, lex.COLLECTIONS.revision, plan.puts.find((p) => p.kind === 'revision').rkey));

	const outcome = await release.executeRelease(plan, writer(okFetch));
	assert.equal(outcome.status, 'complete');
	// The superseded public revision is retained, not replaced.
	assert.equal(db.prepare("SELECT COUNT(*) AS n FROM published_records WHERE graph_id = ? AND collection = ?").get(graphId, lex.COLLECTIONS.revision).n, 4);
});

test('deleting a thought withdraws it, its history, and its relations', async () => {
	assert.equal(store.deleteThoughts([c]).deleted, 1);
	const plan = release.buildReleasePlan(graphId, config, did);
	assert.deepEqual(plan.deletes.map((d) => d.kind).sort(), ['relation', 'revision', 'thought']);
	assert.deepEqual(plan.puts.map((p) => p.kind), ['garden']);
	const outcome = await release.executeRelease(plan, writer(okFetch));
	assert.equal(outcome.status, 'complete');
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM published_records WHERE graph_id = ?').get(graphId).n, 7);
});

test('a failed write leaves the manifest alone and the next publish retries only the gap', async () => {
	assert.equal(store.reviseThought(b, { title: 'Prediction B', statement: 'Something will happen, sharpened.', status: 'tentative', confidence: { probability: 0.7, resolveBy: '2027-06-01' } }), null);
	const failing = async (url, init) => {
		const body = init?.body ? JSON.parse(init.body) : null;
		if (String(url).includes('putRecord') && body.collection === lex.COLLECTIONS.thought && body.rkey === b)
			return jsonResponse({ error: 'InternalError', message: 'the PDS hiccuped' }, 500);
		return okFetch(url, init);
	};
	const plan = release.buildReleasePlan(graphId, config, did);
	const outcome = await release.executeRelease(plan, writer(failing));
	assert.equal(outcome.status, 'partial');
	const gardenResult = outcome.results.find((r) => r.kind === 'garden');
	assert.equal(gardenResult.ok, false);
	assert.match(gardenResult.error, /Skipped/);

	const retry = release.buildReleasePlan(graphId, config, did);
	const kinds = retry.puts.map((p) => p.kind).sort();
	assert.deepEqual(kinds, ['garden', 'thought'], 'only the failed record and the manifest remain');
	const retryOutcome = await release.executeRelease(retry, writer(okFetch));
	assert.equal(retryOutcome.status, 'complete');
});

test('an approved essay publishes without its writing guidance; a stale draft is refused', async () => {
	const guidance = 'private-writing-direction-never-published';
	const generated = await store.generateProse(ws, 'overview', { provider: 'fixture', model: '' }, guidance);
	assert(!generated.error, generated.error);
	const withEssay = { ...config, treatmentId: generated.treatment.id };

	const plan = release.buildReleasePlan(graphId, withEssay, did);
	assertBoundary(plan);
	const treatment = plan.puts.find((p) => p.kind === 'treatment');
	assert(treatment, 'the essay is part of the release');
	assert.equal(treatment.record.agentAuthored, true);
	assert(!JSON.stringify(plan.puts.map((p) => p.record)).includes(guidance), 'guidance stays local');
	const garden = plan.puts.find((p) => p.kind === 'garden').record;
	assert.equal(garden.treatment, lex.atUri(did, lex.COLLECTIONS.treatment, generated.treatment.id));
	assert.equal(treatment.record.sourceRevisions.length, generated.treatment.sourceThoughtIds.length);
	const outcome = await release.executeRelease(plan, writer(okFetch));
	assert.equal(outcome.status, 'complete');

	// A never-published draft that no longer matches its sources cannot go out.
	assert.equal(store.reviseThought(a, { title: 'Claim A', statement: 'Moved on again.', status: 'contested' }), null);
	const newDraft = await store.generateProse(ws, 'blog', { provider: 'fixture', model: '' });
	assert(!newDraft.error);
	assert.equal(store.reviseThought(a, { title: 'Claim A', statement: 'Moved on once more.', status: 'contested' }), null);
	assert.throws(
		() => release.buildReleasePlan(graphId, { ...config, treatmentId: newDraft.treatment.id }, did),
		/no longer matches/
	);

	// The already-published essay keeps publishing (it goes visibly stale for
	// readers instead of blocking thought updates).
	const stillFine = release.buildReleasePlan(graphId, withEssay, did, { [a]: '' });
	assert(stillFine.warnings.some((w) => w.includes('essay')), 'the author is told readers see it as stale');
	const followUp = await release.executeRelease(stillFine, writer(okFetch));
	assert.equal(followUp.status, 'complete');
});

test('a second graph publishes its own garden beside the first', async () => {
	// The repo holds one garden record per published graph; a release touches
	// only the records of the graph it was built from.
	assert.equal(store.createGraph('Second graph'), null);
	const second = store.getState().activeGraphId;
	const only = store.createThought({ title: 'Claim S', statement: 'From the other graph.', type: 'claim', status: 'believed', x: 0, y: 0 }).thoughtId;
	const secondConfig = { key: 'second-garden', treatmentId: null, title: 'Second Garden', summary: '' };

	const plan = release.buildReleasePlan(second, secondConfig, did);
	assert.deepEqual(plan.puts.map((p) => p.kind).sort(), ['garden', 'revision', 'thought']);
	assert.equal(plan.deletes.length, 0, 'the first garden is not withdrawn by a second one');
	assert.equal(await release.executeRelease(plan, writer(okFetch)).then((o) => o.status), 'complete');

	const gardens = release.liveGardens();
	assert.deepEqual(gardens.map((g) => g.key).sort(), ['second-garden', 'test-garden']);
	assert.deepEqual(gardens.map((g) => g.title).sort(), ['Second Garden', 'Test Garden']);

	// Republishing the first graph leaves the second one exactly where it is.
	const first = release.buildReleasePlan(graphId, config, did);
	const foreign = (r) => r.rkey === 'second-garden' || r.rkey === only;
	assert(!first.deletes.some(foreign), 'the second garden is never swept up as "no longer included"');
	assert(!first.puts.some(foreign));

	// Two gardens may not share an address, or a record key.
	assert.throws(() => release.buildReleasePlan(second, { ...secondConfig, key: 'test-garden' }, did), /already belongs/);
	assert.throws(() => release.buildReleasePlan(second, { ...secondConfig, key: 'Not A Slug' }, did), /garden address/);
	db.prepare(
		"INSERT INTO published_records (graph_id, collection, rkey, uri, cid, record, content_hash, published_at) VALUES (?, ?, ?, '', NULL, '{}', 'h', 0)"
	).run(graphId, lex.COLLECTIONS.thought, only);
	assert.throws(() => release.buildReleasePlan(second, secondConfig, did), /would overwrite/);
	db.prepare('DELETE FROM published_records WHERE graph_id = ? AND collection = ? AND rkey = ?').run(graphId, lex.COLLECTIONS.thought, only);
});

test('withdrawing the garden deletes the front door first, then everything', async () => {
	calls.length = 0;
	const outcome = await release.withdrawGarden(graphId, writer(okFetch));
	assert.equal(outcome.status, 'complete');
	const deletions = calls.filter((call) => call.url.includes('deleteRecord'));
	assert.equal(deletions[0].body.collection, lex.COLLECTIONS.garden);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM published_records WHERE graph_id = ?').get(graphId).n, 0);
	// Only this graph's garden comes down; the other one is still live.
	assert.deepEqual(release.liveGardens().map((g) => g.key), ['second-garden']);
});
