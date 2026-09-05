import { json } from '@sveltejs/kit';
import { defaultSelection } from '$lib/server/agent/settings';
import { getState, reentrySummary } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	// Compute the summary against the previous visit before it is re-stamped.
	const reentry = reentrySummary();
	return json({ state: getState(), reentry, modelSelection: defaultSelection() });
};
