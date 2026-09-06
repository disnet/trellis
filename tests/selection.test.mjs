import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const thought = (id) => ({ id, title: id, statement: `${id} statement`, type: 'claim', revisions: [] });
const note = (id, x, y) => ({ id, body: id, x, y, createdAt: 0, updatedAt: 0 });
const proposal = (id, ref) => ({
	id,
	clientRef: ref,
	sequence: 0,
	dependsOn: [],
	evidenceRefs: [],
	decision: 'pending',
	rationale: '',
	payload: { op: 'create_thought', thought: { title: ref, statement: `${ref} statement`, type: 'claim', status: 'tentative' } }
});

/** A canvas holding two thoughts, two notes and two proposals, all placed. */
async function canvas() {
	const { workspace: ws } = await server.ssrLoadModule('/src/lib/workspace.svelte.ts');
	ws.thoughts = { a: thought('a'), b: thought('b') };
	ws.positions = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } };
	ws.notes = [note('n1', 0, 200), note('n2', 400, 200)];
	ws.pendingChangeSets = [
		{ id: 'cs', invokedOn: ['a'], operations: [proposal('op1', 'p1'), proposal('op2', 'p2')] }
	];
	ws.ghostPositions = { 'cs:p1': { x: 0, y: 400 }, 'cs:p2': { x: 400, y: 400 } };
	ws.clearSelection();
	return ws;
}

test('a marquee sweep selects thoughts, notes and proposals as one selection', async () => {
	const ws = await canvas();
	ws.selectRegion({ thoughts: ['a', 'b'], notes: ['n1'], proposals: ['op1'] });
	assert.deepEqual(ws.selectedIds, ['a', 'b']);
	assert.deepEqual(ws.selectedNoteIds, ['n1']);
	assert.deepEqual(ws.selectedProposalIds, ['op1']);
	assert.equal(ws.selectionSize, 4);
	// A sweep replaces the whole selection, and never keeps what is no longer there.
	ws.selectRegion({ thoughts: ['a', 'gone'], notes: ['n2', 'gone'], proposals: [] });
	assert.deepEqual(ws.selectedIds, ['a']);
	assert.deepEqual(ws.selectedNoteIds, ['n2']);
	assert.deepEqual(ws.selectedProposalIds, []);
	ws.clearSelection();
	assert.equal(ws.selectionSize, 0);
});

test('shift extends a mixed selection and takes items back out; a plain pick replaces it', async () => {
	const ws = await canvas();
	ws.select('a');
	ws.selectNote('n1', true);
	ws.selectProposal('op1', true);
	assert.equal(ws.selectionSize, 3);
	assert.equal(ws.selectedProposalId, 'op1', 'one selected proposal is the one the tray reveals');
	ws.selectProposal('op2', true);
	assert.equal(ws.selectedProposalId, null, 'a sweep of several has no single subject');
	// Shift on something already selected takes it out, leaving the other kinds alone.
	ws.selectNote('n1', true);
	assert.deepEqual(ws.selectedNoteIds, []);
	assert.deepEqual(ws.selectedIds, ['a']);
	assert.deepEqual(ws.selectedProposalIds, ['op1', 'op2']);
	// A plain pick of any kind starts the selection over.
	ws.selectNote('n2');
	assert.deepEqual(ws.selectedNoteIds, ['n2']);
	assert.equal(ws.selectionSize, 1);
	ws.select('b');
	assert.deepEqual(ws.selectedIds, ['b']);
	assert.equal(ws.selectionSize, 1);
	ws.selectProposal('op1');
	assert.deepEqual(ws.selectedProposalIds, ['op1']);
	assert.equal(ws.selectionSize, 1);
});

