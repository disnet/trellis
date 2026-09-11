import { json } from '@sveltejs/kit';
import { isAbsolute } from 'node:path';
import { isModelSelection } from '$lib/models';
import { inspectCli, readLocalSettings, saveLocalSettings } from '$lib/server/local-agents';
import type { RequestHandler } from './$types';

// These routes can execute a user-selected local binary. Require a same-origin,
// loopback request even in web development (desktop has session auth as well).
function allowed(request: Request, url: URL) {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    request.headers.get('origin') === url.origin &&
    request.headers.get('content-type')?.split(';')[0] === 'application/json';
}
export const POST: RequestHandler = async ({ request, url }) => {
  if (!allowed(request, url)) return json({ error: 'Local agent setup requires a same-origin local request.' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body || !['load', 'check', 'save', 'selection'].includes(body.action)) return json({ error: 'Unknown action.' }, { status: 400 });
  try {
    const settings = readLocalSettings();
    if (body.action === 'load') return json(settings);
    if (body.action === 'selection') {
      if (!isModelSelection(body.selection)) return json({ error: 'Invalid model selection.' }, { status: 400 });
      saveLocalSettings({ ...settings, selection: body.selection });
      return json({ ok: true });
    }
    if (!['claude-cli', 'codex-cli'].includes(body.provider) || typeof body.path !== 'string' ||
        body.path.length > 4096 || /[\x00-\x1f]/.test(body.path) ||
        (body.path && !body.path.startsWith('~/') && !isAbsolute(body.path))) {
      return json({ error: 'Enter an absolute executable path, or leave it blank for automatic detection.' }, { status: 400 });
    }
    const provider = body.provider as 'claude-cli' | 'codex-cli';
    if (body.action === 'save') {
      const paths = { ...settings.paths };
      if (body.path) paths[provider] = body.path; else delete paths[provider];
      saveLocalSettings({ ...settings, paths });
    }
    return json(await inspectCli(provider, body.path));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Local settings could not be updated.' }, { status: 500 });
  }
};
