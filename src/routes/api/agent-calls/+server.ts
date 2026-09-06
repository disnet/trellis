import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// GET /api/agent-calls          → the most recent attempts, newest first,
//                                 without the large request/output payloads.
// GET /api/agent-calls?id=...   → one attempt in full (request and raw output),
//                                 fetched lazily when a log row is expanded.
// Read-only over the agent_calls evaluation log; the log is global (calls are
// not graph-scoped), so no graph filter applies.

interface CallRow {
	id: string;
	action: string;
	adapter: string;
	model: string;
	attempt: number;
	request?: string;
	raw_output?: string | null;
	validation_errors: string | null;
	error: string | null;
	latency_ms: number;
	usage: string | null;
	effort: string | null;
	change_set_id: string | null;
	created_at: number;
}

function parseErrors(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [raw];
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (id) {
		const row = db
			.prepare(
				`SELECT id, action, adapter, model, attempt, request, raw_output,
				        validation_errors, error, latency_ms, usage, effort, change_set_id, created_at
				 FROM agent_calls WHERE id = ?`
			)
			.get(id) as CallRow | undefined;
		if (!row) return json({ error: 'No such call.' }, { status: 404 });
		return json({
			call: {
				id: row.id,
				action: row.action,
				adapter: row.adapter,
				model: row.model,
				attempt: row.attempt,
				request: row.request ?? '',
				rawOutput: row.raw_output ?? null,
				validationErrors: parseErrors(row.validation_errors),
				error: row.error,
				latencyMs: row.latency_ms,
				usage: row.usage,
				effort: row.effort,
				changeSetId: row.change_set_id,
				createdAt: row.created_at
			}
		});
	}

	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 1000);
	const rows = db
		.prepare(
			`SELECT id, action, adapter, model, attempt, validation_errors, error,
			        latency_ms, usage, effort, change_set_id, created_at
			 FROM agent_calls ORDER BY created_at DESC, rowid DESC LIMIT ?`
		)
		.all(limit) as CallRow[];
	return json({
		calls: rows.map((row) => ({
			id: row.id,
			action: row.action,
			adapter: row.adapter,
			model: row.model,
			attempt: row.attempt,
			validationErrors: parseErrors(row.validation_errors),
			error: row.error,
			latencyMs: row.latency_ms,
			usage: row.usage,
			effort: row.effort,
			changeSetId: row.change_set_id,
			createdAt: row.created_at
		}))
	});
};
