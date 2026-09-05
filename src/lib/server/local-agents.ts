import { execFile, type ChildProcess } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { getShellEnvironment, getShellEnvironmentWarning, prepareCliEnvironment } from './shell-environment';
export { prepareCliEnvironment } from './shell-environment';
import { isModelSelection, type ModelSelection } from '$lib/models';

// Keep CLI processes tied to the desktop server's lifetime.
const children = new Set<ChildProcess>();
process.once('exit', () => { for (const child of children) child.kill('SIGKILL'); });
export function trackCli<T extends ChildProcess>(child: T): T {
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}

export type LocalProvider = 'claude-cli' | 'codex-cli';
interface LocalSettings { paths: Partial<Record<LocalProvider, string>>; selection?: ModelSelection }
const settingsPath = () => process.env.TRELLIS_SETTINGS ?? resolve('data/settings.json');
export function readLocalSettings(): LocalSettings {
  try {
    const value = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    return { paths: Object.fromEntries(['claude-cli', 'codex-cli'].flatMap(k =>
      typeof value.paths?.[k] === 'string' ? [[k, value.paths[k]]] : [])),
      ...(isModelSelection(value.selection) ? { selection: value.selection } : {}) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { paths: {} };
    throw new Error('Could not read local agent settings. Check settings.json in the Trellis data directory.');
  }
}
export function saveLocalSettings(value: LocalSettings) {
  const file = settingsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export function cliEnvironment(): NodeJS.ProcessEnv {
  const home = homedir();
  const environment = { ...process.env, ...(process.env.TRELLIS_DESKTOP ? getShellEnvironment() : {}) };
  const dirs = [dirname(process.execPath), ...(environment.PATH ?? '').split(delimiter),
    join(home, '.local/bin'), join(home, '.npm-global/bin'), join(home, '.volta/bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  const nvm = join(home, '.nvm/versions/node');
  if (existsSync(nvm)) for (const version of readdirSync(nvm).sort().reverse()) dirs.push(join(nvm, version, 'bin'));
  return { ...environment, PATH: [...new Set(dirs.filter(Boolean))].join(delimiter) };
}
export function resolveCli(provider: LocalProvider, override?: string): string {
  const command = provider === 'claude-cli' ? 'claude' : 'codex';
  const env = provider === 'claude-cli' ? process.env.TRELLIS_CLAUDE_BIN : process.env.TRELLIS_CODEX_BIN;
  const configured = override === undefined
    ? (readLocalSettings().paths[provider] ?? env ?? '')
    : (override || env || '');
  const bin = configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured;
  if (bin && (isAbsolute(bin) || bin.includes('/'))) return bin;
  for (const directory of cliEnvironment().PATH!.split(delimiter)) {
    const candidate = join(directory, bin || command);
    try { accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return candidate; } catch { /* Continue discovery. */ }
  }
  return bin || command;
}
function run(bin: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    trackCli(execFile(bin, args, { cwd: tmpdir(), env: cliEnvironment(), timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== 'number' || error.killed)) return reject(error);
      resolve({ code: typeof error?.code === 'number' ? error.code : 0, output: stdout || stderr });
    }));
  });
}
export async function inspectCli(provider: LocalProvider, override?: string) {
  let bin = resolveCli(provider, override);
  try {
    await prepareCliEnvironment(true);
    bin = resolveCli(provider, override);
    const version = await run(bin, ['--version']);
    if (version.code !== 0) return { bin, status: 'error', message: 'Could not run this executable. Check its path and installation.' };
    const auth = await run(bin, provider === 'claude-cli' ? ['auth', 'status', '--json'] : ['login', 'status']);
    let signedIn = auth.code === 0;
    if (provider === 'claude-cli') {
      try { signedIn = signedIn && JSON.parse(auth.output).loggedIn === true; }
      catch { return { bin, status: 'error', message: 'Could not read sign-in status. Update Claude Code and check again.' }; }
    }
    // Never return CLI auth output: it may contain account identifiers or credentials.
    return { bin, version: version.output.trim().slice(0, 120), status: signedIn ? 'ready' : 'signed-out',
      message: signedIn ? 'Signed in. Ready for agent operations.' : (getShellEnvironmentWarning() ?? 'No credentials were found for this CLI. Sign in from your terminal, then check again.') };
  } catch (error) {
    return { bin, status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error',
      message: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'CLI not found. Install it or enter its full path.' : 'The CLI check failed or timed out. Check the executable and try again.' };
  }
}
