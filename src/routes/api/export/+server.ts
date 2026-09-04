import { exportState } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const body = JSON.stringify(exportState(), null, 2);
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="trellis-export-${stamp}.json"`
		}
	});
};
