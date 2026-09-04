import { exportState } from '$lib/server/store';
import type { RequestHandler } from './$types';

// Exports the active graph only (per-graph, per docs/design.md Phase 5).
export const GET: RequestHandler = () => {
	const data = exportState();
	const body = JSON.stringify(data, null, 2);
	const stamp = new Date().toISOString().slice(0, 10);
	const slug =
		data.graph.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'graph';
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="trellis-${slug}-${stamp}.json"`
		}
	});
};