test('a mixed selection travels as one block, and anything outside it stays put', async () => {
	const ws = await canvas();
	const fetched = globalThis.fetch;
	globalThis.fetch = async () => new Response('{}', { status: 200 });
	try {
		ws.selectRegion({ thoughts: ['a'], notes: ['n1'], proposals: ['op1'] });
		// Drag the note 20 right and 30 down: everything selected follows.
		ws.moveSelection('note', 'n1', 20, 230);
		assert.deepEqual(ws.notes.find((n) => n.id === 'n1'), { ...note('n1', 20, 230) });
		assert.deepEqual(ws.positions.a, { x: 20, y: 30 });
		assert.deepEqual(ws.ghostPositions['cs:p1'], { x: 20, y: 430 });
		assert.deepEqual(ws.positions.b, { x: 400, y: 0 }, 'unselected thoughts never move');
		assert.deepEqual(ws.ghostPositions['cs:p2'], { x: 400, y: 400 });
		assert.deepEqual(ws.notes.find((n) => n.id === 'n2'), { ...note('n2', 400, 200) });
		// Dragging a proposal drags the same block, addressed by its operation id.
		ws.moveSelection('ghost', 'op1', 20, 400);
		assert.deepEqual(ws.positions.a, { x: 20, y: 0 });
		assert.deepEqual(ws.notes.find((n) => n.id === 'n1').y, 200);
		// Dragging something outside the selection moves only it.
		ws.moveSelection('card', 'b', 500, 100);
		assert.deepEqual(ws.positions.b, { x: 500, y: 100 });
		assert.deepEqual(ws.positions.a, { x: 20, y: 0 });
		assert.deepEqual(ws.ghostPositions['cs:p1'], { x: 20, y: 400 });
	} finally {
		await new Promise((resolve) => setTimeout(resolve, 500));
		globalThis.fetch = fetched;
	}
});

test('deleted notes and ratified proposals leave the selection behind them', async () => {
	const ws = await canvas();
	ws.selectRegion({ thoughts: ['a', 'b'], notes: ['n1', 'n2'], proposals: ['op1', 'op2'] });
	const selection = ws.selectedIds;
	ws.applyState({
		graphs: [],
		activeGraphId: '',
		thoughts: { a: thought('a'), b: thought('b') },
		relations: [],
		canvas: [{ thoughtId: 'a', x: 0, y: 0 }, { thoughtId: 'b', x: 400, y: 0 }],
		workingSets: [],
		activeWorkingSetId: null,
		workingSet: [],
		pinnedThoughtIds: [],
		notes: [note('n2', 400, 200)],
		scratchNotes: [],
		pendingChangeSets: [{ id: 'cs', invokedOn: ['a'], operations: [proposal('op2', 'p2')] }],
		decidedChangeSets: [],
		undoLabel: null
	});
	assert.deepEqual(ws.selectedNoteIds, ['n2'], 'a deleted note is not still selected');
	assert.deepEqual(ws.selectedProposalIds, ['op2'], 'an applied proposal is not still selected');
	assert.equal(ws.selectedIds, selection, 'surviving thoughts keep the same array — the inspector stays put');
	ws.clearSelection();
});

// The proposals tray names thoughts; clicking one asks the canvas to go there.
test('asking the canvas for an item switches to it, and asks again on every click', async () => {
	const ws = await canvas();
	ws.view = 'outline';
	ws.revealOnCanvas('a');
	assert.equal(ws.view, 'canvas', 'you cannot look at the canvas from the outline');
	assert.deepEqual(ws.canvasReveal.ids, ['a']);
	const first = ws.canvasReveal.n;
	ws.revealOnCanvas('a');
	assert.equal(ws.canvasReveal.n, first + 1, 'the same thought twice moves the camera twice');
	ws.revealOnCanvas('a', 'cs:p1');
	assert.deepEqual(ws.canvasReveal.ids, ['a', 'cs:p1'], 'a connection frames both of its ends');
	const asked = ws.canvasReveal.n;
	ws.revealOnCanvas();
	assert.equal(ws.canvasReveal.n, asked, 'nothing to show, nothing to move');
	ws.view = 'canvas';
});
