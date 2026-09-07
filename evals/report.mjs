#!/usr/bin/env node
// Comparison report over Trellis export JSONs (the files run.mjs writes, or
// ones downloaded from the UI's export button). Computes size and shape
// metrics per run so prompt changes can be compared across runs:
//
//   node evals/report.mjs evals/runs/2026-09-08-*/           # a run directory
//   node evals/report.mjs evals/*.json evals/runs/*/         # across runs

import fs from 'node:fs';
import path from 'node:path';

function collectFiles(args) {
	const files = [];
	for (const a of args) {
		const st = fs.statSync(a);
		if (st.isDirectory()) {
			for (const f of fs.readdirSync(a))
				if (f.startsWith('trellis-') && f.endsWith('.json')) files.push(path.join(a, f));
		} else files.push(a);
	}
	return files;
}

function median(xs) {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

export function analyze(file) {
	const d = JSON.parse(fs.readFileSync(file, 'utf8'));
	const types = {};
	const relTypes = {};
	const stmtLens = [];
	const titleLens = [];
	let relations = 0;
	for (const op of d.proposed_operations ?? []) {
		const p = JSON.parse(op.payload);
		if (p.op === 'create_thought') {
			types[p.thought.type] = (types[p.thought.type] ?? 0) + 1;
			stmtLens.push((p.thought.statement ?? '').length);
			titleLens.push((p.thought.title ?? '').length);
		} else if (p.op === 'add_relation') {
			relations++;
			relTypes[p.relationType] = (relTypes[p.relationType] ?? 0) + 1;
		}
	}
	const cs = d.change_sets?.[0];
	const scratch = d.scratch_notes?.[0];
	return {
		file,
		label: d.graph?.name ?? path.basename(file),
		thoughts: stmtLens.length,
		relations,
		types,
		relTypes,
		stmtMean: stmtLens.length ? Math.round(stmtLens.reduce((a, b) => a + b, 0) / stmtLens.length) : 0,
		stmtMedian: median(stmtLens),
		stmtMax: stmtLens.length ? Math.max(...stmtLens) : 0,
		titleMean: titleLens.length
			? Math.round(titleLens.reduce((a, b) => a + b, 0) / titleLens.length)
			: 0,
		durationS: cs && scratch ? Math.round((cs.created_at - scratch.created_at) / 1000) : null,
		summary: cs?.summary ?? ''
	};
}

export function report(files, summary) {
	const rows = files.map(analyze);
	const byFile = new Map(
		(summary?.runs ?? []).filter((r) => r.file).map((r) => [r.file, r])
	);

	const cols = [
		['run', (r) => r.label],
		['thoughts', (r) => String(r.thoughts)],
		['rels', (r) => String(r.relations)],
		['stmt mean', (r) => String(r.stmtMean)],
		['stmt max', (r) => String(r.stmtMax)],
		['title mean', (r) => String(r.titleMean)],
		['time', (r) => (r.durationS == null ? '—' : `${r.durationS}s`)],
		[
			'attempts',
			(r) => {
				const meta = byFile.get(path.basename(r.file));
				return meta ? String(meta.attempts ?? 1) : '—';
			}
		]
	];
	const widths = cols.map(([h, fn]) => Math.max(h.length, ...rows.map((r) => fn(r).length)));
	const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
	console.log(line(cols.map(([h]) => h)));
	console.log(line(widths.map((w) => '-'.repeat(w))));
	for (const r of rows) console.log(line(cols.map(([, fn]) => fn(r))));

	console.log('');
	for (const r of rows) {
		const types = Object.entries(r.types)
			.map(([t, n]) => `${n} ${t}`)
			.join(', ');
		const rels = Object.entries(r.relTypes)
			.map(([t, n]) => `${n} ${t}`)
			.join(', ');
		console.log(`${r.label}: ${types || 'no thoughts'}${rels ? ` | relations: ${rels}` : ''}`);
	}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
	const args = process.argv.slice(2);
	if (!args.length) {
		console.error('Usage: node evals/report.mjs <export.json | run-dir> ...');
		process.exit(1);
	}
	const files = collectFiles(args);
	let summary;
	const dirs = new Set(files.map((f) => path.dirname(f)));
	if (dirs.size === 1) {
		const sPath = path.join([...dirs][0], 'summary.json');
		if (fs.existsSync(sPath)) summary = JSON.parse(fs.readFileSync(sPath, 'utf8'));
	}
	report(files, summary);
}
