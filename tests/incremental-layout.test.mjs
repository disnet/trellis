import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { expandLayout, openPosition, stageBeside } = await server.ssrLoadModule('/src/lib/incremental-layout.ts');
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

test('a hand-placed addition keeps its exact spot and the map opens around it', () => {
	const old = [rect('anchor', 0, 0), rect('bystander', 4000, 4000)];
	const node = rect('new', 40, 30);
	const links = [{ from: 'new', to: 'anchor' }];
	const auto = expandLayout(old, [node], links);
	assert.notDeepEqual(auto.get('new'), { x: 40, y: 30 }, 'without a hand placement the anchor decides');
	const pinnedResult = expandLayout(old, [node], links, [], ['new']);
	assert.deepEqual(pinnedResult.get('new'), { x: 40, y: 30 }, 'the drop point is the placement');
	assert.deepEqual(pinnedResult.get('bystander'), { x: 4000, y: 4000 }, 'distant cards still never move');
	assert.notDeepEqual(pinnedResult.get('anchor'), { x: 0, y: 0 }, 'the overlapped card yields instead');
	noOverlap([...old, node], pinnedResult);
	// No anchor to fall back on: the coordinates alone are enough.
	assert.deepEqual(expandLayout(old, [node], [], [], ['new']).get('new'), { x: 40, y: 30 });
});

test('dragging a proposed card pins it: staging leaves it alone and applying honors it', async () => {
	const { workspace: ws } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	const size = { width: 260, height: 120, zoom: 'overview', fontScale: 1 };
	ws.thoughts = { anchor: { id: 'anchor', title: 'Anchor', statement: 'A claim', type: 'claim' } };
	ws.positions = { anchor: { x: 0, y: 0 } };
	ws.cardSizes = { anchor: size, 'drag:new': size };
	ws.ghostPositions = { 'drag:new': { x: 900, y: 900 } };
	const cs = { id: 'drag', invokedOn: ['anchor'], operations: [
		{ id: 'create', clientRef: 'new', decision: 'accepted', payload: { op: 'create_thought', thought: { title: 'New', statement: 'New claim' } } },
		{ id: 'rel', clientRef: 'r', decision: 'accepted', payload: { op: 'add_relation', from: 'new', to: 'anchor', relationType: 'supports' } }
	] };
	ws.pendingChangeSets = [cs];
	await ws.previewPlacement(cs);
	assert.notDeepEqual(ws.layoutPreview.ghosts['drag:new'], { x: 900, y: 900 }, 'an untouched card is placed for you');
	ws.cancelLayoutPreview();

	ws.moveGhost('drag:new', 60, 40);
	// Re-measuring re-stages every other ghost, but never a card you placed.
	ws.measureCard('anchor', 260, 120);
	assert.deepEqual(ws.ghostPositions['drag:new'], { x: 60, y: 40 });
	await ws.previewPlacement(cs);
	assert.deepEqual(ws.layoutPreview.ghosts['drag:new'], { x: 60, y: 40 }, 'applying lands it where you put it');
	assert.equal(ws.layoutPreview.moved, 1, 'the overlapped thought moves instead');
	ws.cancelLayoutPreview();
});

test('stageBeside fills columns beside the anchor and only moves it when blocked', () => {
	const anchor = rect('note', 100, 100, 240, 96);
	const additions = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, width: 260, height: 100 + i * 20 }));
	const open = stageBeside([], anchor, additions);
	assert.deepEqual(open.anchor, { x: 100, y: 100 }, 'room beside the note: it stays put');
	const nodes = [anchor, ...additions.map(a => ({ ...a, x: 0, y: 0 }))];
	noOverlap(nodes, new Map([[anchor.id, open.anchor], ...open.positions]));
	for (const [, p] of open.positions) assert(Math.hypot(p.x - 100, p.y - 100) < 1400, 'the block stays beside the note');

	const wall = rect('wall', -3000, -3000, 6000, 6000);
	const crowded = stageBeside([wall], anchor, additions);
	assert.notDeepEqual(crowded.anchor, { x: 100, y: 100 }, 'no room beside the note: it moves');
	const dx = crowded.anchor.x - 100, dy = crowded.anchor.y - 100;
	for (const [id, p] of crowded.positions)
		assert.deepEqual(p, { x: open.positions.get(id).x + dx, y: open.positions.get(id).y + dy }, 'the block travels with the note');
	noOverlap([wall, ...nodes], new Map([['wall', wall], [anchor.id, crowded.anchor], ...crowded.positions]));
});

