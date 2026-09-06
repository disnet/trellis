import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const { nextGroupOf } = await server.ssrLoadModule('/src/lib/groups.ts');

/** Two groups over four thoughts: 'a' is in both, 'b' in one, 'd' in none. */
const groups = [
	{ id: 'g1', name: 'One', members: ['a', 'b'] },
	{ id: 'g2', name: 'Two', members: ['a', 'c'] }
];

test('double-clicking a thought opens the group holding it', () => {
	assert.equal(nextGroupOf(groups, 'b', null)?.id, 'g1');
	assert.equal(nextGroupOf(groups, 'c', null)?.id, 'g2');
	// From a group that does not hold the thought, the tour starts at its first.
	assert.equal(nextGroupOf(groups, 'c', 'g1')?.id, 'g2');
});

test('the last group holding a thought hands back to the whole graph', () => {
	assert.equal(nextGroupOf(groups, 'b', 'g1'), null);
	// A thought in no group has nowhere to go but the whole graph.
	assert.equal(nextGroupOf(groups, 'd', null), null);
	assert.equal(nextGroupOf(groups, 'd', 'g1'), null);
});

test('a thought in several groups tours them in tab order and back out', () => {
	const first = nextGroupOf(groups, 'a', null);
	assert.equal(first.id, 'g1');
	const second = nextGroupOf(groups, 'a', first.id);
	assert.equal(second.id, 'g2');
	assert.equal(nextGroupOf(groups, 'a', second.id), null, 'the tour returns to the whole graph');
});
