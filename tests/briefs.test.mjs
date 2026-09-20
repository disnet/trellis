import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.TRELLIS_DB = ':memory:';
process.env.TRELLIS_AGENT = 'fixture';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const store = await server.ssrLoadModule('/src/lib/server/store.ts');
const briefs = await server.ssrLoadModule('/src/lib/server/briefs.ts');
const chat = await server.ssrLoadModule('/src/lib/server/conversations.ts');
const { db } = await server.ssrLoadModule('/src/lib/server/db.ts');
const { buildContext } = await server.ssrLoadModule('/src/lib/server/agent/context.ts');
const { buildUserPrompt } = await server.ssrLoadModule('/src/lib/server/agent/prompt.ts');
const { buildBriefContext } = await server.ssrLoadModule('/src/lib/server/agent/brief.ts');
const briefRoute = await server.ssrLoadModule('/src/routes/api/brief/+server.ts');
const runRoute = await server.ssrLoadModule('/src/routes/api/brief/run/+server.ts');
const fixture = { provider: 'fixture', model: '' };
const first = Object.keys(store.getState().thoughts)[0];
const post = (handler, body) => handler({ request: new Request('http://localhost/', { method: 'POST', body: JSON.stringify(body) }) });

test('a brief drafts over turns, discloses what it consulted, and never touches the graph', async () => {
	const before = store.getState();
	assert.equal(briefs.openBrief(), undefined);
	const seed = store.getState().thoughts[first];
	const opening = await briefs.sendBriefMessage(`I want to push on ${seed.title.toLowerCase()} — where does it break?`, 'brief-1', fixture);
	assert.deepEqual(store.getState(), before, 'a brief turn changes nothing canonical');
	assert.equal(opening.thoughtId, null);
	assert.equal(opening.operationId, null);
	assert.deepEqual(opening.messages.map(m => m.role), ['user', 'assistant']);
	assert.equal(opening.messages[1].model, 'fixture:fixture');
	assert(opening.messages[1].consulted.includes(first), 'relevance search names the thought the person alluded to');
	assert.equal(opening.brief.ready, false, 'one turn in, the agent still asks');
	assert.equal(opening.brief.action, 'develop');
	assert(opening.brief.thoughtIds.every(id => opening.messages[1].consulted.includes(id)), 'targets come only from disclosed context');
	assert.equal(briefs.openBrief().id, opening.id);
	const call = db.prepare("SELECT * FROM agent_calls WHERE action = 'brief' ORDER BY rowid DESC LIMIT 1").get();
	assert.equal(call.error, null);
	const request = JSON.parse(call.request);
	assert(request.thoughts.some(t => t.id === first && t.retrieved));
	assert.equal(request.graph.thoughtCount, Object.keys(before.thoughts).length);

	const followup = await briefs.sendBriefMessage('Objections mainly; keep it to two or three.', 'brief-2', fixture);
	assert.equal(followup.id, opening.id, 'one open brief per graph');
	assert.equal(followup.messages.length, 4);
	assert.equal(followup.brief.ready, true);
	assert.match(followup.brief.instruction, /two or three/);
	assert.equal(chat.conversationsForGraph().filter(c => !c.thoughtId && !c.operationId).length, 1);
	assert.equal(buildContext('develop', [first]).conversations.length, 0, 'briefs do not leak into thought-scoped operations');
});

test('retries are idempotent and the graph guard holds on the route', async () => {
	const brief = briefs.openBrief();
	await briefs.sendBriefMessage('Objections mainly; keep it to two or three.', 'brief-2', fixture);
	assert.equal(briefs.openBrief().messages.length, brief.messages.length);
	await assert.rejects(briefs.sendBriefMessage('Different text.', 'brief-2', fixture), /already saved/);
	const stale = await post(briefRoute.POST, { graphId: 'elsewhere', body: 'x', messageId: 'm', selection: fixture });
	assert.equal(stale.status, 409);
	const got = await briefRoute.GET({});
	assert.equal((await got.json()).brief.id, brief.id);
});

