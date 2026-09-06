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
import type { ZodType } from 'zod';
import type { AgentAction } from '$lib/types';
import type { AgentContext } from './context';
import { makeClaudeCliAdapter } from './claude-cli';
import { makeCodexCliAdapter } from './codex-cli';
import { defaultSelection } from './settings';
import { supportsEffort, type ModelSelection, type ReasoningEffort } from '$lib/models';
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
	/** The effort actually sent — undefined where the provider default stands. */
	effort?: ReasoningEffort;
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

// Server-side web tools: search finds sources the context lacks; fetch
// retrieves URLs already present in the prompt (evidence sources, scratch
// text) — the API refuses any other URL. Fable/Opus/Sonnet 4.6+ generations
// support the dynamic-filtering variants; Haiku and older only the basic ones.
function serverTools(model: string): Anthropic.ToolUnion[] {
	const dynamicFiltering = /^claude-(fable-5|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/.test(model);
	return dynamicFiltering
		? [
				{ type: 'web_search_20260318', name: 'web_search', max_uses: 3 },
				{ type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 5 }
			]
		: [
				{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
				{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5, max_content_tokens: 50_000 }
			];
}

export interface AnthropicStructuredRequest {
	client?: Anthropic;
	model: string;
	maxTokens: number;
	systemPrompt: string;
	messages: Anthropic.MessageParam[];
	schema: ZodType;
	/** Graph proposals can browse; closed-context prose passes false. */
	allowWebTools: boolean;
	/** Undefined leaves the API default (high) in place. */
	effort?: ReasoningEffort;
}

export interface AnthropicStructuredResult {
	raw: string;
	value: unknown;
	usage: string;
}

/** Shared Anthropic structured-output transport for graph and prose calls. */
export async function generateAnthropicStructured({
	client = new Anthropic({ timeout: 180_000 }),
	model,
	maxTokens,
	systemPrompt,
	messages,
	schema,
	allowWebTools,
	effort
}: AnthropicStructuredRequest): Promise<AnthropicStructuredResult> {
	const common = {
		model,
		max_tokens: maxTokens,
		system: systemPrompt,
		messages,
		output_config: {
			format: zodOutputFormat(schema),
			// Dropped rather than sent to a model that would reject it: an effort
			// carried over from another provider must not fail the call outright.
			...(effort && supportsEffort('live', model) ? { effort } : {})
		}
	};
	// Omit the tools property completely for closed-context work. This is both
	// stricter and easier to audit than passing an empty or disabled tool list.
	const response = await client.messages.parse(
		allowWebTools ? { ...common, tools: serverTools(model) } : common
	);
	const raw = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('');
	const u = response.usage;
	return {
		raw,
		value: response.parsed_output,
		usage: `${u.input_tokens} in / ${u.output_tokens} out tokens`
	};
}

export function makeLiveAdapter(model = 'claude-sonnet-5', effort?: ReasoningEffort): ModelAdapter {
	// Localhost tool: fail visibly after three minutes (matching the CLI
	// adapters — web fetches add latency) rather than hanging the UI.
	const client = new Anthropic({ timeout: 180_000 });
	// Report only what the transport will actually send, so the activity log
	// never claims an effort the model silently ignored.
	const sentEffort = effort && supportsEffort('live', model) ? effort : undefined;

	return {
		name: 'live',
		model,
		effort: sentEffort,
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

			const response = await generateAnthropicStructured({
				client,
				model,
				maxTokens: 16000,
				systemPrompt: SYSTEM_PROMPT,
				messages,
				schema: proposalSchema,
				allowWebTools: true,
				effort
			});
			return {
				raw: response.raw,
				proposal: response.value,
				request: userPrompt,
				usage: response.usage
			};
		}
	};
}

export function selectAdapter(deps: FixtureDeps, selection: ModelSelection = defaultSelection()): ModelAdapter {
	switch (selection.provider) {
		case 'fixture':
			return makeFixtureAdapter(deps);
		case 'claude-cli':
			return makeClaudeCliAdapter(selection.model || undefined, selection.effort);
		case 'codex-cli':
			return makeCodexCliAdapter(selection.model || undefined, selection.effort);
		default:
			return makeLiveAdapter(selection.model || undefined, selection.effort);
	}
}

// The SDK's error headers have been both a Headers instance and a plain object
// across versions; read either shape without trusting it.
function headerValue(headers: unknown, name: string): string | null {
	if (headers instanceof Headers) return headers.get(name);
	if (headers && typeof headers === 'object') {
		const value = (headers as Record<string, unknown>)[name];
		if (typeof value === 'string') return value;
	}
	return null;
}

/** A short, user-facing description of what went wrong with a live call. */
export function describeGenerationError(e: unknown): string {
	if (
		e instanceof Anthropic.AuthenticationError ||
		(e instanceof Error && /authentication method/i.test(e.message))
	)
		return 'The model call was rejected: no valid Anthropic credentials. Set ANTHROPIC_API_KEY (or run with TRELLIS_AGENT=fixture).';
	if (e instanceof Anthropic.RateLimitError) {
		const retry = headerValue(e.headers, 'retry-after');
		return (
			`The model is rate-limited right now (429${retry ? `, retry after ${/^\d+$/.test(retry) ? `${retry}s` : retry}` : ''}). ` +
			'Wait a moment and invoke the operation again.'
		);
	}
	if (e instanceof Anthropic.APIConnectionError)
		return 'Could not reach the model. Check the network, or run with TRELLIS_AGENT=fixture.';
	if (e instanceof Anthropic.APIError) return `The model call failed (${e.status}): ${e.message}`;
	return e instanceof Error ? `Generation failed: ${e.message}` : 'Generation failed.';
}
