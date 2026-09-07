import { resolveCli, cliEnvironment, trackCli, prepareCliEnvironment } from '../local-agents';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ModelAdapter } from './adapter';
import type { ReasoningEffort } from '$lib/models';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { codexProposalSchema } from './wire';

const TIMEOUT_MS = 300_000;
const MAX_OUTPUT = 2 * 1024 * 1024;

function runCodex(bin: string, args: string[], cwd: string, prompt: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = trackCli(spawn(bin, args, { cwd, env: cliEnvironment(), stdio: ['pipe', 'ignore', 'pipe'] }));
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error(`Codex timed out after ${TIMEOUT_MS / 1000}s. Try the operation again.`));
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

export interface CodexStructuredRequest {
	model?: string;
	systemPrompt: string;
	userPrompt: string;
	jsonSchema: object;
	/** Proposal generation may browse; closed-context prose passes false. */
	allowWebSearch: boolean;
	/** Undefined leaves the Codex config's own default effort in place. */
	effort?: ReasoningEffort;
}

export interface CodexStructuredResult {
	raw: string;
	value: unknown;
}

/**
 * Run one Codex structured-output request in a fresh, read-only temporary
 * workspace. The caller owns semantic validation and any corrective retry.
 */
export async function generateCodexStructured({
	model,
	systemPrompt,
	userPrompt,
	jsonSchema,
	allowWebSearch,
	effort
}: CodexStructuredRequest): Promise<CodexStructuredResult> {
	await prepareCliEnvironment();
	const directory = await mkdtemp(join(tmpdir(), 'trellis-codex-'));
	try {
		const schema = join(directory, 'schema.json');
		const output = join(directory, 'output.json');
		await writeFile(schema, JSON.stringify(jsonSchema));
		await runCodex(
			resolveCli('codex-cli'),
			[
				'exec',
				'--ignore-user-config',
				'--ephemeral',
				'--skip-git-repo-check',
				'--sandbox',
				'read-only',
				'-c',
				'approval_policy="never"',
				'-c',
				'features.shell_tool=false',
				'-c',
				`web_search="${allowWebSearch ? 'live' : 'disabled'}"`,
				// Safe to interpolate: effort is one of a closed set of literals.
				...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
				'--output-schema',
				schema,
				'--output-last-message',
				output,
				...(model ? ['--model', model] : []),
				'-'
			],
			directory,
			`${systemPrompt}\n\n${userPrompt}`
		);
		const raw = await readFile(output, 'utf8');
		let value: unknown = null;
		try {
			value = JSON.parse(raw);
		} catch {
			// The caller's validator records a useful error and can retry with the
			// verbatim output. Keeping parsing non-throwing also preserves telemetry.
		}
		return { raw, value };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export function makeCodexCliAdapter(model?: string, effort?: ReasoningEffort): ModelAdapter {
	return {
		name: 'codex-cli',
		model: model ?? 'default',
		effort,
		async generate({ action, context, feedback }) {
			let request = buildUserPrompt(action, context);
			if (feedback) request += `\n\nPrevious proposal:\n${feedback.raw}\nValidation errors:\n${feedback.errors.join('\n')}\nReturn a corrected change set.`;
			const result = await generateCodexStructured({
				model,
				systemPrompt:
					`${SYSTEM_PROMPT}\n\nUse only the supplied context, plus the web search tool to fetch URLs from the context or find sources that would ground evidence; use no other tools. For revised thoughts, use null for unchanged fields.`,
				userPrompt: request,
				jsonSchema: z.toJSONSchema(codexProposalSchema),
				allowWebSearch: true,
				effort
			});
			let proposal = result.value;
			const parsed = codexProposalSchema.safeParse(proposal);
			if (parsed.success) {
				proposal = {
					...parsed.data,
					operations: parsed.data.operations.map((op) =>
						op.op === 'revise_thought'
							? {
									...op,
									thought: Object.fromEntries(
										Object.entries(op.thought).filter(([, value]) => value !== null)
									)
								}
							: op
					)
				};
			}
			return { raw: result.raw, proposal, request };
		}
	};
}
