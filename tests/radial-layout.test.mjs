import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { radialNeighbors, radialSlot } = await server.ssrLoadModule('/src/lib/radial-layout.ts');

test('focus includes incoming and outgoing relations once per neighbor, retaining their direction', () => {
	const thoughts = Object.fromEntries(['a', 'b', 'c', 'd'].map((id, createdAt) => [id, { id, createdAt }]));
	const link = (fromThoughtId, toThoughtId, type = 'supports') => ({ fromThoughtId, toThoughtId, type });
	const relations = [link('c', 'a'), link('a', 'b'), link('b', 'a', 'contradicts'), link('b', 'd'), link('a', 'a'), link('a', 'missing')];
	const result = radialNeighbors('a', thoughts, relations);
	assert.deepEqual(result.map(n => n.thought.id), ['b', 'c']);
	assert.deepEqual(result[0].relations, [relations[1], relations[2]]);
	assert.deepEqual(radialNeighbors('a', thoughts, [...relations, link('a', 'd')]).slice(0, 2), result);
	assert.deepEqual(radialNeighbors('isolated', thoughts, relations), []);
});

test('six readable neighbor cards do not overlap each other or the center', () => {
	const boxes = [{ x: 390, y: 295, w: 300, h: 250 }, ...Array.from({ length: 6 }, (_, i) => {
		const p = radialSlot(i);
		return { x: p.x - 120, y: p.y - 90, w: 240, h: 180 };
	})];
	for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
		assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
	}
});
