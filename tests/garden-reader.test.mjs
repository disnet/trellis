import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

// The fixture hosts here don't resolve in DNS; the private-network guard is
// tested directly against isPrivateAddress below.
process.env.TRELLIS_GARDEN_ALLOW_PRIVATE = '1';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const reader = await server.ssrLoadModule('/src/lib/garden/reader.ts');
const lex = await server.ssrLoadModule('/src/lib/garden/lexicon.ts');

const did = 'did:plc:readertest12345';
const pds = 'https://pds.example';
const T = (rkey) => lex.atUri(did, lex.COLLECTIONS.thought, rkey);
const R = (rkey) => lex.atUri(did, lex.COLLECTIONS.revision, rkey);

const when = (offset) => new Date(Date.parse('2026-08-01T00:00:00Z') + offset * 86_400_000).toISOString();

const revision = (rkey, thoughtRkey, fields) => ({
	uri: R(rkey),
	cid: 'cid',
	value: {
		$type: lex.COLLECTIONS.revision,
		thought: T(thoughtRkey),
		title: fields.title,
		statement: fields.statement ?? 'A statement.',
		status: fields.status,
		authorship: fields.authorship ?? { actor: 'human' },
		...(fields.prev ? { prev: fields.prev } : {}),
		...(fields.changeNote ? { changeNote: fields.changeNote } : {}),
		createdAt: fields.at,
		publishedAt: fields.at
	}
});

const thought = (rkey, fields) => ({
	uri: T(rkey),
	cid: 'cid',
	value: {
		$type: lex.COLLECTIONS.thought,
		thoughtType: fields.type,
		status: fields.status,
		title: fields.title,
		statement: fields.statement ?? 'A statement.',
		currentRevision: fields.currentRevision,
		createdAt: when(0),
		firstPublishedAt: when(1)
	}
});

// The repo: t1 (revised once), t2, one relation, one treatment written from
// t1's FIRST revision (so it is stale), plus a thought and relation that are
// NOT in the manifest and must never render.
const records = {
	[lex.COLLECTIONS.thought]: [
		thought('t-one', { type: 'claim', status: 'contested', title: 'Thought one', currentRevision: R('rev-1b') }),
		thought('t-two', { type: 'question', status: 'tentative', title: 'Thought two', currentRevision: R('rev-2a') }),
		thought('t-hidden', { type: 'claim', status: 'believed', title: 'Unreleased secret', currentRevision: R('rev-x') })
	],
	[lex.COLLECTIONS.revision]: [
		revision('rev-1a', 't-one', { title: 'Thought one', status: 'believed', at: when(1) }),
		revision('rev-1b', 't-one', { title: 'Thought one', status: 'contested', prev: R('rev-1a'), changeNote: 'A stronger objection arrived.', at: when(5) }),
		revision('rev-2a', 't-two', { title: 'Thought two', status: 'tentative', authorship: { actor: 'agent', editedFromProposal: true }, at: when(1) })
	],
	[lex.COLLECTIONS.relation]: [
		{
			uri: lex.atUri(did, lex.COLLECTIONS.relation, 'r-1'),
			cid: 'cid',
			value: {
				$type: lex.COLLECTIONS.relation,
				from: T('t-two'), to: T('t-one'),
				fromRevision: R('rev-2a'), toRevision: R('rev-1a'),
				relationType: 'contradicts', createdBy: 'human',
				createdAt: when(1), publishedAt: when(1)
			}
		},
		{
			uri: lex.atUri(did, lex.COLLECTIONS.relation, 'r-dangling'),
			cid: 'cid',
			value: {
				$type: lex.COLLECTIONS.relation,
				from: T('t-hidden'), to: T('t-one'),
				fromRevision: R('rev-x'), toRevision: R('rev-1a'),
				relationType: 'supports', createdBy: 'human',
				createdAt: when(1), publishedAt: when(1)
			}
		}
	],
	[lex.COLLECTIONS.treatment]: [
		{
			uri: lex.atUri(did, lex.COLLECTIONS.treatment, 'prose-1'),
			cid: 'cid',
			value: {
				$type: lex.COLLECTIONS.treatment,
				title: 'The essay', body: 'It rests on [[t-one]] and [[t-two]].\n\nAnd [[t-hidden]] must stay text.',
				style: 'overview', agentAuthored: true, model: 'live:claude-sonnet-5',
				sourceRevisions: [R('rev-1a'), R('rev-2a')],
				generatedAt: when(1), publishedAt: when(1)
			}
		}
	]
};

const garden = {
	$type: lex.COLLECTIONS.garden,
	title: 'Reader test garden',
	summary: 'An introduction.',
	pinned: [T('t-one'), T('t-hidden')],
	treatment: lex.atUri(did, lex.COLLECTIONS.treatment, 'prose-1'),
	release: {
		publishedAt: when(5),
		thoughts: [T('t-one'), T('t-two')],
		revisions: [R('rev-1a'), R('rev-1b'), R('rev-2a')],
		relations: [lex.atUri(did, lex.COLLECTIONS.relation, 'r-1')]
	},
	createdAt: when(1)
};

