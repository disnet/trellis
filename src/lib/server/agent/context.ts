// Deterministic context assembly (docs/design.md "Agent contract"): the
// selection plus the active working set is the agent's focus; thoughts are the
// focus plus its 1-hop neighborhood, and relations are those among that pool.
// For Connect and Challenge — the operations whose point is finding what the
// person did NOT select — a graph-wide relevance search adds a few more
// thoughts, and everything it pulls in is disclosed: flagged here, recorded on
// the change set as `consulted`, and shown to the person. Retrieval is never
// hidden. Ordering and scoring are stable (created_at, id) so identical graph
// state always produces an identical request.

import { activeGraphId, activeWorkingSetId, db } from '../db';
import { conversationsForGraph, conversationExcerpt } from '../conversations';
import type { Conversation } from '$lib/types';
import type { ResolvedLink } from './links';
import type { AgentAction, Confidence, RelationType, ThoughtStatus, ThoughtType } from '$lib/types';

export interface ContextThought {
	id: string;
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	confidence?: Confidence;
	source?: string;
	/** Selection ∪ active working set — what the person is pointing at. */
	inFocus: boolean;
	selected: boolean;
	/** Pulled in by graph-wide relevance search (Connect / Challenge only). */
	retrieved: boolean;
}

export interface ContextRelation {
	from: string;
	to: string;
	type: RelationType;
}

export interface AgentContext {
	conversations?: Conversation[];
	thoughts: ContextThought[];
	relations: ContextRelation[];
	selectedIds: string[];
	/** Ids of thoughts the graph-wide search added, in relevance order. */
	retrievedIds: string[];
	scratch?: { id: string; body: string };
	/**
	 * Links from the scratch input and the focus that the server read on the
	 * agent's behalf (see links.ts). Populated after buildContext, which stays
	 * synchronous and network-free.
	 */
	links?: ResolvedLink[];
}

/** How many graph-wide search results may join the context. */
const RETRIEVAL_LIMIT = 8;
/** A candidate must share at least this many content terms with the selection. */
const RETRIEVAL_MIN_OVERLAP = 2;

const STOPWORDS = new Set([
	'about', 'after', 'again', 'against', 'because', 'been', 'before', 'being',
	'between', 'both', 'could', 'does', 'doing', 'down', 'during', 'each',
	'every', 'from', 'have', 'having', 'here', 'into', 'itself', 'just', 'like',
	'made', 'make', 'makes', 'many', 'more', 'most', 'much', 'must', 'need',
	'needs', 'never', 'only', 'other', 'over', 'same', 'should', 'since', 'some',
	'somewhere', 'still', 'such', 'than', 'that', 'their', 'them', 'then',
	'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until',
	'very', 'well', 'were', 'what', 'when', 'where', 'which', 'while',
	'will', 'with', 'without', 'would', 'your'
]);

function terms(text: string): Set<string> {
	const out = new Set<string>();
	for (const word of text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) ?? []) {
		if (!STOPWORDS.has(word)) out.add(word);
	}
	return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function buildContext(
	action: AgentAction,
	selectedIds: string[],
	scratch?: { id: string; body: string }
): AgentContext {
	// Everything below is scoped to the active graph — isolation is total, so a
	// proposal can never draw on or reference another graph's thoughts.
	const graphId = activeGraphId();
	const activeSet = activeWorkingSetId(graphId);
	const focusIds = new Set<string>(
		activeSet
			? (
					db
						.prepare('SELECT thought_id FROM working_set_items WHERE working_set_id = ?')
						.all(activeSet) as any[]
				).map((r) => r.thought_id)
			: []
	);
	for (const id of selectedIds) focusIds.add(id);

	const relations = db
		.prepare(
			'SELECT from_thought_id, to_thought_id, type FROM relations WHERE graph_id = ? ORDER BY created_at, rowid'
		)
		.all(graphId) as any[];

	// 1-hop neighborhood of the focus (working set plus the selection).
	const pool = new Set(focusIds);
	for (const r of relations) {
		if (focusIds.has(r.from_thought_id)) pool.add(r.to_thought_id);
		if (focusIds.has(r.to_thought_id)) pool.add(r.from_thought_id);
	}

	const rows = db
		.prepare('SELECT * FROM thoughts WHERE graph_id = ? ORDER BY created_at, id')
		.all(graphId) as any[];

	// Graph-wide relevance search for the discovery operations: rank thoughts
	// outside the pool by content-term overlap with the selection. Deterministic
	// (term overlap, then age, then id) — same graph, same selection, same result.
	const retrievedIds: string[] = [];
	if ((action === 'connect' || action === 'challenge') && selectedIds.length > 0) {
		const selected = new Set(selectedIds);
		const queryTerms = new Set<string>();
		for (const r of rows) {
			if (selected.has(r.id))
				for (const t of terms(`${r.title} ${r.statement}`)) queryTerms.add(t);
		}
		const scored = rows
			.filter((r) => !pool.has(r.id))
			.map((r) => {
				let score = 0;
				for (const t of terms(`${r.title} ${r.statement}`)) if (queryTerms.has(t)) score += 1;
				return { id: r.id, score };
			})
			.filter((s) => s.score >= RETRIEVAL_MIN_OVERLAP)
			.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
			.slice(0, RETRIEVAL_LIMIT);
		for (const s of scored) {
			pool.add(s.id);
			retrievedIds.push(s.id);
		}
	}

	const selected = new Set(selectedIds);
	const retrieved = new Set(retrievedIds);
	const thoughts = rows
		.filter((r) => pool.has(r.id))
		.map((r) => ({
			id: r.id,
			type: r.type,
			status: r.status,
			title: r.title,
			statement: r.statement,
			confidence: r.confidence ? JSON.parse(r.confidence) : undefined,
			source: r.source ?? undefined,
			inFocus: focusIds.has(r.id),
			selected: selected.has(r.id),
			retrieved: retrieved.has(r.id)
		}));
	// A still-proposed thought's discussion remains attached to the selection
	// that produced it. Once ratified, its own stable thought id owns the thread.
	const proposalSources = new Map((db.prepare(`SELECT o.id, c.invoked_on FROM proposed_operations o JOIN change_sets c ON c.id = o.change_set_id WHERE c.graph_id = ? AND c.status = 'pending' AND o.decision != 'rejected'`).all(graphId) as { id: string; invoked_on: string }[])
		.map(row => [row.id, JSON.parse(row.invoked_on) as string[]]));

	return {
		conversations: conversationsForGraph(graphId)
			.filter(c => c.messages.length && (c.thoughtId ? pool.has(c.thoughtId) : c.operationId && proposalSources.get(c.operationId)?.some(id => pool.has(id))))
			.map(conversationExcerpt),
		thoughts,
		relations: relations
			.filter((r) => pool.has(r.from_thought_id) && pool.has(r.to_thought_id))
			.map((r) => ({ from: r.from_thought_id, to: r.to_thought_id, type: r.type })),
		selectedIds,
		retrievedIds,
		scratch
	};
}
