import { resolveCli, cliEnvironment, trackCli, prepareCliEnvironment } from '../local-agents';
// Subscription-billed adapter: shells out to the local Claude Code CLI in
// headless print mode (`claude -p`) instead of calling the Messages API.
// Select with TRELLIS_AGENT=claude-cli. Auth is whatever `claude` itself is
// logged in as — for a Pro/Max login that is subscription quota, shared with
// interactive Claude Code use.
//
// This is a personal-use convenience, not a supported integration path: it
// requires the Claude Code CLI on PATH, its flags/output can change between
// CLI releases, and it must not be used for anything shared or deployed —
// Anthropic does not allow products to ride claude.ai logins or rate limits.

import { spawn } from 'node:child_process';
import os from 'node:os';
import { z } from 'zod';
import type { ModelAdapter } from './adapter';
import { formatUsage, type ReasoningEffort } from '$lib/models';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { proposalSchema } from './wire';

// The CLI's --json-schema validator speaks draft-07.
const JSON_SCHEMA = z.toJSONSchema(proposalSchema, { target: 'draft-7' });

const TIMEOUT_MS = 300_000;

interface CliEnvelope {
	is_error?: boolean;
	result?: string;
	structured_output?: unknown;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
	total_cost_usd?: number;
}

function runClaude(bin: string, args: string[], stdin: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// Neutral cwd: the call must not pick up this (or any) project's context.
		const child = trackCli(spawn(bin, args, { cwd: os.tmpdir(), env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] }));
		let stdout = '';
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error(`claude -p timed out after ${TIMEOUT_MS / 1000}s.`));
		}, TIMEOUT_MS);

		child.stdout.on('data', (c) => (stdout += c));
		child.stderr.on('data', (c) => (stderr += c));
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(
				(e as NodeJS.ErrnoException).code === 'ENOENT'
					? new Error(
							`The Claude Code CLI ("${bin}") was not found on PATH. Install Claude Code, set TRELLIS_CLAUDE_BIN, or use a different TRELLIS_AGENT.`
						)
					: e
			);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			// The CLI reports most failures inside the JSON envelope; a non-zero
			// exit with no parseable stdout is the hard-failure case.
			if (stdout.trim()) resolve(stdout);
			else reject(new Error(`claude -p exited with code ${code}: ${stderr.trim() || 'no output'}`));
		});
		child.stdin.end(stdin);
	});
}

/** Extract JSON from result text that may be wrapped in a markdown fence. */
function parseResultJson(text: string): unknown {
	const stripped = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
	return JSON.parse(stripped);
}

export interface ClaudeStructuredRequest {
	model?: string;
	systemPrompt: string;
	userPrompt: string;
	/** A draft-07-compatible JSON schema. */
	jsonSchema: object;
	/** Proposal generation may browse; closed-context prose passes false. */
	allowWebTools: boolean;
	/** Undefined leaves the CLI's own default effort in place. */
	effort?: ReasoningEffort;
}

export interface ClaudeStructuredResult {
	raw: string;
	value: unknown;
	parseError?: string;
	usage?: string;
}

/**
 * Run one isolated Claude CLI structured-output request. Parsing failures are
 * returned with the raw output so an orchestrator can log them and, where
 * appropriate, issue a corrective retry. Transport and authentication errors
 * still throw because repeating the same request cannot repair them.
 */
export async function generateClaudeStructured({
	model = 'sonnet',
	systemPrompt,
	userPrompt,
	jsonSchema,
	allowWebTools,
	effort
}: ClaudeStructuredRequest): Promise<ClaudeStructuredResult> {
	await prepareCliEnvironment();
	const bin = resolveCli('claude-cli');
	const webTools = allowWebTools ? 'WebFetch,WebSearch' : '';
	const stdout = await runClaude(
		bin,
		[
			'-p',
			'--output-format',
			'json',
			'--model',
			model,
			'--tools',
			webTools,
			'--allowed-tools',
			webTools,
			'--setting-sources',
			'',
			'--strict-mcp-config',
			'--no-session-persistence',
			'--system-prompt',
			systemPrompt,
			'--json-schema',
			JSON.stringify(jsonSchema),
			...(effort ? ['--effort', effort] : [])
		],
		userPrompt
	);

	let envelope: CliEnvelope;
	try {
		envelope = JSON.parse(stdout) as CliEnvelope;
	} catch {
		return {
			raw: stdout,
			value: null,
			parseError: `claude -p returned unparseable output: ${stdout.slice(0, 200)}`
		};
	}
	if (envelope.is_error) {
		const msg = envelope.result ?? 'unknown CLI error';
		throw new Error(
			/authenticat/i.test(msg)
				? `${msg} — run \`claude\` in a terminal to refresh the login.`
				: msg
		);
	}

	const raw =
		envelope.structured_output !== undefined
			? JSON.stringify(envelope.structured_output)
			: (envelope.result ?? '');
	let value: unknown = envelope.structured_output;
	let parseError: string | undefined;
	if (value === undefined) {
		try {
			value = parseResultJson(envelope.result ?? '');
		} catch {
			value = null;
			parseError = `claude -p returned no structured output and its result was not JSON: ${raw.slice(0, 200)}`;
		}
	}

	const u = envelope.usage;
	// The CLI bills the call and reports what it cost, so prefer its figure and
	// only estimate when it withholds one (a subscription login reports 0).
	const usage = u
		? formatUsage(
				model,
				{
					input: u.input_tokens ?? 0,
					cachedInput: u.cache_read_input_tokens ?? 0,
					cacheWrite: u.cache_creation_input_tokens ?? 0,
					output: u.output_tokens ?? 0
				},
				envelope.total_cost_usd || undefined
			)
		: undefined;
	return { raw, value, parseError, usage };
}

export function makeClaudeCliAdapter(model = 'sonnet', effort?: ReasoningEffort): ModelAdapter {
	// The CLI accepts aliases (sonnet, opus, haiku) as well as full model ids.

	return {
		name: 'claude-cli',
		model,
		effort,
		async generate({ action, context, feedback }) {
			let userPrompt = buildUserPrompt(action, context);
			if (feedback) {
				// -p is single-turn; the corrective retry is folded into the prompt.
				userPrompt +=
					`\n\n## Previous attempt\n\nYour previous proposal was:\n${feedback.raw}\n\n` +
					`It failed validation:\n${feedback.errors.map((e) => `- ${e}`).join('\n')}\n` +
					`Return a corrected change set.`;
			}

			const result = await generateClaudeStructured({
				model,
				systemPrompt: SYSTEM_PROMPT,
				userPrompt,
				jsonSchema: JSON_SCHEMA,
				allowWebTools: true,
				effort
			});
			// Preserve the proposal adapter's prior error behavior. Prose uses the
			// parseError as validation feedback and can therefore repair it.
			if (result.parseError) throw new Error(result.parseError);
			return {
				raw: result.raw,
				proposal: result.value,
				request: userPrompt,
				usage: result.usage
			};
		}
	};
}
