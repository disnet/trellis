#!/usr/bin/env node
// Eval harness: runs the decompose matrix (model × effort) against a Trellis
// server and exports each run's graph, mirroring the manual flow (graph →
// canvas note → invoke → export). By default it spawns its own dev server on
// an isolated scratch database so eval runs never touch data/trellis.db.
//
//   node evals/run.mjs                         # full default matrix
//   node evals/run.mjs --cases fable,sol --efforts high
//   node evals/run.mjs --input "https://..."   # different source input
//   node evals/run.mjs --server http://localhost:5173   # reuse a running server
//
// Results land in evals/runs/<timestamp>/: one export JSON per case (same
// shape as the UI's export) plus summary.json with latency and usage from the
// agent_calls log. The comparison table also prints; re-print or diff runs
// later with evals/report.mjs.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { report } from './report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CASES = {
	fable: { provider: 'claude-cli', model: 'fable' },
	sonnet: { provider: 'claude-cli', model: 'sonnet' },
	astra: { provider: 'codex-cli', model: 'gpt-6-astra' },
	sol: { provider: 'codex-cli', model: 'gpt-5.6-sol' },
	// Offline provider for smoke-testing the harness itself; not in the
	// default matrix. Usage: --cases fixture
	fixture: { provider: 'fixture', model: '' }
};
const DEFAULT_CASES = Object.keys(CASES).filter((c) => c !== 'fixture');
const DEFAULT_EFFORTS = ['low', 'high'];
const DEFAULT_INPUT = 'https://openai.com/index/an-alien-mind/';
const PORT = 5199;

function parseArgs(argv) {
	const args = { cases: DEFAULT_CASES, efforts: DEFAULT_EFFORTS, input: DEFAULT_INPUT };
	for (let i = 0; i < argv.length; i++) {
		const [flag, inline] = argv[i].split(/=(.*)/s);
		const value = () => inline ?? argv[++i];
		if (flag === '--cases') args.cases = value().split(',');
		else if (flag === '--efforts') args.efforts = value().split(',');
		else if (flag === '--input') args.input = value();
		else if (flag === '--server') args.server = value();
		else if (flag === '--out') args.out = value();
		else {
			console.error(`Unknown flag ${flag}. Flags: --cases --efforts --input --server --out`);
			process.exit(1);
		}
	}
	for (const c of args.cases)
		if (!CASES[c]) {
			console.error(`Unknown case "${c}". Known: ${Object.keys(CASES).join(', ')}`);
			process.exit(1);
		}
	return args;
}

async function api(base, route, body) {
	const res = await fetch(base + route, {
		method: body ? 'POST' : 'GET',
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`${route}: HTTP ${res.status}, non-JSON body: ${text.slice(0, 200)}`);
	}
	if (!res.ok) throw new Error(`${route}: HTTP ${res.status}: ${data.error ?? text.slice(0, 200)}`);
	return data;
}

async function waitForServer(base, child, timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (child && child.exitCode !== null)
			throw new Error(`Server exited with code ${child.exitCode} before becoming ready.`);
		try {
			const res = await fetch(base + '/api/state');
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Server at ${base} not ready after ${timeoutMs / 1000}s.`);
}

function startServer(dbPath) {
	const child = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
		cwd: ROOT,
		env: { ...process.env, TRELLIS_DB: dbPath },
		stdio: ['ignore', 'ignore', 'inherit'],
		detached: true
	});
	const stop = () => {
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	};
	process.on('exit', stop);
	process.on('SIGINT', () => {
		stop();
		process.exit(130);
	});
	return { child, stop };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
	const outDir = args.out ?? path.join(ROOT, 'evals', 'runs', stamp);
	fs.mkdirSync(outDir, { recursive: true });

	let base = args.server;
	let server;
	if (!base) {
		const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trellis-eval-')), 'eval.db');
		console.log(`Starting isolated server on :${PORT} (db: ${dbPath})`);
		server = startServer(dbPath);
		base = `http://localhost:${PORT}`;
		await waitForServer(base, server.child);
	} else {
		await waitForServer(base, null, 5_000);
	}

	console.log(`Input: ${args.input}`);
	console.log(`Matrix: [${args.cases.join(', ')}] × [${args.efforts.join(', ')}]\n`);

	const summary = { input: args.input, startedAt: new Date().toISOString(), runs: [] };
	// Sequential on purpose: export and invoke operate on the active graph,
	// and the CLI providers behave better without concurrent sessions.
	for (const caseName of args.cases) {
		for (const effort of args.efforts) {
			const name = args.server ? `${caseName} - ${effort} - ${stamp}` : `${caseName} - ${effort}`;
			const selection = { ...CASES[caseName], effort };
			process.stdout.write(`${name.padEnd(28)} … `);
			const t0 = Date.now();
			const run = { case: caseName, effort, selection, graph: name };
			try {
				await api(base, '/api/graphs', { action: 'create', name });
				const { noteId } = await api(base, '/api/notes', {
					action: 'create',
					body: args.input,
					x: 48,
					y: 96
				});
				const { changeSetId } = await api(base, '/api/invoke', {
					action: 'decompose',
					selectedIds: [],
					scratchBody: args.input,
					noteId,
					selection
				});
				const exported = await api(base, '/api/export');
				const file = path.join(outDir, `trellis-${caseName}-${effort}.json`);
				fs.writeFileSync(file, JSON.stringify(exported, null, 2));

				const { calls } = await api(base, '/api/agent-calls?limit=10');
				const attempts = calls.filter((c) => c.changeSetId === changeSetId);
				run.file = path.basename(file);
				run.changeSetId = changeSetId;
				run.wallMs = Date.now() - t0;
				run.attempts = attempts.length;
				run.latencyMs = attempts[0]?.latencyMs ?? null;
				run.usage = attempts[0]?.usage ?? null;
				run.validationErrors = attempts.flatMap((c) => c.validationErrors);
				console.log(`ok in ${Math.round(run.wallMs / 1000)}s (${attempts.length} attempt${attempts.length === 1 ? '' : 's'})`);
			} catch (e) {
				run.error = String(e.message ?? e);
				console.log(`FAILED: ${run.error}`);
			}
			summary.runs.push(run);
		}
	}

	fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
	server?.stop();

	console.log(`\nResults in ${path.relative(process.cwd(), outDir)}\n`);
	report(
		summary.runs.filter((r) => r.file).map((r) => path.join(outDir, r.file)),
		summary
	);
	const failed = summary.runs.filter((r) => r.error).length;
	if (failed) process.exitCode = 1;
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
