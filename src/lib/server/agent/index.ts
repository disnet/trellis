// Orchestrates one agent invocation: build context, ask the adapter, validate,
// give the live model one corrective retry on validation failure, and log every
// attempt (inputs, raw output, validation errors, latency) to agent_calls for
// evaluation. Nothing here writes to graph tables — the store persists the
// validated proposal as a *pending* change set, and applying it is a separate,
// human-initiated transaction.

import crypto from 'node:crypto';
import { db } from '../db';
import type { AgentAction } from '$lib/types';
import { buildContext } from './context';
import {
	describeGenerationError,
	selectAdapter,
	type AdapterRequest,
	type ModelAdapter
} from './adapter';
import { validateProposal, type ValidationDeps } from './validate';
import type { AgentProposal } from './wire';

export type GenerateOutcome =
	| { ok: true; proposal: AgentProposal; callId: string }
	| { ok: false; error: string };

// Dev-console trace of the agent pipeline, alongside the durable agent_calls
// log — watch invocations, latency, validation retries, and outcomes in the
// terminal running `npm run dev`.
const log = (msg: string) => console.log(`\x1b[36m[trellis:agent]\x1b[0m ${msg}`);

const insertCall = () =>
	db.prepare(
		`INSERT INTO agent_calls
		   (id, action, adapter, model, attempt, request, raw_output, validation_errors, error, latency_ms, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

function logAttempt(fields: {
	action: AgentAction;
	adapter: ModelAdapter;
	attempt: number;
	request: string;
	rawOutput: string | null;
	validationErrors: string[] | null;
	error: string | null;
	latencyMs: number;
}): string {
	const id = `call-${crypto.randomUUID().slice(0, 8)}`;
	insertCall().run(
		id,
		fields.action,
		fields.adapter.name,
		fields.adapter.model,
		fields.attempt,
		fields.request,
		fields.rawOutput,
		fields.validationErrors ? JSON.stringify(fields.validationErrors) : null,
		fields.error,
		fields.latencyMs,
		Date.now()
	);
	return id;
}

/** Called by the store after inserting the change set, to tie the log together. */
export function linkCallToChangeSet(callId: string, changeSetId: string): void {
	db.prepare('UPDATE agent_calls SET change_set_id = ? WHERE id = ?').run(changeSetId, callId);
}

export async function generateProposal(
	action: AgentAction,
	selectedIds: string[],
	scratch?: { id: string; body: string }
): Promise<GenerateOutcome> {
	const thoughtExists = db.prepare('SELECT 1 FROM thoughts WHERE id = ?');
	const relationExists = db.prepare(
		'SELECT 1 FROM relations WHERE from_thought_id = ? AND to_thought_id = ? AND type = ?'
	);
	const validationDeps: ValidationDeps = {
		thoughtExists: (id) => !!thoughtExists.get(id),
		relationExists: (from, to, type) => !!relationExists.get(from, to, type),
		scratchId: scratch?.id
	};

	const adapter = selectAdapter({ thoughtExists: validationDeps.thoughtExists });
	const context = buildContext(selectedIds, scratch);
	log(
		`${action} via ${adapter.name} (${adapter.model}) — context: ${context.thoughts.length} thoughts, ` +
			`${context.relations.length} relations, ${selectedIds.length} selected${scratch ? ', scratch input' : ''}`
	);

	// Attempt, validate; model-backed adapters get one corrective retry with
	// the validation errors fed back. Fixtures are deterministic — retrying is
	// pointless, and a fixture that fails validation is a bug worth surfacing.
	const maxAttempts = adapter.name === 'fixture' ? 1 : 2;
	let feedback: AdapterRequest['feedback'];

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const started = Date.now();
		let raw: string | null = null;
		let proposal: unknown;
		let request = '';
		let usage: string | undefined;
		try {
			const result = await adapter.generate({ action, context, feedback });
			raw = result.raw;
			proposal = result.proposal;
			request = result.request;
			usage = result.usage;
		} catch (e) {
			const error = describeGenerationError(e);
			log(`attempt ${attempt}: ✗ ${error} (${Date.now() - started}ms)`);
			logAttempt({
				action,
				adapter,
				attempt,
				request,
				rawOutput: raw,
				validationErrors: null,
				error,
				latencyMs: Date.now() - started
			});
			return { ok: false, error };
		}

		const validated = validateProposal(proposal, validationDeps);
		const latencyMs = Date.now() - started;
		const callId = logAttempt({
			action,
			adapter,
			attempt,
			request,
			rawOutput: raw,
			validationErrors: validated.ok ? null : validated.errors,
			error: null,
			latencyMs
		});

		if (validated.ok) {
			const p = validated.proposal;
			log(
				`attempt ${attempt}: ✓ ${p.operations.length} op${p.operations.length === 1 ? '' : 's'} in ` +
					`${latencyMs}ms${usage ? ` (${usage})` : ''} — “${p.summary}”`
			);
			return { ok: true, proposal: p, callId };
		}
		log(
			`attempt ${attempt}: invalid proposal after ${latencyMs}ms — ${validated.errors.join('; ')}` +
				(attempt < maxAttempts ? ' — retrying with feedback' : ' — giving up')
		);
		feedback = { raw: raw ?? '', errors: validated.errors };
	}

	return {
		ok: false,
		error: `The ${adapter.name === 'fixture' ? 'fixture' : 'model'} returned an invalid change set (${
			feedback!.errors[0]
		}). Nothing was changed — invoke the operation again.`
	};
}
