import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.TRELLIS_DB = ':memory:';
process.env.TRELLIS_AGENT = 'fixture';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const store = await server.ssrLoadModule('/src/lib/server/store.ts');
const { proseBlocks, proseParts } = await server.ssrLoadModule('/src/lib/prose-format.ts');
const { POST } = await server.ssrLoadModule('/src/routes/api/prose/+server.ts');
const treatments = (groupId) => store.getProseTreatments(groupId);

test('prose keeps a draft history per group/style and cites only group thoughts', async () => {
	const state = store.getState();
	const [first, second] = Object.keys(state.thoughts);
	assert.equal(store.createWorkingSet('Prose test', [first]), null);
	const group = store.getState().activeWorkingSetId;
	for (const style of ['overview', 'paper', 'blog', 'polemic']) {
		const result = await store.generateProse(group, style, { provider: 'fixture', model: '' });
		assert(!result.error, result.error);
		assert.deepEqual(result.treatment.sourceThoughtIds, [first]);
		assert(!result.treatment.body.includes(`[[${second}]]`));
	}
	assert.equal(treatments(group).length, 4);
	const again = await store.generateProse(group, 'overview', { provider: 'fixture', model: '' });
	assert(!again.error);
	const overviews = treatments(group).filter((p) => p.style === 'overview');
	assert.equal(overviews.length, 2, 'generating again appends to the slot history');
	assert.equal(overviews[0].id, again.treatment.id, 'the newest draft comes first');
});

test('draft history lists newest first and deleting prunes one draft', async () => {
	assert.equal(store.createWorkingSet('History prose', [Object.keys(store.getState().thoughts)[0]]), null);
	const group = store.getState().activeWorkingSetId;
	const fixture = { provider: 'fixture', model: '' };
	const first = await store.generateProse(group, 'overview', fixture);
	const second = await store.generateProse(group, 'overview', fixture);
	assert(!first.error && !second.error);
	// Fixture drafts can share a generated_at millisecond; order must still hold.
	assert.deepEqual(treatments(group).map((item) => item.id), [second.treatment.id, first.treatment.id]);
	const listed = store.listProseDrafts().filter((item) => item.workingSetId === group);
	assert.deepEqual(listed.map((item) => item.id), [second.treatment.id, first.treatment.id]);
	assert.equal(store.deleteProseDraft('missing'), 'Unknown draft.');
	assert.equal(store.deleteProseDraft(first.treatment.id), null);
	assert.deepEqual(treatments(group).map((item) => item.id), [second.treatment.id]);
	const deleted = await POST({ request: new Request('http://localhost/api/prose', { method: 'POST', body: JSON.stringify({ action: 'delete', draftId: second.treatment.id }) }) });
	assert.equal(deleted.status, 200);
	assert.equal(treatments(group).length, 0);
	const missing = await POST({ request: new Request('http://localhost/api/prose', { method: 'POST', body: JSON.stringify({ action: 'delete', draftId: second.treatment.id }) }) });
	assert.equal(missing.status, 404);
});

test('prose reports stale source and cleans up with its group', async () => {
	const state = store.getState();
	const id = Object.keys(state.thoughts)[0];
	assert.equal(store.createWorkingSet('Stale prose', [id]), null);
	const group = store.getState().activeWorkingSetId;
	assert(!(await store.generateProse(group, 'overview', { provider: 'fixture', model: '' })).error);
	assert.equal(store.reviseThought(id, { title: 'Changed source', statement: state.thoughts[id].statement, status: state.thoughts[id].status }), null);
	assert.equal(treatments(group)[0].stale, true);
	assert.equal(store.deleteWorkingSet(group), null);
	assert.equal(treatments(group).length, 0);
});

