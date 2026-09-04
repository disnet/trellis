// Deterministic context assembly (docs/design.md "Agent contract"): the
// selection plus the working set is exactly the agent's context — no hidden
// retrieval. Thoughts are the working set plus its 1-hop neighborhood;
// relations are those among that pool. Ordering is stable (created_at, id) so
// identical graph state always produces an identical request.

import { db } from '../db';
import type { RelationType, ThoughtStatus, ThoughtType } from '$lib/types';

export interface ContextThought {
	id: string;
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	inWorkingSet: boolean;
	selected: boolean;
}

export interface ContextRelation {
	from: string;
	to: string;
	type: RelationType;
}

export interface AgentContext {
	thoughts: ContextThought[];
	relations: ContextRelation[];
	selectedIds: string[];
	scratch?: { id: string; body: string };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function buildContext(
	selectedIds: string[],
	scratch?: { id: string; body: string }
): AgentContext {
	const workingIds = new Set<string>(
		(db.prepare('SELECT thought_id FROM working_set_items').all() as any[]).map(
			(r) => r.thought_id
		)
	);
	for (const id of selectedIds) workingIds.add(id);

	const relations = db
		.prepare('SELECT from_thought_id, to_thought_id, type FROM relations ORDER BY created_at, rowid')
		.all() as any[];

	// 1-hop neighborhood of the working set (plus the selection).
	const pool = new Set(workingIds);
	for (const r of relations) {
		if (workingIds.has(r.from_thought_id)) pool.add(r.to_thought_id);
		if (workingIds.has(r.to_thought_id)) pool.add(r.from_thought_id);
	}

	const selected = new Set(selectedIds);
	const thoughts = (
		db.prepare('SELECT * FROM thoughts ORDER BY created_at, id').all() as any[]
	)
		.filter((r) => pool.has(r.id))
		.map((r) => ({
			id: r.id,
			type: r.type,
			status: r.status,
			title: r.title,
			statement: r.statement,
			inWorkingSet: workingIds.has(r.id),
			selected: selected.has(r.id)
		}));

	return {
		thoughts,
		relations: relations
			.filter((r) => pool.has(r.from_thought_id) && pool.has(r.to_thought_id))
			.map((r) => ({ from: r.from_thought_id, to: r.to_thought_id, type: r.type })),
		selectedIds,
		scratch
	};
}
