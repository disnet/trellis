import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const lex = await server.ssrLoadModule('/src/lib/garden/lexicon.ts');

const did = 'did:plc:abcdefghijklmnop';

test('at-uris round-trip through build and parse', () => {
	const uri = lex.atUri(did, lex.COLLECTIONS.thought, 't-12ab34cd');
	assert.equal(uri, `at://${did}/${lex.COLLECTIONS.thought}/t-12ab34cd`);
	assert.deepEqual(lex.parseAtUri(uri), { did, collection: lex.COLLECTIONS.thought, rkey: 't-12ab34cd' });
	assert.equal(lex.parseAtUri('https://example.com/x'), null);
	assert.equal(lex.parseAtUri('at://not-a-did/coll/rkey'), null);
});

test('every relation type has a public rendering label, both directions', () => {
	for (const type of lex.RELATION_TYPES) {
		assert(lex.RELATION_LABELS[type]?.forward, `${type} forward`);
		assert(lex.RELATION_LABELS[type]?.reverse, `${type} reverse`);
	}
	// The softened vocabulary: precise data, non-combative rendering.
	assert.equal(lex.RELATION_LABELS.contradicts.forward, 'in tension with');
	assert.equal(lex.RELATION_LABELS.supersedes.reverse, 'rethought as');
});

test('confidence survives the string encoding the atproto data model requires', () => {
	const pub = lex.toPublicConfidence({ probability: 0.7, low: 40, high: 80, unit: 'ms', resolveBy: '2027-01-01' });
	assert.deepEqual(pub, { probability: '0.7', low: '40', high: '80', unit: 'ms', resolveBy: '2027-01-01' });
	assert.deepEqual(lex.fromPublicConfidence(pub), { probability: 0.7, low: 40, high: 80, unit: 'ms', resolveBy: '2027-01-01' });
	// Malformed numbers from a foreign record drop out instead of rendering NaN.
	assert.deepEqual(lex.fromPublicConfidence({ probability: 'high', unit: 'ms' }), { unit: 'ms' });
});

test('record guards accept what Trellis writes and reject malformed shapes', () => {
	const revisionUri = lex.atUri(did, lex.COLLECTIONS.revision, 'rev-1');
	const thought = {
		$type: lex.COLLECTIONS.thought,
		thoughtType: 'claim',
		status: 'believed',
		title: 'A claim',
		statement: 'A statement.',
		currentRevision: revisionUri,
		createdAt: '2026-01-01T00:00:00.000Z',
		firstPublishedAt: '2026-02-01T00:00:00.000Z'
	};
	assert(lex.readThoughtRecord(thought));
	assert.equal(lex.readThoughtRecord({ ...thought, status: 'certain' }), null, 'unknown status');
	assert.equal(lex.readThoughtRecord({ ...thought, currentRevision: 'nope' }), null, 'bad uri');
	assert.equal(lex.readThoughtRecord({ ...thought, title: '' }), null, 'empty title');
	assert(lex.readThoughtRecord({ ...thought, confidence: { probability: '0.7' } }));
	assert.equal(lex.readThoughtRecord({ ...thought, confidence: { probability: 0.7 } }), null, 'floats are not atproto data');

	const revision = {
		$type: lex.COLLECTIONS.revision,
		thought: lex.atUri(did, lex.COLLECTIONS.thought, 't-1'),
		title: 'A claim',
		statement: 'A statement.',
		status: 'believed',
		authorship: { actor: 'agent', editedFromProposal: true },
		createdAt: '2026-01-01T00:00:00.000Z',
		publishedAt: '2026-02-01T00:00:00.000Z'
	};
	assert(lex.readRevisionRecord(revision));
	assert.equal(lex.readRevisionRecord({ ...revision, authorship: { actor: 'model' } }), null);

	const garden = {
		$type: lex.COLLECTIONS.garden,
		title: 'My garden',
		pinned: [],
		release: {
			publishedAt: '2026-02-01T00:00:00.000Z',
			thoughts: [lex.atUri(did, lex.COLLECTIONS.thought, 't-1')],
			revisions: [revisionUri],
			relations: []
		},
		createdAt: '2026-02-01T00:00:00.000Z'
	};
	assert(lex.readGardenRecord(garden));
	assert.equal(lex.readGardenRecord({ ...garden, release: undefined }), null);
	assert.equal(lex.readGardenRecord({ ...garden, pinned: ['not-a-uri'] }), null);
});
