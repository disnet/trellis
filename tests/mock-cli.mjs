import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The npm shim Windows installs for a CLI written in JavaScript, verbatim
// apart from the entry point. Trellis unwraps this shape back to a plain Node
// process, so a mock wearing it exercises the path a real CLI arrives on.
const shim = (name) => [
  '@ECHO off',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${name}.js" %*`,
  'exit /b %errorlevel%',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ''
].join('\r\n');

/**
 * Write a stand-in for an installed CLI and return the path to launch it by.
 * A shebang carries the script on POSIX; Windows has no such thing, so the
 * code goes in a .js file behind a shim, the way npm installs one.
 */
export async function mockCli(directory, name, code) {
  if (process.platform !== 'win32') {
    const bin = join(directory, name);
    await writeFile(bin, `#!${process.execPath}\n${code}`, { mode: 0o755 });
    return bin;
  }
  await writeFile(join(directory, `${name}.js`), code);
  const bin = join(directory, `${name}.cmd`);
  await writeFile(bin, shim(name));
  return bin;
}
