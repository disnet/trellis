import { resolveCli, cliEnvironment, trackCli, prepareCliEnvironment } from '../local-agents';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ModelAdapter } from './adapter';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { codexProposalSchema } from './wire';

const TIMEOUT_MS = 180_000;
const MAX_OUTPUT = 2 * 1024 * 1024;

function runCodex(bin: string, args: string[], cwd: string, prompt: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = trackCli(spawn(bin, args, { cwd, env: cliEnvironment(), stdio: ['pipe', 'ignore', 'pipe'] }));
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error('Codex timed out after 180s. Try the operation again.'));
		}, TIMEOUT_MS);
		child.stderr.on('data', (chunk) => {
			stderr = (stderr + chunk).slice(-MAX_OUTPUT);
		});
		child.stdin.on('error', (error: NodeJS.ErrnoException) => {
			if (error.code !== 'EPIPE') { child.kill('SIGKILL'); reject(error); }
		});
		child.on('error', (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(error.code === 'ENOENT'
				? new Error(`Codex CLI ("${bin}") was not found. Install Codex or set TRELLIS_CODEX_BIN, then run codex login.`)
				: error);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`Codex exited with code ${code}: ${stderr.trim().slice(-2000) || 'no output'}`));
		});
		child.stdin.end(prompt);
	});
}

export function makeCodexCliAdapter(model?: string): ModelAdapter {
	return {
		name: 'codex-cli',
		model: model ?? 'default',
		async generate({ action, context, feedback }) {
			await prepareCliEnvironment();
			let request = buildUserPrompt(action, context);
			if (feedback) request += `\n\nPrevious proposal:\n${feedback.raw}\nValidation errors:\n${feedback.errors.join('\n')}\nReturn a corrected change set.`;
			const directory = await mkdtemp(join(tmpdir(), 'trellis-codex-'));
			try {
				const schema = join(directory, 'schema.json');
				const output = join(directory, 'proposal.json');
				await writeFile(schema, JSON.stringify(z.toJSONSchema(codexProposalSchema)));
				await runCodex(resolveCli('codex-cli'), [
					'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
					'--sandbox', 'read-only', '-c', 'approval_policy="never"',
					'-c', 'features.shell_tool=false', '-c', 'web_search="live"',
					'--output-schema', schema, '--output-last-message', output,
					...(model ? ['--model', model] : []), '-'
				], directory, `${SYSTEM_PROMPT}\n\nUse only the supplied context, plus the web search tool to fetch URLs from the context or find sources that would ground evidence; use no other tools. For revised thoughts, use null for unchanged fields.\n\n${request}`);
				const raw = await readFile(output, 'utf8');
				let proposal: unknown;
				try {
					proposal = JSON.parse(raw);
					const parsed = codexProposalSchema.safeParse(proposal);
					if (parsed.success) {
						proposal = { ...parsed.data, operations: parsed.data.operations.map((op) =>
							op.op === 'revise_thought' ? { ...op, thought: Object.fromEntries(
								Object.entries(op.thought).filter(([, value]) => value !== null)
							) } : op
						) };
					}
				} catch { proposal = null; } // Existing validator supplies corrective feedback.
				return { raw, proposal, request };
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		}
	};
}
