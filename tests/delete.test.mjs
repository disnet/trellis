import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
process.env.TRELLIS_DB = ':memory:';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const store = await server.ssrLoadModule('/src/lib/server/store.ts');
const { db } = await server.ssrLoadModule('/src/lib/server/db.ts');
const chat = await server.ssrLoadModule('/src/lib/server/conversations.ts');

/** Two connected thoughts, the first pinned, grouped, and discussed. */
function scene(name) {
	const a = store.createThought({ title: name, statement: 'A starting claim.', type: 'claim', status: 'developing', x: 100, y: 100 }).thoughtId;
	const b = store.createThought({ title: `${name} branch`, statement: 'A second claim.', type: 'claim', status: 'tentative', x: 400, y: 100 }).thoughtId;
	db.prepare("INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, graph_id, created_at) VALUES (?, ?, ?, 'supports', 'human', ?, ?)")
		.run(`r-${a}`, b, a, store.getState().activeGraphId, Date.now());
	store.createWorkingSet(name, [a, b]);
	store.setPinned(a, true);
	return { a, b };
}

const count = () => Object.keys(store.getState().thoughts).length;
const relationsOf = (id) =>
	store.getState().relations.filter((r) => r.fromThoughtId === id || r.toThoughtId === id);

test('deleting takes the thought with its relations, layout, pin and membership — and undo restores all of it', async () => {
	const { a, b } = scene('Anchor');
	await chat.sendMessage({ thoughtId: a }, 'What does anchor mean here?', 'clarify-anchor', { provider: 'fixture', model: '' });
	const before = store.getState();
	assert.equal(relationsOf(a).length, 1);
	const group = before.workingSets.find((set) => set.name === 'Anchor');

	assert.deepEqual(store.deleteThoughts([a]), { deleted: 1 });
	const after = store.getState();
	assert.equal(a in after.thoughts, false);
	assert.equal(b in after.thoughts, true, 'the other endpoint stays');
	assert.deepEqual(relationsOf(a), [], 'relations touching it go too');
	assert.equal(after.relations.length, before.relations.length - 1, 'and only those');
	assert.equal(after.canvas.some((p) => p.thoughtId === a), false);
	assert.equal(after.pinnedThoughtIds.includes(a), false);
	assert.equal(after.workingSets.find((set) => set.id === group.id).members.includes(a), false);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM thought_revisions WHERE thought_id = ?').get(a).n, 0);
	assert.equal(after.undoLabel, 'Deleted “Anchor”');

	assert.equal(store.undoLast().kind, 'delete');
	const restored = store.getState();
	assert.deepEqual(restored.thoughts, before.thoughts);
	assert.deepEqual(restored.relations, before.relations);
	assert.deepEqual(restored.canvas, before.canvas);
	assert.deepEqual(restored.pinnedThoughtIds, before.pinnedThoughtIds, 'the pin comes back with the thought');
	assert.deepEqual(
		restored.workingSets.find((set) => set.id === group.id).members.sort(),
		[a, b].sort()
	);
	assert.equal(chat.getConversations({ thoughtId: a })[0].messages.length, 2, 'its discussion returns intact');
});

test('a batch delete reports its count; a bad request changes nothing', () => {
	const { a, b } = scene('Batch');
	const before = count();
	assert.deepEqual(store.deleteThoughts(['t-nope']), { error: 'Unknown thought.' });
	assert.deepEqual(store.deleteThoughts('t-nope'), { error: 'Invalid thought ids.' });
	assert.deepEqual(store.deleteThoughts([a, 7]), { error: 'Invalid thought ids.' });
	assert.equal(count(), before);
	assert.equal(store.getState().undoLabel, null, 'a refused delete snapshots nothing');

	assert.deepEqual(store.deleteThoughts([a, b, 't-nope']), { deleted: 2 });
	assert.equal(count(), before - 2);
	assert.equal(store.getState().undoLabel, 'Deleted 2 thoughts');

	assert.equal(store.undoLast().kind, 'delete');
	assert.equal(count(), before);
	assert.equal(store.undoLast().error, 'Nothing to undo.', 'undo is one deep, as it has always been');
});
