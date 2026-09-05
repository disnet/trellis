import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
const directory = await mkdtemp(join(tmpdir(), 'trellis-setup-test-'));
process.env.TRELLIS_SETTINGS = join(directory, 'settings.json');
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
const { POST } = await server.ssrLoadModule('/src/routes/api/local-agents/+server.ts');
const { resolveCli, inspectCli } = await server.ssrLoadModule('/src/lib/server/local-agents.ts');
const { defaultSelection } = await server.ssrLoadModule('/src/lib/server/agent/settings.ts');
function request(body, origin = 'http://localhost', contentType = 'application/json') {
  const url = new URL('http://localhost/api/local-agents');
  return POST({ url, request: new Request(url, { method: 'POST', headers: { origin, 'content-type': contentType }, body: JSON.stringify(body) }) });
}
async function mock(name, code) {
  const bin = join(directory, name);
  await writeFile(bin, `#!${process.execPath}\n${code}`, { mode: 0o755 });
  return bin;
}
test('settings endpoint rejects cross-origin requests and invalid paths without running executables', async () => {
  assert.equal((await request({ action: 'load' }, 'https://example.com')).status, 403);
  assert.equal((await request({ action: 'load' }, 'http://localhost', 'text/plain')).status, 403);
  assert.equal((await request({ action: 'check', provider: 'codex-cli', path: '--help' })).status, 400);
  assert.equal((await request({ action: 'selection', selection: { provider: 'bad', model: '' } })).status, 400);
});
test('custom executable paths persist and are used by adapters; auth output stays private', async () => {
  const bin = await mock('codex with spaces', `if (process.argv[2] === '--version') console.log('codex test'); else console.log('SECRET ACCOUNT');`);
  const response = await request({ action: 'save', provider: 'codex-cli', path: bin });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.status, 'ready');
  assert(!JSON.stringify(status).includes('SECRET'));
  assert.equal(resolveCli('codex-cli'), bin);
  assert.equal(JSON.parse(await readFile(process.env.TRELLIS_SETTINGS, 'utf8')).paths['codex-cli'], bin);
  const reset = await request({ action: 'save', provider: 'codex-cli', path: '' });
  assert.equal(reset.status, 200);
  assert.notEqual(resolveCli('codex-cli'), bin);
});
test('missing and signed-out CLIs have distinct actionable statuses', async () => {
  assert.equal((await inspectCli('codex-cli', join(directory, 'missing'))).status, 'missing');
  const bin = await mock('claude', `if (process.argv[2] === '--version') console.log('claude test'); else { console.log('{"loggedIn":false}'); process.exit(1); }`);
  assert.equal((await inspectCli('claude-cli', bin)).status, 'signed-out');
});
test('desktop model selection survives launch origins and settings changes', async () => {
  process.env.TRELLIS_DESKTOP = '1';
  assert.equal(defaultSelection().provider, 'fixture');
  const selection = { provider: 'codex-cli', model: 'my-model' };
  assert.equal((await request({ action: 'selection', selection })).status, 200);
  assert.deepEqual(defaultSelection(), selection);
  delete process.env.TRELLIS_DESKTOP;
});

test('Finder-launched Claude checks and generation use shell credentials without persisting them', async () => {
  const shellModule = await server.ssrLoadModule('/src/lib/server/shell-environment.ts');
  const secret = 'test-only-oauth-value';
  assert.deepEqual(shellModule.parseShellEnvironment(`Welcome\n\0CLAUDE_CODE_OAUTH_TOKEN=${secret}\0PATH=/custom/bin\0HOME=/wrong\0NODE_OPTIONS=--inspect\0UNRELATED_SECRET=private\0`),
    { CLAUDE_CODE_OAUTH_TOKEN: secret, PATH: '/custom/bin' });
  if (process.platform !== 'darwin') return;
  const previous = { shell: process.env.SHELL, desktop: process.env.TRELLIS_DESKTOP, token: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  const shell = await mock('mock-login-shell', `process.stdout.write('\\0CLAUDE_CODE_OAUTH_TOKEN=${secret}\\0');`);
  const bin = await mock('shell-auth-claude', `
if (process.argv[2] === '--version') console.log('claude test');
else if (process.argv[2] === 'auth') {
  const loggedIn = process.env.CLAUDE_CODE_OAUTH_TOKEN === '${secret}';
  console.log(JSON.stringify({ loggedIn })); process.exit(loggedIn ? 0 : 1);
} else {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN !== '${secret}') process.exit(9);
  process.stdin.resume();
  process.stdin.on('end', () => console.log(JSON.stringify({ structured_output: { summary: 'Authenticated', operations: [] } })));
}`);
  try {
    process.env.TRELLIS_DESKTOP = '1'; process.env.SHELL = shell;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const response = await request({ action: 'save', provider: 'claude-cli', path: bin });
    const status = await response.json();
    assert.equal(status.status, 'ready');
    assert(!JSON.stringify(status).includes(secret));
    assert(!(await readFile(process.env.TRELLIS_SETTINGS, 'utf8')).includes(secret));
    assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    const { makeClaudeCliAdapter } = await server.ssrLoadModule('/src/lib/server/agent/claude-cli.ts');
    const generated = await makeClaudeCliAdapter().generate({ action: 'decompose', context: { thoughts: [], relations: [], selectedIds: [], scratch: { id: 's1', body: 'Test.' } } });
    assert.equal(generated.proposal.summary, 'Authenticated');
    await writeFile(shell, `#!${process.execPath}\nprocess.stdout.write('\\0CLAUDE_CODE_OAUTH_TOKEN=changed\\0');`);
    assert.equal((await inspectCli('claude-cli', bin)).status, 'signed-out');
  } finally {
    for (const [key, value] of [['SHELL', previous.shell], ['TRELLIS_DESKTOP', previous.desktop], ['CLAUDE_CODE_OAUTH_TOKEN', previous.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('shell startup failures never expose captured credentials', async () => {
  const { readShellEnvironment } = await server.ssrLoadModule('/src/lib/server/shell-environment.ts');
  const shell = await mock('broken-shell', `console.error('private-token-value'); process.exit(1);`);
  await assert.rejects(readShellEnvironment(shell), error => {
    assert(!String(error).includes('private-token-value'));
    return /terminal environment/.test(error.message);
  });
});
