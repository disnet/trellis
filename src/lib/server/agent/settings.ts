import { readLocalSettings } from '../local-agents';
import { AGENT_PROVIDERS, REASONING_EFFORTS, type AgentProvider, type ModelSelection, type ReasoningEffort } from '$lib/models';

export function defaultSelection(): ModelSelection {
	const saved = readLocalSettings().selection;
	if (process.env.TRELLIS_DESKTOP && saved) return saved;
	const configured = process.env.TRELLIS_AGENT as AgentProvider;
	const effort = process.env.TRELLIS_EFFORT as ReasoningEffort;
	return {
		provider: AGENT_PROVIDERS.includes(configured) ? configured : (process.env.TRELLIS_DESKTOP ? 'fixture' : 'live'),
		model: process.env.TRELLIS_MODEL ?? '',
		// An unrecognized value falls back to the provider's own default rather
		// than failing every call at the transport.
		...(REASONING_EFFORTS.includes(effort) ? { effort } : {})
	};
}
