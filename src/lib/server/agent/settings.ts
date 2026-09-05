import { AGENT_PROVIDERS, type AgentProvider, type ModelSelection } from '$lib/models';

export function defaultSelection(): ModelSelection {
	const configured = process.env.TRELLIS_AGENT as AgentProvider;
	return {
		provider: AGENT_PROVIDERS.includes(configured) ? configured : 'live',
		model: process.env.TRELLIS_MODEL ?? ''
	};
}
