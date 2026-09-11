import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const directory = await mkdtemp(join(tmpdir(), 'trellis-windows-test-'));
process.env.TRELLIS_SETTINGS = join(directory, 'settings.json');
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const { cliCommand, resolveCli } = await server.ssrLoadModule('/src/lib/server/local-agents.ts');

// Windows CLI discovery and launching are checked from any host: the module
// reads process.platform when called, so load it first and then claim Windows.
// Its path helpers stay bound to this host, so expectations stay host-shaped.
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
after(async () => {
  Object.defineProperty(process, 'platform', platform);
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

test('a native executable is launched directly, without a console window', () => {
  const bin = 'C:\\Program Files\\claude\\claude.exe';
  assert.deepEqual(cliCommand(bin, ['--version']), { file: bin, args: ['--version'], options: { windowsHide: true } });
});

test('an npm .cmd shim runs its entry point on our own Node, not through a shell', async () => {
  const entry = join(directory, 'cli.js');
  await writeFile(entry, '');
  const shim = join(directory, 'claude.cmd');
  await writeFile(shim, ['@ECHO off', 'SETLOCAL', 'CALL :find_dp0',
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\cli.js" %*'].join('\r\n'));
  const command = cliCommand(shim, ['--version']);
  assert.equal(command.file, process.execPath);
  assert.deepEqual(command.args, [entry, '--version']);
  assert.equal(command.options.windowsVerbatimArguments, undefined);
});

test('an unreadable shim falls back to cmd.exe with quoting it cannot misread', async () => {
  const shim = join(directory, 'codex.cmd');
  await writeFile(shim, '@echo off\r\n');
  const command = cliCommand(shim, ['exec', '-c', 'web_search="live"', 'a&b']);
  assert.equal(command.file, 'cmd.exe');
  assert.deepEqual(command.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(command.args[3], `""${shim}" "exec" "-c" "web_search=\\"live\\"" "a^&b""`);
  assert.equal(command.options.windowsVerbatimArguments, true);
});

test('PATH discovery skips npm\'s extensionless shell script for the shim Windows can run', async () => {
  const home = await mkdtemp(join(tmpdir(), 'trellis-windows-path-'));
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'codex'), '#!/bin/sh\n', { mode: 0o755 });
  await writeFile(join(home, 'codex.cmd'), '@echo off\r\n', { mode: 0o755 });
  process.env.PATH = home;
  // PATHEXT supplies the extension, so its casing rides along; Windows does
  // not care, and the launcher matches the extension case-insensitively.
  assert.equal(resolveCli('codex-cli').toLowerCase(), join(home, 'codex.cmd').toLowerCase());
  await rm(home, { recursive: true, force: true });
});

test('a configured Windows path is used as given, backslashes and all', () => {
  assert.equal(resolveCli('claude-cli', 'C:\\tools\\claude.exe'), 'C:\\tools\\claude.exe');
});
