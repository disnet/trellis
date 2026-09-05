import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { layoutCanvas } = await server.ssrLoadModule('/src/lib/canvas-layout.ts');

test('arrangement handles cycles, disconnected groups, previews and variable card sizes without overlap', () => {
	const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, width: 290, height: 90 + (i % 5) * 100 }));
	const links = [{ from: '0', to: '1' }, { from: '1', to: '2' }, { from: '2', to: '0' }, { from: '0', to: 'missing' }];
	for (const width of [320, 800, 1600]) {
		const positions = layoutCanvas(nodes, links, width);
		assert.equal(positions.size, nodes.length);
		assert.deepEqual(positions, layoutCanvas(nodes, links, width));
		for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
			const a = { ...nodes[i], ...positions.get(nodes[i].id) };
			const b = { ...nodes[j], ...positions.get(nodes[j].id) };
			assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
		}
		const groupBottom = Math.max(...['0', '1', '2'].map(id => positions.get(id).y + nodes[Number(id)].height));
		const groupRight = Math.max(...['0', '1', '2'].map(id => positions.get(id).x + nodes[Number(id)].width));
		assert(positions.get('3').y >= groupBottom + 96 || positions.get('3').x >= groupRight + 96);
	}
	assert.equal(layoutCanvas([], []).size, 0);
});
