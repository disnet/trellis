import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.TRELLIS_DB = ':memory:';
process.env.TRELLIS_AGENT = 'fixture';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const store = await server.ssrLoadModule('/src/lib/server/store.ts');
const chat = await server.ssrLoadModule('/src/lib/server/conversations.ts');
const { db } = await server.ssrLoadModule('/src/lib/server/db.ts');
const { buildContext } = await server.ssrLoadModule('/src/lib/server/agent/context.ts');
const { buildUserPrompt } = await server.ssrLoadModule('/src/lib/server/agent/prompt.ts');
const { GET, POST } = await server.ssrLoadModule('/src/routes/api/conversations/+server.ts');
const fixture = { provider: 'fixture', model: '' };
const first = Object.keys(store.getState().thoughts)[0];

test('discussion persists attributed turns without touching graph or proposals; requests are idempotent', async () => {
	const before = store.getState();
	const conversation = await chat.sendMessage({ thoughtId: first }, 'By agency I mean the ability to refuse.', 'clarify-agency', fixture);
	assert.deepEqual(store.getState(), before);
	assert.deepEqual(conversation.messages.map(m => m.role), ['user', 'assistant']);
	assert.equal(conversation.messages[1].model, 'fixture:fixture');
	await chat.sendMessage({ thoughtId: first }, 'By agency I mean the ability to refuse.', 'clarify-agency', fixture);
	assert.equal(chat.getConversations({ thoughtId: first })[0].messages.length, 2);
	await chat.sendMessage({ thoughtId: first }, 'What would count as refusal?', 'followup-agency', fixture);
	assert.equal(chat.getConversations({ thoughtId: first })[0].messages.length, 4);
	const call = db.prepare("SELECT * FROM agent_calls WHERE action = 'chat' ORDER BY rowid DESC LIMIT 1").get();
	assert.equal(JSON.parse(call.request).conversation.messages.length, 3, 'follow-up receives the previous exchange');
	assert.equal(call.error, null);
	assert.equal(store.exportState().conversations[0].id, conversation.id);
	const response = await GET({ url: new URL(`http://localhost/api/conversations?thoughtId=${first}`) });
	assert.equal((await response.json()).conversations[0].messages.length, 4);
});

test('every operation includes scoped discussion context and proposals preserve inspectable excerpts', async () => {
	store.switchWorkingSet(null);
	for (const action of ['decompose', 'develop', 'challenge', 'connect']) {
		const context = buildContext(action, [first]);
		assert.equal(context.conversations.length, 1);
		assert.match(buildUserPrompt(action, context), /ability to refuse/);
		assert.match(buildUserPrompt(action, context), /not ratified graph state/);
	}
	assert.equal(buildContext('decompose', [], { id: 'scratch-test', body: 'Unrelated capture.' }).conversations.length, 0);
	store.createWorkingSet('Discussion context', [first]);
	assert.equal(buildContext('decompose', [], { id: 'scratch-test', body: 'Capture in group.' }).conversations.length, 1);
	const result = await store.invoke('develop', [first], undefined, fixture);
	assert(!result.error, result.error);
	const cs = store.getState().pendingChangeSets.find(c => c.id === result.changeSetId);
	assert.equal(cs.conversationContext[0].messages.length, 4);
	await chat.sendMessage({ thoughtId: first }, 'One more clarification.', 'late-clarification', fixture);
	assert.equal(store.getState().pendingChangeSets.find(c => c.id === cs.id).conversationContext[0].messages.length, 4, 'recorded context never changes retrospectively');
});

test('a proposed-thought discussion follows acceptance, undo, and reapplication', async () => {
	const result = await store.invoke('develop', [first], undefined, fixture);
	assert(!result.error, result.error);
	const cs = store.getState().pendingChangeSets.find(c => c.id === result.changeSetId);
	const op = cs.operations.find(o => o.payload.op === 'create_thought');
	assert(op);
	const conversation = await chat.sendMessage({ operationId: op.id }, 'Can we narrow this idea before accepting it?', 'proposed-question', fixture);
	assert.equal(conversation.thoughtId, null);
	assert(buildContext('challenge', [first]).conversations.some(c => c.id === conversation.id), 'a pending discussion accompanies its source selection');
	for (const o of cs.operations) assert.equal(store.decide(cs.id, o.id, 'accepted'), null);
	assert(!store.applyChangeSet(cs.id, {}).error);
	const acceptedId = chat.conversationsForGraph().find(c => c.id === conversation.id).thoughtId;
	assert(acceptedId && store.getState().thoughts[acceptedId]);
	assert.equal(chat.getConversations({ thoughtId: acceptedId })[0].id, conversation.id);
	assert(buildContext('challenge', [acceptedId]).conversations.some(c => c.id === conversation.id));
	await chat.sendMessage({ thoughtId: acceptedId }, 'Now clarify the accepted version.', 'after-accept', fixture);
	assert.equal(store.undoLastApply(), null);
	assert.equal(chat.getConversations({ operationId: op.id })[0].thoughtId, null);
	assert.equal(chat.getConversations({ operationId: op.id })[0].messages.length, 4);
	assert(!store.applyChangeSet(cs.id, {}).error);
	const reapplied = chat.getConversations({ operationId: op.id })[0];
	assert.notEqual(reapplied.thoughtId, acceptedId);
	assert.equal(reapplied.messages.length, 4);
});

