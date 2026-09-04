// Model adapter (docs/design.md "Technical design"): the store asks an adapter
// for a proposal; where it came from is invisible downstream — every adapter
// emits the wire format and passes through the same validation.
//
//   TRELLIS_AGENT=live        Anthropic API via @anthropic-ai/sdk (default;
//                             needs ANTHROPIC_API_KEY or an ant auth profile)
//   TRELLIS_AGENT=claude-cli  local Claude Code CLI in headless mode
//                             (subscription-billed; see claude-cli.ts)
//   TRELLIS_AGENT=fixture     deterministic fixtures, no network
//
// TRELLIS_MODEL overrides the model (live default: claude-sonnet-5, per the
// design doc, for cost during iteration; claude-cli default: sonnet).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AgentAction } from '$lib/types';
import type { AgentContext } from './context';
import { makeClaudeCliAdapter } from './claude-cli';
import { runFixture, type FixtureDeps } from './fixtures';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { proposalSchema } from './wire';

export interface AdapterRequest {
	action: AgentAction;
	context: AgentContext;
	/** Validation errors from a failed prior attempt, for one corrective retry. */
	feedback?: { raw: string; errors: string[] };
}

export interface AdapterResult {
	/** Raw model output (or serialized fixture), logged verbatim. */
	raw: string;
	/** Parsed but not yet validated proposal. */
	proposal: unknown;
	/** The user-facing prompt (or context) that was sent, for the request log. */
	request: string;
	/** Human-readable usage line for the dev console, e.g. "1.2K in / 300 out tokens". */
	usage?: string;
}

export interface ModelAdapter {
	name: string;
	model: string;
	generate(req: AdapterRequest): Promise<AdapterResult>;
}

export function makeFixtureAdapter(deps: FixtureDeps): ModelAdapter {
	return {
		name: 'fixture',
		model: 'fixture',
		async generate({ action, context }) {
			const proposal = runFixture(action, context, deps);
			return {
				raw: JSON.stringify(proposal),
				proposal,
				request: buildUserPrompt(action, context)
			};
		}
	};
}

export function makeLiveAdapter(): ModelAdapter {
	const model = process.env.TRELLIS_MODEL ?? 'claude-sonnet-5';
	// Localhost tool: fail visibly after two minutes rather than hanging the UI.
	const client = new Anthropic({ timeout: 120_000 });

	return {
		name: 'live',
		model,
		async generate({ action, context, feedback }) {
			const userPrompt = buildUserPrompt(action, context);
			const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
			if (feedback) {
				messages.push(
					{ role: 'assistant', content: feedback.raw },
					{
						role: 'user',
						content: `That proposal failed validation:\n${feedback.errors
							.map((e) => `- ${e}`)
							.join('\n')}\nReturn a corrected change set.`
					}
				);
			}

			const response = await client.messages.parse({
				model,
				max_tokens: 16000,
				system: SYSTEM_PROMPT,
				messages,
				output_config: { format: zodOutputFormat(proposalSchema) }
			});

			const raw = response.content
				.filter((b): b is Anthropic.TextBlock => b.type === 'text')
				.map((b) => b.text)
				.join('');
			const u = response.usage;
			return {
				raw,
				proposal: response.parsed_output,
				request: userPrompt,
				usage: `${u.input_tokens} in / ${u.output_tokens} out tokens`
			};
		}
	};
}

export function selectAdapter(deps: FixtureDeps): ModelAdapter {
	switch (process.env.TRELLIS_AGENT) {
		case 'fixture':
			return makeFixtureAdapter(deps);
		case 'claude-cli':
			return makeClaudeCliAdapter();
		default:
			return makeLiveAdapter();
	}
}

/** A short, user-facing description of what went wrong with a live call. */
export function describeGenerationError(e: unknown): string {
	if (
		e instanceof Anthropic.AuthenticationError ||
		(e instanceof Error && /authentication method/i.test(e.message))
	)
		return 'The model call was rejected: no valid Anthropic credentials. Set ANTHROPIC_API_KEY (or run with TRELLIS_AGENT=fixture).';
	if (e instanceof Anthropic.RateLimitError)
		return 'The model is rate-limited right now. Wait a moment and invoke the operation again.';
	if (e instanceof Anthropic.APIConnectionError)
		return 'Could not reach the model. Check the network, or run with TRELLIS_AGENT=fixture.';
	if (e instanceof Anthropic.APIError) return `The model call failed (${e.status}): ${e.message}`;
	return e instanceof Error ? `Generation failed: ${e.message}` : 'Generation failed.';
}
