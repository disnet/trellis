export const AGENT_PROVIDERS = ['live', 'claude-cli', 'codex-cli', 'fixture'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

// One vocabulary for all three live providers: the Anthropic API's
// output_config.effort, `claude --effort`, and Codex's model_reasoning_effort
// all accept exactly these levels. Codex also accepts none/minimal and the API
// defaults to high; keeping the shared five means the switcher means the same
// thing wherever you point it.
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface ModelSelection {
	provider: AgentProvider;
	/** Empty means use the provider's configured default. */
	model: string;
	/** Undefined means use the provider's default effort. */
	effort?: ReasoningEffort;
}

export interface ModelPreset {
	id: string;
	label: string;
	group: string;
}

// Presets checked against the provider documentation on 2026-09-04.
// https://platform.claude.com/docs/en/models/overview
// https://code.claude.com/docs/en/model-config
// https://developers.openai.com/codex/models/
// These are documented choices, not a guarantee of account access.
const CLAUDE_MODELS: ModelPreset[] = [
	{ id: 'claude-fable-5-1', label: 'Fable 5.1', group: 'Current models' },
	{ id: 'claude-opus-5', label: 'Opus 5', group: 'Current models' },
	{ id: 'claude-sonnet-5', label: 'Sonnet 5', group: 'Current models' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', group: 'Current models' },
	{ id: 'claude-fable-5', label: 'Fable 5', group: 'Earlier models' }
];

export const PROVIDERS: { id: AgentProvider; label: string; models: ModelPreset[] }[] = [
	{ id: 'live', label: 'Anthropic API', models: CLAUDE_MODELS },
	{ id: 'claude-cli', label: 'Claude Code', models: [
		{ id: 'fable', label: 'Fable · latest', group: 'Always latest' },
		{ id: 'opus', label: 'Opus · latest', group: 'Always latest' },
		{ id: 'sonnet', label: 'Sonnet · latest', group: 'Always latest' },
		{ id: 'haiku', label: 'Haiku · latest', group: 'Always latest' },
		...CLAUDE_MODELS
	] },
	{ id: 'codex-cli', label: 'Codex', models: [
		{ id: 'gpt-6-astra', label: 'GPT-6 Astra', group: 'Current models' },
		{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', group: 'Current models' },
		{ id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', group: 'Current models' },
		{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', group: 'Current models' },
		{ id: 'gpt-5.5', label: 'GPT-5.5', group: 'Earlier models' },
		{ id: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark · Pro preview', group: 'Preview' },
		{ id: 'gpt-5.4', label: 'GPT-5.4', group: 'Legacy · API key sign-in' },
		{ id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', group: 'Legacy · API key sign-in' },
		{ id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', group: 'Legacy · API key sign-in' }
	] },
	{ id: 'fixture', label: 'Fixtures (offline)', models: [] }
];

// Per-million-token list prices in USD, checked against the provider pricing
// pages on 2026-09-07:
//   https://platform.claude.com/docs/en/about-claude/pricing
//   https://developers.openai.com/api/docs/pricing
// These drive an *estimate*. They ignore long-context surcharges, batch and
// priority tiers, and promotional rates — and they mean nothing at all for a
// subscription login (Claude Pro/Max, ChatGPT Plus/Pro), where a call costs no
// marginal dollars. Where a provider reports a real figure (the Claude CLI's
// total_cost_usd) that number is used instead; this table is the fallback.
export interface ModelPrice {
	/** Input tokens neither read from nor written to the prompt cache. */
	input: number;
	/** Input tokens served from the cache. */
	cachedInput: number;
	/** Input tokens written into the cache — both providers bill 1.25x input. */
	cacheWrite: number;
	output: number;
}

const price = (input: number, output: number, cachedInput = input / 10): ModelPrice => ({
	input,
	cachedInput,
	cacheWrite: input * 1.25,
	output
});

const MODEL_PRICES: Record<string, ModelPrice> = {
	// Anthropic. Fable 5.1 reads cache at a flat $0.25/MTok rather than the
	// usual tenth of input.
	'claude-fable-5-1': price(10, 50, 0.25),
	'claude-fable-5': price(10, 50),
	'claude-opus-5': price(5, 25),
	'claude-sonnet-5': price(2, 10),
	'claude-haiku-4-5': price(1, 5),
	'claude-haiku-4-5-20251001': price(1, 5),
	// OpenAI. gpt-5.3-codex-spark is deliberately absent: it is a subscription
	// preview with no published per-token rate, so it reports tokens only.
	'gpt-6-astra': price(10, 50, 1),
	'gpt-5.6-sol': price(4, 20, 0.4),
	'gpt-5.6-terra': price(2, 12, 0.2),
	'gpt-5.6-luna': price(0.2, 1.2, 0.02),
	'gpt-5.5': price(5, 30, 0.5),
	'gpt-5.4': price(2.5, 15, 0.25),
	'gpt-5.4-mini': price(0.75, 4.5, 0.075),
	'gpt-5.3-codex': price(1.75, 14, 0.175)
};

// `claude -p --model` also takes the floating aliases, which resolve to
// whatever is current for that tier.
const MODEL_ALIASES: Record<string, string> = {
	fable: 'claude-fable-5-1',
	opus: 'claude-opus-5',
	sonnet: 'claude-sonnet-5',
	haiku: 'claude-haiku-4-5'
};

/** Token counts as the pricing table wants them: three disjoint input buckets. */
export interface TokenUsage {
	input: number;
	output: number;
	cachedInput?: number;
	cacheWrite?: number;
}

/** Undefined where the model has no published per-token price. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | undefined {
	const p = MODEL_PRICES[model] ?? MODEL_PRICES[MODEL_ALIASES[model] ?? ''];
	if (!p) return undefined;
	return (
		(usage.input * p.input +
			(usage.cachedInput ?? 0) * p.cachedInput +
			(usage.cacheWrite ?? 0) * p.cacheWrite +
			usage.output * p.output) /
		1_000_000
	);
}

/**
 * The activity log's usage line. `exactCostUsd` is for providers that bill the
 * call and tell us what it cost; everything else falls back to the estimate,
 * marked as one so nobody reconciles it against an invoice.
 */
export function formatUsage(model: string, usage: TokenUsage, exactCostUsd?: number): string {
	const line = `${usage.input + (usage.cachedInput ?? 0) + (usage.cacheWrite ?? 0)} in / ${usage.output} out tokens`;
	if (exactCostUsd !== undefined) return `${line}, $${exactCostUsd.toFixed(4)}`;
	const estimate = estimateCostUsd(model, usage);
	return estimate === undefined ? line : `${line}, ~$${estimate.toFixed(4)} (est.)`;
}

// Reasoning effort predates neither provider uniformly: the Anthropic API
// rejects output_config.effort on models older than the 4.6 generation (Haiku
// 4.5 and earlier), while both CLIs accept the flag for every model they offer.
export function supportsEffort(provider: AgentProvider, model: string): boolean {
	if (provider === 'fixture') return false;
	if (provider !== 'live') return true;
	// The live default (claude-sonnet-5) supports effort, so '' qualifies.
	return model === '' || /^claude-(fable-5|mythos-5|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/.test(model);
}

export function isModelSelection(value: unknown): value is ModelSelection {
	if (!value || typeof value !== 'object') return false;
	const { provider, model, effort } = value as ModelSelection;
	return AGENT_PROVIDERS.includes(provider) && typeof model === 'string' &&
		(model === '' || /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model)) &&
		(effort === undefined || REASONING_EFFORTS.includes(effort));
}