test('a discussion first started after acceptance also survives undo on its proposal', async () => {
	const result = await store.invoke('develop', [first], undefined, fixture);
	const cs = store.getState().pendingChangeSets.find(c => c.id === result.changeSetId);
	for (const op of cs.operations) store.decide(cs.id, op.id, 'accepted');
	assert(!store.applyChangeSet(cs.id, {}).error);
	const op = cs.operations.find(o => o.payload.op === 'create_thought');
	const tid = db.prepare('SELECT applied_thought_id FROM proposed_operations WHERE id = ?').get(op.id).applied_thought_id;
	await chat.sendMessage({ thoughtId: tid }, 'First discussion after applying.', 'after-apply', fixture);
	assert.equal(store.undoLastApply(), null);
	assert.equal(chat.getConversations({ operationId: op.id })[0].messages.length, 2);
});

test('explicit discussion distillation stages proposals while leaving canonical state untouched', async () => {
	const pending = store.getState().pendingChangeSets.at(-1);
	const op = pending.operations.find(o => o.payload.op === 'create_thought');
	const thread = (await chat.sendMessage({ operationId: op.id }, 'What if this is really two separate ideas?', 'distill-question', fixture));
	const before = store.getState().thoughts;
	const result = await store.invoke('decompose', [], undefined, fixture, undefined, thread.id);
	assert(!result.error, result.error);
	assert.deepEqual(store.getState().thoughts, before);
	const cs = store.getState().pendingChangeSets.find(c => c.id === result.changeSetId);
	assert(cs.conversationContext.some(c => c.id === thread.id));
	assert.match(db.prepare('SELECT body FROM scratch_notes WHERE id = ?').get(cs.scratchId).body, /two separate ideas/);
});

test('failures retain the user message, concurrent sends are blocked, and retry appends once', async () => {
	const id = Object.keys(store.getState().thoughts).find(id => id !== first);
	let release;
	const waiting = new Promise(resolve => { release = resolve; });
	const task = chat.sendMessage({ thoughtId: id }, 'Keep this question.', 'retry-me', fixture, async () => { await waiting; throw new Error('Provider unavailable'); });
	await assert.rejects(chat.sendMessage({ thoughtId: id }, 'Another question.', 'concurrent', fixture), /already in progress/);
	release();
	await assert.rejects(task, /Provider unavailable/);
	assert.equal(chat.getConversations({ thoughtId: id })[0].messages.length, 1);
	await assert.rejects(chat.sendMessage({ thoughtId: id }, 'Skip ahead.', 'skip', fixture), /Retry the unanswered/);
	await chat.sendMessage({ thoughtId: id }, 'Keep this question.', 'retry-me', fixture);
	assert.equal(chat.getConversations({ thoughtId: id })[0].messages.length, 2);
});

test('graph switching during a reply cannot leak messages or context', async () => {
	const graphId = store.getState().activeGraphId;
	const thread = chat.getConversations({ thoughtId: first })[0];
	let release;
	const waiting = new Promise(resolve => { release = resolve; });
	const task = chat.sendMessage({ thoughtId: first }, 'Stay in this graph.', 'switch-in-flight', fixture, async () => { await waiting; return { body: 'Still attached here.', model: 'test' }; });
	assert.equal(store.createGraph('Isolated discussions'), null);
	assert.throws(() => chat.getConversations({ thoughtId: first }), /Unknown thought/);
	assert.equal(buildContext('decompose', []).conversations.length, 0);
	assert((await store.invoke('decompose', [], undefined, fixture, undefined, thread.id)).error);
	release();
	await task;
	assert.equal(chat.conversationsForGraph().length, 0);
	store.switchGraph(graphId);
	assert.equal(chat.getConversations({ thoughtId: first })[0].messages.at(-1).body, 'Still attached here.');
});

