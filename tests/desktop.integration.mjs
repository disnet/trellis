import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

// Explicit packaged-runtime integration test; run after desktop:prepare.
test('packaged backend boots, protects its API, persists data, and exits with its parent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trellis-desktop-test-'));
  const runtime = resolve('src-tauri/runtime');
  let child;
  async function launch() {
    child = spawn(join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), [join(runtime, 'server.mjs')], {
      cwd: directory, env: { ...process.env, TRELLIS_DB: join(directory, 'trellis.db'), TRELLIS_SETTINGS: join(directory, 'settings.json'), TRELLIS_DESKTOP: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timeout: ${output}`)), 15000);
      child.stderr.on('data', c => output += c);
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
      child.stdout.on('data', c => {
        output += c;
        const match = output.match(/TRELLIS_READY (http:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(new URL(match[1])); }
      });
    });
    const origin = url.origin;
    assert.equal((await fetch(`${origin}/api/state`)).status, 403);
    const boot = await fetch(url, { redirect: 'manual' });
    assert.equal(boot.status, 303);
    const cookie = boot.headers.get('set-cookie').split(';')[0];
    assert(boot.headers.get('set-cookie').includes('HttpOnly'));
    const headers = { cookie, origin, 'content-type': 'application/json' };
    return { origin, headers };
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.stdin.end();
    await exited;
  }
  try {
    let { origin, headers } = await launch();
    assert.equal((await fetch(`${origin}/api/state`, { headers: { ...headers, origin: 'https://example.com' } })).status, 403);
    // The OAuth redirect arrives from the system browser that showed the
    // authorization page: no cookie, and no Origin, since it is a cross-site
    // GET navigation. It has to reach the app, or the sign-in dies on the
    // doorstep with its authorization code already spent. Nothing else does.
    const callback = await fetch(`${origin}/oauth/callback?code=nope&state=nope`, { redirect: 'manual' });
    assert.notEqual(callback.status, 403, 'the OAuth redirect is not turned away');
    assert.match(await callback.text(), /Sign-in failed/, 'a bogus code is refused by OAuth itself');
    assert.equal((await fetch(`${origin}/oauth/callback`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${origin}/publish`)).status, 403);
    const state = await (await fetch(`${origin}/api/state`, { headers })).json();
    assert.equal(state.desktop, true);
    assert(Object.keys(state.state.thoughts).length > 0);
    const selected = { provider: 'fixture', model: '' };
    assert.equal((await fetch(`${origin}/api/local-agents`, { method: 'POST', headers, body: JSON.stringify({ action: 'selection', selection: selected }) })).status, 200);
    assert.equal((await fetch(origin, { headers })).status, 200);
    await stop();
    ({ origin, headers } = await launch());
    const next = await (await fetch(`${origin}/api/state`, { headers })).json();
    assert.deepEqual(next.modelSelection, selected);
    assert.deepEqual(next.state.thoughts, state.state.thoughts);
    await stop();
  } finally {
    child?.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