test('prose remains graph isolated and export includes its persisted rows', async () => {
	const firstGraph = store.getState().activeGraphId;
	const thought = Object.keys(store.getState().thoughts)[0];
	assert.equal(store.createWorkingSet('Export prose', [thought]), null);
	const group = store.getState().activeWorkingSetId;
	assert(!(await store.generateProse(group, 'blog', { provider: 'fixture', model: '' })).error);
	assert.equal(store.exportState().prose_treatments.length > 0, true);
	assert.equal(store.createGraph('Other prose graph'), null);
	assert.equal(store.getProseTreatments(group).length, 0);
	assert.match((await store.generateProse(group, 'overview', { provider: 'fixture', model: '' })).error, /Unknown group/);
	assert.equal(store.switchGraph(firstGraph), null);
	assert.equal(store.getProseTreatments(group).length, 1);
});

test('undoing an applied proposal preserves a treatment for a surviving group', async () => {
	const thought = Object.keys(store.getState().thoughts)[0];
	assert.equal(store.createWorkingSet('Undo prose', [thought]), null);
	const group = store.getState().activeWorkingSetId;
	assert(!(await store.generateProse(group, 'paper', { provider: 'fixture', model: '' })).error);
	const invoked = await store.invoke('develop', [thought], undefined, { provider: 'fixture', model: '' });
	assert(!invoked.error, invoked.error);
	let changeSet = store.getState().pendingChangeSets.find((set) => set.id === invoked.changeSetId);
	for (const operation of changeSet.operations) assert.equal(store.decide(changeSet.id, operation.id, 'accepted'), null);
	changeSet = store.getState().pendingChangeSets.find((set) => set.id === invoked.changeSetId);
	const positions = Object.fromEntries(changeSet.operations.filter((operation) => operation.payload.op === 'create_thought').map((operation, index) => [operation.clientRef, { x: 900, y: 300 + index * 140 }]));
	assert(!store.applyChangeSet(changeSet.id, positions).error);
	const { db } = await server.ssrLoadModule('/src/lib/server/db.ts');
	const snapshot = JSON.parse(db.prepare('SELECT value FROM meta WHERE key = ?').get(`undo_snapshot:${store.getState().activeGraphId}`).value);
	assert.deepEqual(snapshot.prose_treatments, [], 'undo does not duplicate derived draft bodies');
	assert.equal(store.undoLast().kind, 'apply');
	assert.equal(treatments(group).length, 1);
});

test('format parser recognizes headings and keeps thought tokens as plain parts', () => {
	assert.deepEqual(proseBlocks('# Title\n\n## Section\n\nBody'), [
		{ kind: 'h1', text: 'Title' }, { kind: 'h2', text: 'Section' }, { kind: 'p', text: 'Body' }
	]);
	assert.deepEqual(proseParts('See [[t-1]] now'), ['See ', '[[t-1]]', ' now']);
});

test('prose endpoint rejects malformed requests before generation', async () => {
	let response = await POST({ request: new Request('http://localhost/api/prose', { method: 'POST', body: '{}' }) });
	assert.equal(response.status, 400);
	response = await POST({ request: new Request('http://localhost/api/prose', { method: 'POST', body: JSON.stringify({ workingSetId: 'missing', style: 'overview', selection: { provider: 'bad', model: '' } }) }) });
	assert.equal(response.status, 400);
});

test('in-flight generations retain their source snapshot and latest request wins', async () => {
	const [first, second] = Object.keys(store.getState().thoughts);
	store.createWorkingSet('Concurrent prose', [first]);
	const group = store.getState().activeWorkingSetId;
	const fixture = { provider: 'fixture', model: '' };
	const pending = store.generateProse(group, 'overview', fixture);
	store.addToWorkingSet([second]);
	const result = await pending;
	assert(!result.error, result.error);
	assert.deepEqual(result.treatment.sourceThoughtIds, [first]);
	assert.equal(result.treatment.stale, true);
	const older = store.generateProse(group, 'blog', fixture);
	const newer = store.generateProse(group, 'blog', fixture);
	assert.match((await older).error, /newer prose request/);
	const latest = await newer;
	assert.equal(treatments(group).find((item) => item.style === 'blog').id, latest.treatment.id);
});

