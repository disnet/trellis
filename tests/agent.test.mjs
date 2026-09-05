import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

process.env.TRELLIS_DB = ':memory:';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const directory = await mkdtemp(join(tmpdir(), 'trellis-agent-test-'));
after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
const load = (path) => server.ssrLoadModule(`/src/${path}`);
const { selectAdapter } = await load('lib/server/agent/adapter.ts');
const { isModelSelection } = await load('lib/models.ts');
const { validateProposal } = await load('lib/server/agent/validate.ts');
const deps = { thoughtExists: () => true, relationExists: () => false };
const context = { thoughts: [], relations: [], selectedIds: [], scratch: { id: 's1', body: 'A test thought.' } };

test('provider selections validate and do not inherit another provider’s environment model', () => {
	process.env.TRELLIS_AGENT = 'claude-cli';
	process.env.TRELLIS_MODEL = 'opus';
	assert.equal(selectAdapter(deps).model, 'opus');
	assert.equal(selectAdapter(deps, { provider: 'codex-cli', model: '' }).model, 'default');
	assert.equal(selectAdapter(deps, { provider: 'claude-cli', model: 'haiku' }).model, 'haiku');
	assert.equal(selectAdapter(deps, { provider: 'fixture', model: '' }).name, 'fixture');
	assert.equal(isModelSelection({ provider: 'unknown', model: '' }), false);
	assert.equal(isModelSelection({ provider: 'codex-cli', model: '--dangerous' }), false);
	assert.equal(isModelSelection({ provider: 'codex-cli', model: 'custom-model' }), true);
});

test('Codex uses isolated structured output, normalizes nullable revisions, and cleans up', async () => {
	const bin = join(directory, 'mock-codex');
	await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
assert.equal(args[0], 'exec');
assert.equal(flag('--sandbox'), 'read-only');
assert.equal(flag('--model'), 'test-model');
assert(args.includes('--ignore-user-config'));
assert(args.includes('--ephemeral'));
const schema = JSON.parse(fs.readFileSync(flag('--output-schema'), 'utf8'));
function check(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    assert.equal(node.additionalProperties, false);
    assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
  }
  Object.values(node).forEach(check);
}
check(schema);
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  assert(input.includes('A test thought.'));
  assert(input.includes('Fix the title'));
  fs.writeFileSync(${JSON.stringify(join(directory, 'cwd'))}, process.cwd());
  fs.writeFileSync(flag('--output-last-message'), JSON.stringify({ summary: 'Refined the claim.', operations: [{
    op: 'revise_thought', client_ref: 'r1', depends_on: [], evidence_refs: ['t1'], rationale: 'Clarify.',
    thought_id: 't1', thought: { title: 'Better title', type: null, status: null, statement: null, confidence: null, source: null }
  }] }));
});
`, { mode: 0o755 });
	process.env.TRELLIS_CODEX_BIN = bin;
	const adapter = selectAdapter(deps, { provider: 'codex-cli', model: 'test-model' });
	const result = await adapter.generate({ action: 'develop', context, feedback: { raw: '{}', errors: ['Fix the title'] } });
	assert.deepEqual(result.proposal.operations[0].thought, { title: 'Better title' });
	assert.equal(validateProposal(result.proposal, deps).ok, true);
	const { readFile } = await import('node:fs/promises');
	await assert.rejects(access(await readFile(join(directory, 'cwd'), 'utf8')));
});

test('missing Codex executable gives an actionable error', async () => {
	process.env.TRELLIS_CODEX_BIN = join(directory, 'missing');
	await assert.rejects(selectAdapter(deps, { provider: 'codex-cli', model: '' }).generate({ action: 'decompose', context }), /not found.*codex login/);
});

test('invoke endpoint rejects invalid selection before capturing scratch', async () => {
	const { POST } = await load('routes/api/invoke/+server.ts');
	const response = await POST({ request: new Request('http://localhost/api/invoke', {
		method: 'POST', body: JSON.stringify({ action: 'decompose', scratchBody: 'Test', selection: { provider: 'bad', model: '' } })
	}) });
	assert.equal(response.status, 400);
});

test('malformed Codex output gets corrective retry and logs selected model without changing graph', async () => {
	const { getState } = await load('lib/server/store.ts');
	const { generateProposal } = await load('lib/server/agent/index.ts');
	const { db } = await load('lib/server/db.ts');
	const before = getState();
	const thoughtId = Object.keys(before.thoughts)[0];
	assert(thoughtId);
	const bin = join(directory, 'retry-codex');
	const counter = join(directory, 'attempt');
	const valid = { summary: 'Refined the claim.', operations: [{
		op: 'revise_thought', client_ref: 'r1', depends_on: [], evidence_refs: [thoughtId], rationale: 'Clarify.',
		thought_id: thoughtId, thought: { title: 'Clearer title', type: null, status: null, statement: null, confidence: null, source: null }
	}] };
	await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const counter = ${JSON.stringify(counter)};
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  const retry = fs.existsSync(counter);
  if (retry && !input.includes('Validation errors:')) process.exit(9);
  fs.writeFileSync(counter, '1');
  fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], retry ? ${JSON.stringify(JSON.stringify(valid))} : 'not JSON');
});
`, { mode: 0o755 });
	process.env.TRELLIS_CODEX_BIN = bin;
	const result = await generateProposal('develop', [thoughtId], undefined, { provider: 'codex-cli', model: 'retry-model' });
	assert.equal(result.ok, true);
	assert.deepEqual(getState().thoughts, before.thoughts);
	assert.deepEqual(getState().pendingChangeSets, before.pendingChangeSets);
	const calls = db.prepare('SELECT model, attempt, validation_errors FROM agent_calls WHERE model = ? ORDER BY attempt').all('retry-model');
	assert.equal(calls.length, 2);
	assert(calls[0].validation_errors);
	assert.equal(calls[1].validation_errors, null);
});

test('Codex nonzero exit is surfaced even if it wrote output', async () => {
	const bin = join(directory, 'failed-codex');
	await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '{}');
console.error('Please run codex login');
process.exit(1);
`, { mode: 0o755 });
	process.env.TRELLIS_CODEX_BIN = bin;
	await assert.rejects(selectAdapter(deps, { provider: 'codex-cli', model: '' }).generate({ action: 'decompose', context }), /code 1.*codex login/);
});