test('request validation prevents unsupported targets and bounds message context', async () => {
	for (const target of [{}, { thoughtId: first, operationId: 'op' }, { operationId: 'unknown' }]) assert.throws(() => chat.getConversations(target));
	for (const body of ['', 'x'.repeat(8001)]) await assert.rejects(chat.sendMessage({ thoughtId: first }, body, 'invalid', fixture));
	const request = new Request('http://localhost/api/conversations', { method: 'POST', body: JSON.stringify({ graphId: 'stale', thoughtId: first, body: 'Hi', messageId: 'id', selection: fixture }) });
	assert.equal((await POST({ request })).status, 409);
	const original = chat.getConversations({ thoughtId: first })[0];
	const long = { ...original, messages: Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, role: i % 2 ? 'assistant' : 'user', body: 'x'.repeat(2000), createdAt: i })) };
	const excerpt = chat.conversationExcerpt(long);
	assert.equal(excerpt.messages.length, 12);
	assert.equal(excerpt.messages.at(-1).id, '29');
	assert.match(excerpt.title, /older messages omitted/);
	assert.equal(long.messages.length, 30);
});

test('live replies use a closed reply schema, reject proposal output, retry once, and log both attempts', async () => {
	const { generateReply } = await server.ssrLoadModule('/src/lib/server/agent/chat.ts');
	const requests = [];
	const client = { messages: { parse: async (request) => {
		requests.push(request);
		const value = requests.length === 1 ? { body: 'Changed it!', operations: [{ op: 'create_thought' }] } : { body: 'We can clarify the boundary before changing anything.' };
		return { content: [{ type: 'text', text: JSON.stringify(value) }], parsed_output: value, usage: { input_tokens: 42, output_tokens: 20 } };
	} } };
	const before = store.getState();
	const thread = chat.getConversations({ thoughtId: first })[0];
	const reply = await generateReply({ state: 'proposed', thought: { title: 'An undecided idea' } }, thread, { provider: 'live', model: 'chat-test' }, { anthropicClient: client });
	assert.equal(reply.body, 'We can clarify the boundary before changing anything.');
	assert.equal(requests.length, 2);
	assert.equal('tools' in requests[0], false);
	assert.equal(requests[0].output_config.format.schema.additionalProperties, false);
	assert.match(requests[0].system, /cannot create, edit, accept, or reject/);
	assert.match(requests[1].messages[0].content, /Previous invalid output/);
	assert.deepEqual(store.getState(), before);
	const logs = db.prepare("SELECT * FROM agent_calls WHERE model = 'chat-test' ORDER BY rowid").all();
	assert.equal(logs.length, 2);
	assert(logs[0].validation_errors);
	assert.equal(logs[1].validation_errors, null);
	assert.equal(logs[1].usage, '42 in / 20 out tokens');
});

test('invalid replies and transport failures are logged without becoming assistant messages', async () => {
	const { generateReply } = await server.ssrLoadModule('/src/lib/server/agent/chat.ts');
	const thread = chat.getConversations({ thoughtId: first })[0];
	let attempts = 0;
	const invalid = { messages: { parse: async () => { attempts++; return { content: [{ type: 'text', text: '{}' }], parsed_output: {}, usage: { input_tokens: 1, output_tokens: 1 } }; } } };
	await assert.rejects(generateReply({}, thread, { provider: 'live', model: 'chat-invalid' }, { anthropicClient: invalid }), /invalid reply/);
	assert.equal(attempts, 2);
	const failed = { messages: { parse: async () => { throw new Error('Network down'); } } };
	await assert.rejects(generateReply({}, thread, { provider: 'live', model: 'chat-failure' }, { anthropicClient: failed }), /Network down/);
	const log = db.prepare("SELECT * FROM agent_calls WHERE model = 'chat-failure'").get();
	assert.match(log.error, /Network down/);
	assert.match(log.request, /conversation/);
	assert.equal(chat.getConversations({ thoughtId: first })[0].messages.length, thread.messages.length);
});

test('the discussion component renders accessible escaped controls', async () => {
	const { render } = await server.ssrLoadModule('svelte/server');
	const { default: Discussion } = await server.ssrLoadModule('/src/lib/components/SideConversation.svelte');
	const { body } = render(Discussion, { props: { thoughtId: 'thought-<script>' } });
	assert.match(body, /<summary[^>]*>Discuss/);
	assert.match(body, /role="log"/);
	assert.match(body, /maxlength="8000"/);
	assert.match(body, /Message about this thought/);
	assert(!body.includes('<script>'));
});
