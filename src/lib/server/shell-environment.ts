import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute } from 'node:path';

// Finder does not load shell startup files. Import only CLI configuration,
// authentication and connection settings; never persist or log their values.
const ALLOWED = new Set([
  'PATH', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CODEX_HOME', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS'
]);

export function parseShellEnvironment(output: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const entry of output.split('\0')) {
    const equals = entry.indexOf('=');
    const name = entry.slice(0, equals);
    if (equals > 0 && ALLOWED.has(name)) environment[name] = entry.slice(equals + 1);
  }
  return environment;
}

export async function readShellEnvironment(shell = process.env.SHELL || '/bin/zsh'): Promise<NodeJS.ProcessEnv> {
  if (!isAbsolute(shell)) throw new Error('The login shell path must be absolute.');
  return new Promise((resolve, reject) => {
    execFile(shell, ['-ilc', "printf '\\0'; exec /usr/bin/env -0"], {
      cwd: homedir(), env: process.env, timeout: 8000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024
    }, (error, stdout) => {
      // execFile errors can contain stdout/stderr, including exported secrets.
      if (error) reject(new Error('Could not load the terminal environment. Check your shell startup files and try again.'));
      else resolve(parseShellEnvironment(stdout));
    });
  });
}

let cached: NodeJS.ProcessEnv = {};
let loadedAt = 0;
let warning: string | undefined;
let inFlight: Promise<void> | undefined;
export function getShellEnvironment(): NodeJS.ProcessEnv { return cached; }
export function getShellEnvironmentWarning(): string | undefined { return warning; }
export async function prepareCliEnvironment(refresh = false): Promise<void> {
  if (!process.env.TRELLIS_DESKTOP || process.platform !== 'darwin') return;
  if (inFlight) return inFlight;
  if (!refresh && Date.now() - loadedAt < 30_000) return;
  inFlight = readShellEnvironment().then(environment => {
    cached = environment;
    warning = undefined;
    loadedAt = Date.now();
  }).catch(() => {
    cached = {};
    warning = 'Could not load terminal settings. Check your shell startup files, then choose Check again.';
  }).finally(() => { inFlight = undefined; });
  return inFlight;
}