const jsonResponse = (value, status = 200) =>
	new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = async (input) => {
	const url = new URL(String(input));
	if (url.href.startsWith('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'))
		return url.searchParams.get('handle') === 'alice.test' ? jsonResponse({ did }) : jsonResponse({ error: 'not found' }, 400);
	if (url.href === `https://plc.directory/${did}`)
		return jsonResponse({
			alsoKnownAs: ['at://alice.test'],
			service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }]
		});
	if (url.href.startsWith(`${pds}/xrpc/com.atproto.repo.getRecord`))
		return url.searchParams.get('collection') === lex.COLLECTIONS.garden
			? jsonResponse({ uri: lex.atUri(did, lex.COLLECTIONS.garden, 'self'), value: garden })
			: jsonResponse({ error: 'RecordNotFound' }, 400);
	if (url.href.startsWith(`${pds}/xrpc/com.atproto.repo.listRecords`))
		return jsonResponse({ records: records[url.searchParams.get('collection')] ?? [] });
	return jsonResponse({ error: 'unexpected url ' + url.href }, 500);
};

test('a handle resolves through the appview and DID document to its PDS', async () => {
	const identity = await reader.resolveIdentity('alice.test', fakeFetch);
	assert.deepEqual(identity, { did, handle: 'alice.test', pds });
	const byDid = await reader.resolveIdentity(did, fakeFetch);
	assert.equal(byDid.did, did);
	assert.equal(await reader.resolveIdentity('not a handle', fakeFetch), null);
});

test('the manifest is the release boundary: unlisted records never render', async () => {
	const view = await reader.loadGarden('alice.test', fakeFetch);
	assert(view, 'the garden loads');
	assert.deepEqual(view.thoughts.map((t) => t.rkey), ['t-one', 't-two']);
	assert.equal(view.byRkey['t-hidden'], undefined, 'the unreleased thought is invisible');
	assert.equal(view.relations.length, 1, 'the dangling relation is dropped');
	assert.equal(view.relations[0].record.relationType, 'contradicts');
	assert.deepEqual(view.pinnedRkeys, ['t-one'], 'a pin outside the release is ignored');
});

test('revision history, current pointer, and the change log line up', async () => {
	const view = await reader.loadGarden('alice.test', fakeFetch);
	const one = view.byRkey['t-one'];
	assert.deepEqual(one.revisions.map((r) => r.rkey), ['rev-1a', 'rev-1b'], 'oldest first');
	assert.equal(one.record.currentRevision, R('rev-1b'));
	assert.equal(view.changes[0].revisionRkey, 'rev-1b', 'newest change first');
	assert.equal(view.changes[0].revision.changeNote, 'A stronger objection arrived.');
	assert.equal(view.changes[0].prev.status, 'believed', 'the replaced revision is reachable');
	const two = view.byRkey['t-two'];
	assert.deepEqual(two.revisions[0].record.authorship, { actor: 'agent', editedFromProposal: true });
});

test('the SSRF guard rejects every internal address family', () => {
	const rejected = [
		'127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
		'169.254.169.254', '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1',
		'255.255.255.255', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1',
		'::ffff:127.0.0.1', '::ffff:10.0.0.1'
	];
	for (const ip of rejected) assert.equal(reader.isPrivateAddress(ip), true, `${ip} must be rejected`);
	for (const ip of ['1.1.1.1', '8.8.8.8', '104.16.0.1', '2607:f8b0::1', '::ffff:1.1.1.1'])
		assert.equal(reader.isPrivateAddress(ip), false, `${ip} must be allowed`);
});

test('the guard judges DNS names by their addresses, not by the name', async () => {
	// The rest of this file runs with TRELLIS_GARDEN_ALLOW_PRIVATE=1, which
	// short-circuits isFetchableUrl entirely; turn the guard on to reach it.
	delete process.env.TRELLIS_GARDEN_ALLOW_PRIVATE;
	try {
		// A real hostname is not an IP literal: it must survive to the lookup.
		assert.equal(await reader.isFetchableUrl('https://plc.directory/did:plc:x'), true);
		assert.equal(await reader.isFetchableUrl('https://public.api.bsky.app/xrpc/x'), true);
		// Address literals are judged without any lookup at all.
		assert.equal(await reader.isFetchableUrl('https://127.0.0.1/x'), false);
		assert.equal(await reader.isFetchableUrl('https://169.254.169.254/latest/meta-data'), false);
		assert.equal(await reader.isFetchableUrl('https://[::1]/x'), false, 'bracketed IPv6 loopback');
		assert.equal(await reader.isFetchableUrl('https://[fd00::1]/x'), false, 'bracketed unique-local');
		// Scheme and unresolvable names stay refused.
		assert.equal(await reader.isFetchableUrl('http://plc.directory/x'), false, 'plain http');
		assert.equal(await reader.isFetchableUrl('https://nonexistent.invalid/x'), false);
	} finally {
		process.env.TRELLIS_GARDEN_ALLOW_PRIVATE = '1';
	}
});

test('a treatment written against superseded revisions reads as stale', async () => {
	const view = await reader.loadGarden('alice.test', fakeFetch);
	assert(view.treatment);
	assert.equal(view.treatment.record.title, 'The essay');
	assert.equal(view.treatment.stale, true, 'rev-1a is no longer t-one’s current revision');
});
