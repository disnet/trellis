import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
process.env.TRELLIS_DB = ':memory:';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const store = await server.ssrLoadModule('/src/lib/server/store.ts');

function pairOfThoughts(name) {
	const a = store.createThought({ title: name, statement: 'A starting claim.', type: 'claim', status: 'developing', x: 100, y: 100 }).thoughtId;
	const b = store.createThought({ title: `${name} branch`, statement: 'A second claim.', type: 'claim', status: 'tentative', x: 400, y: 100 }).thoughtId;
	return { a, b };
}

const between = (a, b) =>
	store.getState().relations.filter(
		(r) => (r.fromThoughtId === a && r.toThoughtId === b) || (r.fromThoughtId === b && r.toThoughtId === a)
	);

test('a hand-drawn relation lands immediately, human-authored, with no change set', () => {
	const { a, b } = pairOfThoughts('Manual');
	assert.equal(store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'supports' }), null);
	const [r] = between(a, b);
	assert.equal(r.fromThoughtId, a);
	assert.equal(r.toThoughtId, b);
	assert.equal(r.type, 'supports');
	assert.equal(r.createdBy, 'human');
	assert.equal(r.sourceChangeSetId, undefined);
});

test('creating validates endpoints, type, self-loops and duplicates', () => {
	const { a, b } = pairOfThoughts('Valid');
	assert.equal(store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'supports' }), null);
	assert.match(store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'supports' }), /already related/);
	assert.match(store.createRelation({ fromThoughtId: a, toThoughtId: a, type: 'supports' }), /two different/);
	assert.match(store.createRelation({ fromThoughtId: a, toThoughtId: 't-missing', type: 'supports' }), /Unknown thought/);
	assert.match(store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'because' }), /Invalid relation type/);
	// The reverse direction is a different relation, and allowed.
	assert.equal(store.createRelation({ fromThoughtId: b, toThoughtId: a, type: 'supports' }), null);
});

test('editing retypes or reverses a relation, and the edited form is human-authored', () => {
	const { a, b } = pairOfThoughts('Edit');
	store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'supports' });
	const [r] = between(a, b);

	assert.equal(store.updateRelation(r.id, { type: 'contradicts' }), null);
	assert.equal(between(a, b)[0].type, 'contradicts');

	assert.equal(store.updateRelation(r.id, { reverse: true }), null);
	const flipped = between(a, b)[0];
	assert.equal(flipped.fromThoughtId, b);
	assert.equal(flipped.toThoughtId, a);
	assert.equal(flipped.createdBy, 'human');

	assert.match(store.updateRelation(r.id, { type: 'nonsense' }), /Invalid relation type/);
	assert.match(store.updateRelation('r-missing', { type: 'supports' }), /Unknown relation/);
	// An edit may not collide with a relation that already exists.
	store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'contradicts' });
	assert.match(store.updateRelation(r.id, { reverse: true }), /already related/);
});

test('deleting a relation snapshots first, so undo brings it back', () => {
	const { a, b } = pairOfThoughts('Undo');
	store.createRelation({ fromThoughtId: a, toThoughtId: b, type: 'depends_on' });
	const [r] = between(a, b);
	const before = store.getState();

	assert.equal(store.deleteRelation(r.id), null);
	assert.equal(between(a, b).length, 0);
	assert.equal(store.getState().undoLabel, 'Removed a depends on relation');
	assert.match(store.deleteRelation(r.id), /Unknown relation/);

	assert.equal(store.undoLast().kind, 'delete');
	assert.deepEqual(store.getState().relations, before.relations);
});
