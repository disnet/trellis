import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { mockCli } from './mock-cli.mjs';

const directory = await mkdtemp(join(tmpdir(), 'trellis-windows-test-'));
process.env.TRELLIS_SETTINGS = join(directory, 'settings.json');
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const { cliCommand, cliEnvironment, resolveCli } = await server.ssrLoadModule('/src/lib/server/local-agents.ts');

// Windows CLI discovery and launching are checked from any host: the module
// reads process.platform when called, so load it first and then claim Windows.
// Its path helpers stay bound to this host, so expectations stay host-shaped.
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
const path = process.env.PATH;
const pathext = process.env.PATHEXT;
after(async () => {
  Object.defineProperty(process, 'platform', platform);
  delete process.env.Path;
  process.env.PATH = path;
  if (pathext === undefined) delete process.env.PATHEXT; else process.env.PATHEXT = pathext;
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

test('a native executable is launched directly, without a console window', () => {
  const bin = 'C:\\Program Files\\claude\\claude.exe';
  assert.deepEqual(cliCommand(bin, ['--version']), { file: bin, args: ['--version'], options: { windowsHide: true } });
});

test('an npm .cmd shim runs its entry point on our own Node, not through a shell', async () => {
  // Via the shared mock, so the shim the other suites install stays one the
  // launcher can still take apart.
  const shim = await mockCli(directory, 'claude', "console.log('mock');");
  const command = cliCommand(shim, ['--version']);
  assert.equal(command.file, process.execPath);
  assert.deepEqual(command.args, [join(directory, 'claude.js'), '--version']);
  assert.equal(command.options.windowsVerbatimArguments, undefined);
});

// The unwrapped form is a plain Node invocation, so it runs anywhere: this
// covers the whole chain the other suites lean on under Windows, short of
// cmd.exe itself — shim written, parsed, and arguments delivered intact.
test('launching the unwrapped shim reaches the CLI with its arguments whole', async () => {
  const shim = await mockCli(directory, 'runnable', 'console.log(JSON.stringify(process.argv.slice(2)));');
  const command = cliCommand(shim, ['--version', 'two words', 'quote"and\\slash']);
  const { stdout } = await promisify(execFile)(command.file, command.args, command.options);
  assert.deepEqual(JSON.parse(stdout), ['--version', 'two words', 'quote"and\\slash']);
});

// Claude Code ships a native binary, so its shim calls the .exe rather than
// Node. Reading that target out is what keeps whole system prompts and JSON
// schemas off a cmd.exe command line, which caps at 8191 characters.
test('a .cmd shim around a native binary launches that binary directly', async () => {
  const nested = join(directory, 'native-bin');
  await mkdir(nested, { recursive: true });
  const exe = join(nested, 'claude.exe');
  await writeFile(exe, '');
  const shim = join(directory, 'native.cmd');
  await writeFile(shim, ['@ECHO off', 'SETLOCAL', 'CALL :find_dp0',
    '"%dp0%\\native-bin\\claude.exe"   %*', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ''].join('\r\n'));
  const command = cliCommand(shim, ['-p', '--system-prompt', 'x'.repeat(9000)]);
  assert.equal(command.file, exe);
  assert.deepEqual(command.args, ['-p', '--system-prompt', 'x'.repeat(9000)]);
  assert.equal(command.options.windowsVerbatimArguments, undefined);
});

// The fallback silently truncates past cmd.exe's limit and reports only "The
// command line is too long", naming neither the argument nor the shell.
test('an argument too long for the cmd.exe fallback is refused by name', async () => {
  const shim = join(directory, 'opaque.cmd');
  await writeFile(shim, '@echo off\r\n');
  assert.throws(() => cliCommand(shim, ['--system-prompt', 'x'.repeat(9000)]),
    (error) => error.message.includes(shim) && /too long/.test(error.message));
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
  // PATHEXT is spelled in capitals and npm writes its shims in lower case.
  // Windows does not care, so the launcher must not either.
  process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
  assert.equal(resolveCli('codex-cli'), join(home, 'codex.cmd'));
  await rm(home, { recursive: true, force: true });
});

// Windows spells the variable "Path", and a copy of process.env keeps that
// spelling even though the OS looks it up case-insensitively, so discovery has
// to accept it. Here the lower-case name really is a separate variable, which
// is exactly the shape the copy has on Windows.
test('discovery reads the search path under the spelling Windows gives it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'trellis-windows-path-'));
  await writeFile(join(home, 'codex.cmd'), '@echo off\r\n', { mode: 0o755 });
  delete process.env.PATH;
  process.env.Path = home;
  assert.ok(cliEnvironment().PATH.split(delimiter).includes(home));
  assert.equal(resolveCli('codex-cli').toLowerCase(), join(home, 'codex.cmd').toLowerCase());
  // One spelling goes out to the CLI, so it cannot inherit a stale search path.
  assert.equal(Object.keys(cliEnvironment()).filter(name => name.toLowerCase() === 'path').length, 1);
  await rm(home, { recursive: true, force: true });
});

test('a configured Windows path is used as given, backslashes and all', () => {
  assert.equal(resolveCli('claude-cli', 'C:\\tools\\claude.exe'), 'C:\\tools\\claude.exe');
});