test('running the brief stages a change set from the edited card and retires the brief', async () => {
	const brief = briefs.openBrief();
	const edited = { ...brief.brief, action: 'challenge', instruction: 'Steelman the objections; skip anything about tooling.' };
	const before = store.getState().thoughts;
	const response = await post(runRoute.POST, { graphId: brief.graphId, brief: edited, selection: fixture });
	const data = await response.json();
	assert.equal(response.status, 200, data.error);
	assert.deepEqual(store.getState().thoughts, before, 'running only stages');
	assert.equal(data.brief, null, 'the brief is retired');
	assert.equal(briefs.openBrief(), undefined);
	const cs = store.getState().pendingChangeSets.find(c => c.id === data.changeSetId);
	assert.equal(cs.action, 'challenge', 'the person’s edit to the action is what ran');
	assert.deepEqual(cs.invokedOn, brief.brief.thoughtIds);
	assert(cs.conversationContext.some(c => c.id === brief.id), 'the transcript is recorded as provenance');
	const ran = chat.conversationsForGraph().find(c => c.id === brief.id);
	assert.equal(ran.changeSetId, cs.id);
	assert.equal(ran.brief.instruction, edited.instruction);
	const call = db.prepare('SELECT request FROM agent_calls WHERE change_set_id = ?').get(cs.id);
	assert.match(call.request, /Steelman the objections/, 'the instruction reaches the drafting operation');
	assert.equal(store.exportState().conversations.find(c => c.id === brief.id).changeSetId, cs.id);
	const rerun = await store.invoke('develop', [], undefined, fixture, undefined, brief.id);
	assert.match(rerun.error, /already run/);
});

test('a brief with no targets seeds from the discussion; targetless develop is refused', async () => {
	await briefs.sendBriefMessage('Entirely new topic: whether pricing experiments require a control cohort.', 'seed-1', fixture);
	await briefs.sendBriefMessage('Yes, begin from what I wrote.', 'seed-2', fixture);
	const open = briefs.openBrief();
	assert.equal(open.brief.action, 'decompose');
	assert.deepEqual(open.brief.thoughtIds, []);
	const refused = await store.runBrief({ ...open.brief, action: 'develop' }, fixture);
	assert.match(refused.error, /at least one thought/);
	assert.equal(briefs.openBrief().id, open.id, 'a refused run keeps the brief open');
	const invalid = await store.runBrief({ action: 'decompose' }, fixture);
	assert.match(invalid.error, /Invalid brief/);
	const result = await store.runBrief(open.brief, fixture);
	assert(!result.error, result.error);
	const cs = store.getState().pendingChangeSets.find(c => c.id === result.changeSetId);
	assert.equal(cs.action, 'decompose');
	assert.match(db.prepare('SELECT body FROM scratch_notes WHERE id = ?').get(cs.scratchId).body, /control cohort/);
	assert.equal(briefs.openBrief(), undefined);
});

test('the brief instruction is rendered into the operation prompt', () => {
	const context = buildContext('develop', [first]);
	context.instruction = 'Focus on the failure modes.';
	const prompt = buildUserPrompt('develop', context);
	assert.match(prompt, /Brief from the person/);
	assert.match(prompt, /Focus on the failure modes\./);
	assert.doesNotMatch(buildUserPrompt('develop', buildContext('develop', [first])), /Brief from the person/);
});

test('discarding forgets the open brief, and briefs are isolated per graph', async () => {
	const homeGraph = store.getState().activeGraphId;
	await briefs.sendBriefMessage('Throwaway thought.', 'discard-1', fixture);
	assert(briefs.openBrief());
	const deleted = await briefRoute.DELETE({ request: new Request('http://localhost/', { method: 'DELETE', body: JSON.stringify({ graphId: homeGraph }) }) });
	assert.equal((await deleted.json()).brief, null);
	assert.equal(briefs.openBrief(), undefined);
	await briefs.sendBriefMessage('Home graph brief.', 'iso-1', fixture);
	store.createGraph('Other');
	assert.equal(briefs.openBrief(), undefined, 'the new graph has no brief');
	assert.equal(buildBriefContext({ messages: [{ role: 'user', body: 'agency refuse' }] }, store.getState().activeGraphId).thoughts.length, 0, 'context never crosses graphs');
	await briefs.sendBriefMessage('Other graph brief.', 'iso-2', fixture);
	store.switchGraph(homeGraph);
	assert.equal(briefs.openBrief().title, 'Home graph brief.');
});

test('a failed reply keeps the person’s message for retry and blocks concurrent sends', async () => {
	briefs.discardBrief();
	let release;
	const waiting = new Promise(resolve => { release = resolve; });
	const task = briefs.sendBriefMessage('Keep this.', 'fail-1', fixture, async () => { await waiting; throw new Error('Provider unavailable'); });
	await new Promise(r => setTimeout(r, 0));
	await assert.rejects(briefs.sendBriefMessage('Another.', 'fail-2', fixture), /already in progress/);
	release();
	await assert.rejects(task, /Provider unavailable/);
	assert.equal(briefs.openBrief().messages.length, 1);
	assert.equal(briefs.openBrief().brief, null);
	await assert.rejects(briefs.sendBriefMessage('Skip ahead.', 'fail-3', fixture), /Retry the unanswered/);
	await briefs.sendBriefMessage('Keep this.', 'fail-1', fixture);
	assert.equal(briefs.openBrief().messages.length, 2);
});
