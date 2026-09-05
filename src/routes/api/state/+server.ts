import { json } from '@sveltejs/kit';
import { readLocalSettings } from '$lib/server/local-agents';
import { defaultSelection } from '$lib/server/agent/settings';
import { getState, reentrySummary } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	// Compute the summary against the previous visit before it is re-stamped.
	const reentry = reentrySummary();
	return json({ state: getState(), reentry, modelSelection: defaultSelection(), desktop: !!process.env.TRELLIS_DESKTOP, needsAgentSetup: !!process.env.TRELLIS_DESKTOP && !readLocalSettings().selection });
};
