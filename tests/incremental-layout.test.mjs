import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { expandLayout, openPosition } = await server.ssrLoadModule('/src/lib/incremental-layout.ts');
const rect = (id, x, y, width = 260, height = 120) => ({ id, x, y, width, height });
function noOverlap(nodes, positions) {
	for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
		const a = { ...nodes[i], ...positions.get(nodes[i].id) }, b = { ...nodes[j], ...positions.get(nodes[j].id) };
		assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.id} overlaps ${b.id}`);
	}
}

test('a full neighborhood expands for additions while distant cards stay exactly still', () => {
	const old = [];
	for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) old.push(rect(`${x}:${y}`, x * 292, y * 152));
	old.push(rect('far', 20000, 20000));
	const additions = Array.from({ length: 6 }, (_, i) => rect(`new${i}`, 30000, 30000, 310, 180 + i * 30));
	const links = additions.map(n => ({ from: n.id, to: '0:0' }));
	const snapshot = structuredClone(old);
	const result = expandLayout(old, additions, links);
	assert.deepEqual(old, snapshot, 'planning does not mutate the canonical map');
	assert.deepEqual(result, expandLayout(old, additions, links), 'repeatable preview');
	assert.deepEqual(result.get('far'), { x: 20000, y: 20000 });
	assert(old.some(n => n.id !== 'far' && (n.x !== result.get(n.id).x || n.y !== result.get(n.id).y)), 'make room, not just place at the edge');
	noOverlap([...old, ...additions], result);
	for (const n of additions) assert(Math.hypot(result.get(n.id).x, result.get(n.id).y) < 2500, 'new thoughts stay in the relevant area');
});

test('variable sizes, new-to-new cycles, disconnected additions and empty graphs remain collision-free', () => {
	const old = [rect('anchor', -400, -700, 420, 800), rect('other', 80, -700, 300, 1100)];
	const additions = [rect('a', 0, 0, 300, 700), rect('b', 0, 0, 550, 90), rect('c', 0, 0), rect('d', 0, 0)];
	const links = [{ from: 'b', to: 'a' }, { from: 'a', to: 'anchor' }, { from: 'a', to: 'b' }];
	noOverlap([...old, ...additions], expandLayout(old, additions, links));
	noOverlap(additions, expandLayout([], additions, links));
	assert.deepEqual(expandLayout(old, [], []), new Map(old.map(n => [n.id, { x: n.x, y: n.y }])));
});

test('staging never falls back to an occupied origin even when the search area is full', () => {
	const occupied = [rect('huge', -100000, -100000, 200000, 200000)];
	const node = rect('new', 0, 0, 300, 900);
	const pos = openPosition(occupied, node, { x: 0, y: 0 });
	noOverlap([...occupied, node], new Map([['new', pos]]));
});

test('many successive insertions terminate and leave a valid layout', () => {
	let nodes = [rect('0', 0, 0)];
	for (let i = 1; i <= 35; i++) {
		const node = rect(String(i), 0, 0, 240 + (i % 3) * 60, 100 + (i % 5) * 55);
		const result = expandLayout(nodes, [node], [{ from: node.id, to: String(Math.floor(i / 3)) }]);
		nodes = [...nodes, node].map(n => ({ ...n, ...result.get(n.id) }));
		noOverlap(nodes, result);
	}
});

test('preview is view-only, cancellation restores positions, and failed apply keeps canonical layout intact', async () => {
	const { workspace: ws } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	ws.thoughts = { anchor: { id: 'anchor', title: 'Anchor', statement: 'A claim', type: 'claim' } };
	ws.positions = { anchor: { x: 0, y: 0 } };
	ws.cardSizes = { anchor: { width: 260, height: 120, zoom: 'overview', fontScale: 1 }, 'cs:new': { width: 260, height: 120, zoom: 'overview', fontScale: 1 } };
	ws.ghostPositions = { 'cs:new': { x: 900, y: 900 } };
	const cs = { id: 'cs', invokedOn: ['anchor'], operations: [
		{ id: 'create', clientRef: 'new', decision: 'accepted', payload: { op: 'create_thought', thought: { title: 'New', statement: 'New claim' } } },
		{ id: 'rel', clientRef: 'r', decision: 'accepted', payload: { op: 'add_relation', from: 'new', to: 'anchor', relationType: 'supports' } }
	] };
	ws.pendingChangeSets = [cs];
	const before = structuredClone(ws.positions), ghosts = structuredClone(ws.ghostPositions);
	await ws.previewPlacement(cs);
	assert(ws.layoutPreview);
	assert.deepEqual(ws.positions, before);
	assert.deepEqual(ws.ghostPositions, ghosts);
	assert.notDeepEqual(ws.displayGhostPositions, ghosts);
	ws.cancelLayoutPreview();
	assert.deepEqual(ws.displayPositions, before);
	assert.deepEqual(ws.displayGhostPositions, ghosts);
	await ws.previewPlacement(cs);
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Test failure' }), { status: 400 });
	try {
		assert.equal(await ws.applyChangeSet(cs), 'Test failure');
		assert.deepEqual(ws.positions, before);
		assert.deepEqual(ws.ghostPositions, ghosts);
		assert(ws.layoutPreview, 'failed submission retains a cancellable preview');
		assert.equal(ws.applying, false);
	} finally { globalThis.fetch = originalFetch; }
	ws.cancelLayoutPreview();
});
