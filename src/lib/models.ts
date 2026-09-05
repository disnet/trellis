export const AGENT_PROVIDERS = ['live', 'claude-cli', 'codex-cli', 'fixture'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export interface ModelSelection {
	provider: AgentProvider;
	/** Empty means use the provider's configured default. */
	model: string;
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

export function isModelSelection(value: unknown): value is ModelSelection {
	if (!value || typeof value !== 'object') return false;
	const { provider, model } = value as ModelSelection;
	return AGENT_PROVIDERS.includes(provider) && typeof model === 'string' &&
		(model === '' || /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model));
}
