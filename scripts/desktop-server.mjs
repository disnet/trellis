import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadDesktopHandler } from './desktop-handler.mjs';

let handler;

// Only this launch's webview receives the session cookie. No unauthenticated API.
const token = randomBytes(32).toString('hex');
const cookieName = `trellis_${token.slice(0, 12)}`;
const server = createServer((req, res) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403).end('Forbidden'); return;
  }
  if (req.url === `/__desktop/${token}` && req.method === 'GET') {
    res.writeHead(303, { 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`, Location: '/', 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (!req.headers.cookie?.split(';').some(c => c.trim() === `${cookieName}=${token}`)) {
    res.writeHead(403).end('Open Trellis from the desktop app.'); return;
  }
  if (!handler) { res.writeHead(503).end('Trellis is starting.'); return; }
  handler(req, res);
});
server.listen(0, '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    handler = await loadDesktopHandler(origin);
    console.log(`TRELLIS_READY ${origin}/__desktop/${token}`);
  } catch (error) {
    console.error('Could not initialize the Trellis server:', error);
    process.exit(1);
  }
});
// Closing the parent's pipe also handles a crashed desktop process.
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