test('pending generation saves in the original graph and discards deleted groups', async () => {
	const originalGraph = store.getState().activeGraphId;
	store.createWorkingSet('Graph race', [Object.keys(store.getState().thoughts)[0]]);
	const group = store.getState().activeWorkingSetId;
	const pending = store.generateProse(group, 'overview', { provider: 'fixture', model: '' });
	store.createGraph('Switch while writing');
	const result = await pending;
	assert(!result.error, result.error);
	assert.equal(result.treatment.graphId, originalGraph);
	assert.equal(treatments(group).length, 0);
	store.switchGraph(originalGraph);
	assert.equal(treatments(group).length, 1);
	const removed = store.generateProse(group, 'paper', { provider: 'fixture', model: '' });
	store.deleteWorkingSet(group);
	assert.match((await removed).error, /removed/);
	assert.equal(store.exportState().prose_treatments.some((item) => item.working_set_id === group), false);
});

test('client graph switches release busy state and ignore old generation responses', async () => {
	const { workspace } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	const state = store.getState();
	workspace.applyState(state);
	const originalFetch = globalThis.fetch;
	let finish;
	globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
	try {
		const pending = workspace.generateProse('old-group', 'overview');
		assert.equal(workspace.proseGenerating, true);
		workspace.applyState({ ...state, activeGraphId: 'another-graph' });
		assert.equal(workspace.proseGenerating, false);
		finish(Response.json({ treatment: { graphId: state.activeGraphId, workingSetId: 'old-group', style: 'overview' } }));
		await pending;
		assert.deepEqual(workspace.prose, []);
		assert.equal(workspace.activeGraphId, 'another-graph');
	} finally { globalThis.fetch = originalFetch; }
});

test('saved drafts load only through scoped endpoint, with escaped parser text', async () => {
	const { GET } = await server.ssrLoadModule('/src/routes/api/prose/+server.ts');
	store.createWorkingSet('Scoped loading', [Object.keys(store.getState().thoughts)[0]]);
	const group = store.getState().activeWorkingSetId;
	await store.generateProse(group, 'overview', { provider: 'fixture', model: '' });
	assert.equal('prose' in store.getState(), false);
	const response = await GET({ url: new URL(`http://localhost/api/prose?workingSetId=${group}`) });
	assert.equal(response.status, 200);
	assert.equal((await response.json()).treatments.length, 1);
	assert.equal((await GET({ url: new URL('http://localhost/api/prose?workingSetId=unknown') })).status, 404);
	assert.deepEqual(proseBlocks('# Heading\r\n<script>alert(1)</script>\n## Next\nText'), [
		{ kind: 'h1', text: 'Heading' }, { kind: 'p', text: '<script>alert(1)</script>' },
		{ kind: 'h2', text: 'Next' }, { kind: 'p', text: 'Text' }
	]);
});

