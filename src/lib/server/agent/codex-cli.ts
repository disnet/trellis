import { resolveCli, cliCommand, cliEnvironment, trackCli, prepareCliEnvironment } from '../local-agents';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ModelAdapter } from './adapter';
import { formatUsage, type ReasoningEffort, type TokenUsage } from '$lib/models';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { codexProposalSchema } from './wire';

const TIMEOUT_MS = 300_000;
const MAX_OUTPUT = 2 * 1024 * 1024;

function runCodex(bin: string, args: string[], cwd: string, prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const command = cliCommand(bin, args);
		const child = trackCli(spawn(command.file, command.args, { cwd, env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], ...command.options }));
		let stdout = '';
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error(`Codex timed out after ${TIMEOUT_MS / 1000}s. Try the operation again.`));
		}, TIMEOUT_MS);
		child.stdout.on('data', (chunk) => {
			stdout = (stdout + chunk).slice(-MAX_OUTPUT);
		});
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
			if (code === 0) resolve(stdout);
			else reject(new Error(`Codex exited with code ${code}: ${stderr.trim().slice(-2000) || 'no output'}`));
		});
		child.stdin.end(prompt);
	});
}

// The shape `codex exec --json` reports on its final `turn.completed` event.
// Codex counts cached and cache-written tokens inside input_tokens, unlike the
// Anthropic API, where the three are separate fields.
interface CodexEvent {
	type?: string;
	usage?: {
		input_tokens?: number;
		cached_input_tokens?: number;
		cache_write_input_tokens?: number;
		output_tokens?: number;
	};
}

/**
 * Pull token counts out of the JSONL event stream. `codex exec` runs exactly
 * one turn, so the last `turn.completed` is the whole call; a missing or
 * malformed event costs the usage line, never the result.
 */
function parseCodexUsage(stdout: string): TokenUsage | undefined {
	let usage: CodexEvent['usage'];
	for (const line of stdout.split('\n')) {
		if (!line.startsWith('{')) continue;
		try {
			const event = JSON.parse(line) as CodexEvent;
			if (event.type === 'turn.completed' && event.usage) usage = event.usage;
		} catch {
			// Codex may interleave non-JSON diagnostics; skip them.
		}
	}
	if (!usage) return undefined;
	const cachedInput = usage.cached_input_tokens ?? 0;
	const cacheWrite = usage.cache_write_input_tokens ?? 0;
	return {
		input: Math.max(0, (usage.input_tokens ?? 0) - cachedInput - cacheWrite),
		cachedInput,
		cacheWrite,
		output: usage.output_tokens ?? 0
	};
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
	usage?: string;
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
		const stdout = await runCodex(
			resolveCli('codex-cli'),
			[
				'exec',
				// Token counts arrive only on the JSONL event stream; the last
				// message still goes to --output-last-message, not stdout.
				'--json',
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
		const tokens = parseCodexUsage(stdout);
		// Codex never reports a dollar figure, and it does not name the model it
		// ran; with no --model flag the config's default is in play and there is
		// nothing to price against, so the line falls back to token counts.
		return { raw, value, usage: tokens && formatUsage(model ?? '', tokens) };
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
			return { raw: result.raw, proposal, request, usage: result.usage };
		}
	};
}
