import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'trellis-origin-test-'));
process.env.TRELLIS_SETTINGS = join(directory, 'settings.json');
process.env.TRELLIS_DB = ':memory:';
// A shell's unrelated origin must not override the desktop listener.
process.env.ORIGIN = 'https://unrelated.example';
const { loadDesktopHandler } = await import('../src-tauri/runtime/desktop-handler.mjs');
const origin = 'http://127.0.0.1:43219';
const handler = await loadDesktopHandler(origin);
after(() => rm(directory, { recursive: true, force: true }));

// Exercise the actual packaged Node adapter without binding a network socket.
async function request(body, requestOrigin = origin, extraHeaders = {}) {
  const chunks = [];
  const socket = new Duplex({ read() {}, write(chunk, _, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  const req = new IncomingMessage(socket);
  req.complete = true;
  req.method = 'POST'; req.url = '/api/local-agents'; req.httpVersion = '1.1';
  const payload = JSON.stringify(body);
  req.headers = { host: new URL(origin).host, origin: requestOrigin, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)), ...extraHeaders };
  req.push(payload); req.push(null);
  const res = new ServerResponse(req);
  res.assignSocket(socket);
  const finished = once(res, 'finish', { signal: AbortSignal.timeout(5000) });
  handler(req, res);
  await finished;
  socket.destroy();
  return { status: res.statusCode, raw: Buffer.concat(chunks).toString() };
}

test('packaged adapter accepts setup load and save from its HTTP launch origin', async () => {
  assert.equal((await request({ action: 'load' })).status, 200);
  const selection = { provider: 'codex-cli', model: '' };
  assert.equal((await request({ action: 'selection', selection })).status, 200);
  const loaded = await request({ action: 'load' });
  assert(loaded.raw.includes('codex-cli'));
});
test('packaged adapter still rejects foreign origins, including the wrong scheme or port', async () => {
  for (const foreign of ['https://example.com', 'https://127.0.0.1:43219', 'http://127.0.0.1:43220', 'null']) {
    assert.equal((await request({ action: 'load' }, foreign)).status, 403);
  }
  assert.equal((await request({ action: 'load' }, origin, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.com' })).status, 200);
});
