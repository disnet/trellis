import { json } from '@sveltejs/kit';
import { activeGraphId } from '$lib/server/db';
import { connectWriter } from '$lib/server/publish/connect';
import { withdrawGarden } from '$lib/server/publish/release';
import type { RequestHandler } from './$types';

/** Take the whole garden down: the front-door record first, then every other
 *  record. Local state is untouched; third-party copies cannot be recalled. */
export const POST: RequestHandler = async () => {
	const graphId = activeGraphId();
	try {
		const connection = await connectWriter();
		if ('error' in connection) return json({ error: connection.error }, { status: 400 });
		const outcome = await withdrawGarden(graphId, connection.writer);
		return json({ outcome });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Withdrawal failed.' }, { status: 400 });
	}
};
