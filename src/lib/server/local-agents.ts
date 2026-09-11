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

const isWindows = () => process.platform === 'win32';

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
// Windows environment names are case-insensitive, but a copy of process.env
// keeps the casing the OS gave them, so PATH usually arrives spelled "Path".
// Read whichever spelling is there and hand back a single PATH.
function pathEntries(environment: NodeJS.ProcessEnv): [string, string | undefined][] {
  return Object.entries(environment).filter(([name]) => name.toLowerCase() === 'path');
}
export function cliEnvironment(): NodeJS.ProcessEnv {
  const home = homedir();
  const environment = { ...process.env, ...(process.env.TRELLIS_DESKTOP ? getShellEnvironment() : {}) };
  const current = pathEntries(environment).pop()?.[1] ?? '';
  const dirs = [dirname(process.execPath), ...current.split(delimiter),
    join(home, '.local/bin'), join(home, '.npm-global/bin'), join(home, '.volta/bin'),
    ...(isWindows() ? [join(environment.APPDATA ?? home, 'npm')]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'])];
  const nvm = join(home, '.nvm/versions/node');
  if (existsSync(nvm)) for (const version of readdirSync(nvm).sort().reverse()) dirs.push(join(nvm, version, 'bin'));
  const withoutPath = Object.fromEntries(Object.entries(environment).filter(([name]) => name.toLowerCase() !== 'path'));
  return { ...withoutPath, PATH: [...new Set(dirs.filter(Boolean))].join(delimiter) };
}
// Windows resolves a bare command name through PATHEXT, and npm installs an
// extensionless shell script beside its .cmd shim, so only extension matches
// are executable there.
function executableNames(name: string): string[] {
  if (!isWindows()) return [name];
  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  if (extensions.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()))) return [name];
  // PATHEXT is spelled in capitals while npm writes its shims in lower case,
  // which Windows itself ignores but a case-sensitive volume does not.
  return [...new Set(extensions.flatMap(ext => [name + ext.toLowerCase(), name + ext]))];
}
export function resolveCli(provider: LocalProvider, override?: string): string {
  const command = provider === 'claude-cli' ? 'claude' : 'codex';
  const env = provider === 'claude-cli' ? process.env.TRELLIS_CLAUDE_BIN : process.env.TRELLIS_CODEX_BIN;
  const configured = override === undefined
    ? (readLocalSettings().paths[provider] ?? env ?? '')
    : (override || env || '');
  const bin = configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured;
  if (bin && (isAbsolute(bin) || bin.includes('/') || (isWindows() && bin.includes('\\')))) return bin;
  for (const directory of cliEnvironment().PATH!.split(delimiter)) {
    for (const name of executableNames(bin || command)) {
      const candidate = join(directory, name);
      try { accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return candidate; } catch { /* Continue discovery. */ }
    }
  }
  return bin || command;
}

/** The JS entry point an npm-generated .cmd shim hands to Node, if it is one. */
function npmShimEntry(shim: string): string | undefined {
  try {
    const match = readFileSync(shim, 'utf8').match(/"%_prog%"\s+"%dp0%\\([^"]+)"/);
    if (!match) return undefined;
    const entry = join(dirname(shim), match[1]);
    return statSync(entry).isFile() ? entry : undefined;
  } catch { return undefined; }
}

export interface CliCommand {
  file: string;
  args: string[];
  options: { windowsHide: boolean; windowsVerbatimArguments?: boolean };
}
/**
 * How to launch a resolved CLI. Node refuses to spawn a .cmd or .bat shim
 * directly, and npm ships its CLIs as one. Those shims are a thin wrapper
 * around a JS entry point, so run that with our own Node — which also keeps
 * kill and timeout handling pointed at the real process. Only when the shim is
 * unreadable do we fall back to cmd.exe, escaping arguments as it parses them.
 */
export function cliCommand(bin: string, args: string[]): CliCommand {
  if (!isWindows() || !/\.(cmd|bat)$/i.test(bin)) return { file: bin, args, options: { windowsHide: true } };
  const entry = npmShimEntry(bin);
  if (entry) return { file: process.execPath, args: [entry, ...args], options: { windowsHide: true } };
  const line = [bin, ...args].map(escapeForCmd).join(' ');
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], options: { windowsHide: true, windowsVerbatimArguments: true } };
}
// Quote for CreateProcess, then escape what cmd.exe reads before that. %VAR%
// still expands, so this path suits short flags rather than arbitrary prose.
function escapeForCmd(value: string): string {
  const quoted = `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
  return quoted.replace(/[><!^&|]/g, '^$&');
}
function run(bin: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const command = cliCommand(bin, args);
    trackCli(execFile(command.file, command.args, { cwd: tmpdir(), env: cliEnvironment(), timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, ...command.options }, (error, stdout, stderr) => {
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
