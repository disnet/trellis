import { cp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'src-tauri/runtime');
// Copy installed production dependencies, including the native SQLite addon.
// Use the exact same Node runtime to keep its ABI aligned with the addon.
const packages = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' }).trim().split('\n').slice(1);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, 'build'), resolve(out, 'build'), { recursive: true });
await cp(resolve(root, 'scripts/desktop-server.mjs'), resolve(out, 'server.mjs'));
await cp(resolve(root, 'scripts/desktop-handler.mjs'), resolve(out, 'desktop-handler.mjs'));
await writeFile(resolve(out, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
for (const pkg of packages) {
  const destination = resolve(out, relative(root, pkg));
  if (!destination.startsWith(out + '/') || !pkg.startsWith(resolve(root, 'node_modules') + '/')) throw new Error(`Unsupported dependency path: ${pkg}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(pkg, destination, { recursive: true, dereference: true });
}
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
await cp(process.execPath, resolve(out, nodeName));
await chmod(resolve(out, nodeName), 0o755);
const license = [process.env.TRELLIS_NODE_LICENSE, resolve(dirname(process.execPath), '../LICENSE'), resolve(dirname(process.execPath), '../share/doc/node/LICENSE')].find(p => p && existsSync(p));
if (!license) throw new Error('Node LICENSE not found. Use the official Node distribution or set TRELLIS_NODE_LICENSE to its license file.');
await cp(license, resolve(out, 'NODE-LICENSE.txt'));
execFileSync(resolve(out, nodeName), ['--input-type=module', '-e', "import Database from 'better-sqlite3'; new Database(':memory:').close()"], { cwd: out, stdio: 'inherit' });
console.log(`Desktop runtime prepared for ${process.platform}/${process.arch}.`);
