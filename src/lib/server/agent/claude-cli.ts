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
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { proposalSchema } from './wire';

// The CLI's --json-schema validator speaks draft-07.
const JSON_SCHEMA = JSON.stringify(z.toJSONSchema(proposalSchema, { target: 'draft-7' }));

const TIMEOUT_MS = 180_000;

interface CliEnvelope {
	is_error?: boolean;
	result?: string;
	structured_output?: unknown;
	usage?: { input_tokens?: number; output_tokens?: number };
	total_cost_usd?: number;
}

function runClaude(bin: string, args: string[], stdin: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// Neutral cwd: the call must not pick up this (or any) project's context.
		const child = spawn(bin, args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
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

export function makeClaudeCliAdapter(model = 'sonnet'): ModelAdapter {
	const bin = process.env.TRELLIS_CLAUDE_BIN ?? 'claude';
	// The CLI accepts aliases (sonnet, opus, haiku) as well as full model ids.

	return {
		name: 'claude-cli',
		model,
		async generate({ action, context, feedback }) {
			let userPrompt = buildUserPrompt(action, context);
			if (feedback) {
				// -p is single-turn; the corrective retry is folded into the prompt.
				userPrompt +=
					`\n\n## Previous attempt\n\nYour previous proposal was:\n${feedback.raw}\n\n` +
					`It failed validation:\n${feedback.errors.map((e) => `- ${e}`).join('\n')}\n` +
					`Return a corrected change set.`;
			}

			const stdout = await runClaude(
				bin,
				[
					'-p',
					'--output-format',
					'json',
					'--model',
					model,
					// Web tools only: -p auto-denies tools that lack permission, so
					// they must be both in the tool set and pre-approved.
					'--tools',
					'WebFetch,WebSearch',
					'--allowed-tools',
					'WebFetch,WebSearch',
					'--setting-sources',
					'',
					'--strict-mcp-config',
					'--no-session-persistence',
					'--system-prompt',
					SYSTEM_PROMPT,
					'--json-schema',
					JSON_SCHEMA
				],
				userPrompt
			);

			let envelope: CliEnvelope;
			try {
				envelope = JSON.parse(stdout) as CliEnvelope;
			} catch {
				throw new Error(`claude -p returned unparseable output: ${stdout.slice(0, 200)}`);
			}
			if (envelope.is_error) {
				const msg = envelope.result ?? 'unknown CLI error';
				throw new Error(
					/authenticat/i.test(msg)
						? `${msg} — run \`claude\` in a terminal to refresh the login.`
						: msg
				);
			}

			// Structured output lands in structured_output on current CLIs; fall
			// back to parsing the result text so a CLI change degrades gracefully
			// (our validator judges the payload either way).
			let proposal: unknown = envelope.structured_output;
			const raw =
				proposal !== undefined ? JSON.stringify(proposal) : (envelope.result ?? '');
			if (proposal === undefined) {
				try {
					proposal = parseResultJson(envelope.result ?? '');
				} catch {
					throw new Error(
						`claude -p returned no structured output and its result was not JSON: ${raw.slice(0, 200)}`
					);
				}
			}

			const u = envelope.usage;
			const usage = u
				? `${u.input_tokens ?? '?'} in / ${u.output_tokens ?? '?'} out tokens` +
					(envelope.total_cost_usd ? `, $${envelope.total_cost_usd.toFixed(4)}` : '')
				: undefined;
			return { raw, proposal, request: userPrompt, usage };
		}
	};
}