test('a note decompose stages its proposals in a block beside the note, and applying honors it', async () => {
	const { workspace: ws } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	const size = { width: 260, height: 120, zoom: 'overview', fontScale: 1 };
	const keys = ['csn:one', 'csn:two', 'csn:three'];
	ws.thoughts = {};
	ws.positions = {};
	ws.cardSizes = { n1: { ...size, width: 240, height: 96 }, ...Object.fromEntries(keys.map(k => [k, size])) };
	ws.ghostPositions = {};
	ws.notes = [{ id: 'n1', body: 'raw text', x: 0, y: 0, createdAt: 0 }];
	const cs = { id: 'csn', invokedOn: [], noteId: 'n1', operations: ['one', 'two', 'three'].map((ref, i) => (
		{ id: `op${i}`, clientRef: ref, decision: 'accepted', dependsOn: [], payload: { op: 'create_thought', thought: { title: ref, statement: 's' } } }
	)) };
	ws.pendingChangeSets = [cs];
	ws.ensureGhosts(cs);
	assert.deepEqual({ x: ws.notes[0].x, y: ws.notes[0].y }, { x: 0, y: 0 }, 'room beside the note: it stays put');
	for (const k of keys) {
		assert(ws.ghostPositions[k], `${k} staged`);
		assert(Math.hypot(ws.ghostPositions[k].x, ws.ghostPositions[k].y) < 1200, 'staged beside the note');
	}
	noOverlap(
		[rect('n1', 0, 0, 240, 96), ...keys.map(k => rect(k, 0, 0))],
		new Map([['n1', { x: 0, y: 0 }], ...keys.map(k => [k, ws.ghostPositions[k]])])
	);
	await ws.previewPlacement(cs);
	for (const k of keys) assert.deepEqual(ws.layoutPreview.ghosts[k], ws.ghostPositions[k], 'applying keeps the reviewed block');
	ws.cancelLayoutPreview();
});

test('when the space beside the note is occupied, the note moves together with its block', async () => {
	const { workspace: ws } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	const size = { width: 260, height: 120, zoom: 'overview', fontScale: 1 };
	const keys = ['csc:one', 'csc:two'];
	ws.thoughts = { wall: { id: 'wall', title: 'Wall', statement: 'big', type: 'claim' } };
	ws.positions = { wall: { x: -4000, y: -4000 } };
	ws.cardSizes = {
		wall: { width: 8000, height: 8000, zoom: 'overview', fontScale: 1 },
		n2: { ...size, width: 240, height: 96 },
		...Object.fromEntries(keys.map(k => [k, size]))
	};
	ws.ghostPositions = {};
	ws.notes = [{ id: 'n2', body: 'raw', x: 0, y: 0, createdAt: 0 }];
	const cs = { id: 'csc', invokedOn: [], noteId: 'n2', operations: ['one', 'two'].map((ref, i) => (
		{ id: `op${i}`, clientRef: ref, decision: 'pending', dependsOn: [], payload: { op: 'create_thought', thought: { title: ref, statement: 's' } } }
	)) };
	ws.pendingChangeSets = [cs];
	ws.ensureGhosts(cs);
	const note = ws.notes[0];
	assert(note.x !== 0 || note.y !== 0, 'the note moved to make room');
	for (const k of keys)
		assert(Math.hypot(ws.ghostPositions[k].x - note.x, ws.ghostPositions[k].y - note.y) < 1200, 'the block travelled with the note');
	noOverlap(
		[rect('wall', 0, 0, 8000, 8000), rect('n2', 0, 0, 240, 96), ...keys.map(k => rect(k, 0, 0))],
		new Map([['wall', { x: -4000, y: -4000 }], ['n2', { x: note.x, y: note.y }], ...keys.map(k => [k, ws.ghostPositions[k]])])
	);
});
