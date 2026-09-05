import { readLocalSettings } from '../local-agents';
import { AGENT_PROVIDERS, type AgentProvider, type ModelSelection } from '$lib/models';

export function defaultSelection(): ModelSelection {
	const saved = readLocalSettings().selection;
	if (process.env.TRELLIS_DESKTOP && saved) return saved;
	const configured = process.env.TRELLIS_AGENT as AgentProvider;
	return {
		provider: AGENT_PROVIDERS.includes(configured) ? configured : (process.env.TRELLIS_DESKTOP ? 'fixture' : 'live'),
		model: process.env.TRELLIS_MODEL ?? ''
	};
}