test('prose rendering escapes model text and renders references in headings and paragraphs', async () => {
	const { render } = await server.ssrLoadModule('svelte/server');
	const { default: Prose } = await server.ssrLoadModule('/src/lib/components/Prose.svelte');
	const { workspace } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	workspace.applyState(store.getState());
	const group = workspace.activeWorkingSetId;
	const thought = workspace.workingSets.find((item) => item.id === group).members[0];
	workspace.prose = [{
		id: 'render-test', graphId: workspace.activeGraphId, workingSetId: group, style: 'overview',
		title: 'Rendering test', body: `# Source [[the central claim|${thought}]]\n<script>alert(1)</script> [the practical implication](<${thought}>) [[missing]]`,
		model: 'fixture:fixture', generatedAt: Date.now(), sourceThoughtIds: [thought], stale: false
	}];
	workspace.proseDrafts = workspace.prose.map(({ id, workingSetId, style, title, generatedAt }) => ({ id, workingSetId, style, title, generatedAt }));
	const { body } = render(Prose);
	assert(!body.includes('<script>alert(1)</script>'));
	assert.match(body, /&lt;script(?:>|&gt;)/);
	assert.equal((body.match(/title="Inspect thought:/g) ?? []).length, 2);
	assert.match(body, /\[\[missing\]\]/);
	assert.match(body, />the central claim<\/button>/);
	assert.match(body, />the practical implication<\/button>/);
	assert.match(body, /Open a saved draft/);
	assert.match(body, /Writing guidance/);
});


test('guidance persists with drafts and the graph index allows reopening without bodies', async () => {
	const { GET } = await server.ssrLoadModule('/src/routes/api/prose/+server.ts');
	store.createWorkingSet('Guided prose', [Object.keys(store.getState().thoughts)[0]]);
	const group = store.getState().activeWorkingSetId;
	const result = await store.generateProse(group, 'blog', { provider: 'fixture', model: '' }, 'Focus on practical implications.');
	assert(!result.error, result.error);
	assert.equal(store.getProseTreatments(group)[0].guidance, 'Focus on practical implications.');
	const response = await GET({ url: new URL('http://localhost/api/prose?list=1') });
	const { drafts } = await response.json();
	assert(drafts.some((draft) => draft.id === result.treatment.id && draft.workingSetId === group));
	assert(drafts.every((draft) => !('body' in draft)));
	for (const guidance of [42, 'x'.repeat(2001)]) {
		const response = await POST({ request: new Request('http://localhost/api/prose', { method: 'POST', body: JSON.stringify({ workingSetId: group, style: 'blog', selection: { provider: 'fixture', model: '' }, guidance }) }) });
		assert.equal(response.status, 400);
	}
});

test('descriptive references parse safely in both formats while preserving legacy links', async () => {
	const { parseProseReference } = await server.ssrLoadModule('/src/lib/prose-format.ts');
	assert.deepEqual(parseProseReference('[[the central claim|t-1]]'), { thoughtId: 't-1', label: 'the central claim' });
	assert.deepEqual(parseProseReference('[the central claim](<t-1>)'), { thoughtId: 't-1', label: 'the central claim' });
	assert.deepEqual(parseProseReference('[[t-1]]'), { thoughtId: 't-1' });
	assert.equal(parseProseReference('[[a\nb|t-1]]'), null);
	assert.equal(parseProseReference('[bad](<javascript:alert(1)>)'), null);
	assert.deepEqual(proseParts('See [[this|t-1]] and [that](<t-2>).'), ['See ', '[[this|t-1]]', ' and ', '[that](<t-2>)', '.']);
});

test('generation completion preserves concurrent saved-draft and index loads', async () => {
	const { workspace } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	const state = store.getState();
	workspace.applyState(state);
	workspace.prose = [];
	workspace.proseDrafts = [];
	const [groupA, groupB] = state.workingSets;
	const saved = { id: 'saved-b', graphId: state.activeGraphId, workingSetId: groupB.id, style: 'paper', title: 'Saved paper', generatedAt: 1 };
	const generated = { id: 'new-a', graphId: state.activeGraphId, workingSetId: groupA.id, style: 'overview', title: 'New overview', generatedAt: 2 };
	const originalFetch = globalThis.fetch;
	const pending = new Map();
	globalThis.fetch = (url) => new Promise((resolve) => pending.set(url, resolve));
	try {
		const generation = workspace.generateProse(groupA.id, 'overview', 'Focus on consequences');
		const loading = workspace.loadProse(groupB.id);
		const listing = workspace.loadProseDrafts();
		pending.get('/api/prose')(Response.json({ treatment: generated }));
		await generation;
		pending.get(`/api/prose?workingSetId=${groupB.id}`)(Response.json({ graphId: state.activeGraphId, workingSetId: groupB.id, treatments: [saved] }));
		pending.get('/api/prose?list=1')(Response.json({ graphId: state.activeGraphId, drafts: [saved] }));
		await Promise.all([loading, listing]);
		assert(workspace.prose.some((draft) => draft.id === saved.id));
		assert(workspace.prose.some((draft) => draft.id === generated.id));
		assert.deepEqual(new Set(workspace.proseDrafts.map((draft) => draft.id)), new Set([saved.id, generated.id]));
		workspace.applyState({ ...state, workingSets: state.workingSets.filter((group) => group.id !== groupB.id) });
		assert(!workspace.proseDrafts.some((draft) => draft.id === saved.id));
	} finally { globalThis.fetch = originalFetch; }
});
