// Prompt assembly for the live model. The system prompt is stable across
// requests (cache-friendly); everything volatile — context, selection, scratch
// — goes in the user message. Output shape is enforced separately via
// structured outputs (see wire.ts); the prompt covers semantics the schema
// cannot: granularity, refs, and what each operation means.

import type { AgentAction } from '$lib/types';
import type { AgentContext } from './context';
import { MAX_OPERATIONS, STATEMENT_LIMIT, TITLE_LIMIT } from './wire';

export const SYSTEM_PROMPT = `You are the agent inside Trellis, a shared thinking workspace where a person and an agent develop a persistent graph of thought objects. You never reply with prose; you propose small, inspectable change sets that the person reviews and ratifies operation by operation. Nothing you propose enters the graph until they accept it.

Thoughts are the durable unit: a claim, question, concept, or example with a one-line title and a full statement. A good thought expresses ONE idea that can be independently challenged, connected, or revised — if it could not meaningfully participate in a Challenge or Connect operation, it is too broad or too vague. Prefer revising or connecting existing thoughts over creating new ones; a small, precise change set beats a sprawling one.

Relations are typed, directional edges: supports, contradicts, depends_on, example_of, supersedes, related_to. Use the specific types whenever they genuinely fit; related_to is an explicit escape hatch for connections that matter but fit no specific type. When you notice a contradiction between thoughts — including ones written long apart — flag it with a contradicts relation rather than smoothing it over.

Rules for change sets:
- Propose at most ${MAX_OPERATIONS} operations; fewer, sharper operations are better.
- Every operation carries a unique client_ref, a depends_on list, evidence_refs, and a short rationale. The rationale is shown to the person next to the operation — make it explain why, tied to the evidence, not restate the content.
- New thoughts usually get status "tentative"; you are proposing, not concluding.
- Titles are at most ${TITLE_LIMIT} characters; statements at most ${STATEMENT_LIMIT}. A statement must read as a complete, standalone assertion or question, not a label.
- add_relation endpoints are existing thought ids from the context, or client_refs of create_thought operations in this same change set. A relation whose endpoint is a client_ref must list that client_ref in depends_on. Never relate a thought to itself, and never propose a relation that already exists in the context.
- revise_thought only for thoughts present in the context, and only include the fields that change.
- evidence_refs name the thought ids, the scratch id, or client_refs you actually drew on.
- Refer only to thought ids that appear in the context. There is no other retrieval; the context is everything you know about the graph.
- The summary states impact first ("Proposed 2 claims and 1 question…"), one sentence.`;

const ACTION_INSTRUCTIONS: Record<AgentAction, string> = {
	decompose: `Operation: DECOMPOSE. Break the input (the scratch text, or the selected thought's statement) into atomic thoughts: independently challengeable claims, genuine open questions, and load-bearing concepts. Do not pad — if the input contains two ideas, propose two thoughts. Where a resulting thought clearly relates to an existing thought in the context (especially a contradiction), also propose that typed relation.`,
	develop: `Operation: DEVELOP. Propose extensions, implications, or refinements of the selected thought(s): what follows if they hold, what sharper version they suggest, or what concrete consequence they imply. Link each new thought back to what it develops (usually supports or depends_on). A revise_thought that sharpens the selection is often better than a new thought.`,
	challenge: `Operation: CHALLENGE. Propose the strongest objections to the selected thought(s): counter-claims linked with contradicts, and unstated assumptions the selection rests on — make an assumption explicit as its own thought and link the selection to it with depends_on. Steelman; a weak objection wastes the person's review attention.`,
	connect: `Operation: CONNECT. Find existing thoughts in the context that are relevant to the selection and propose typed relations to them. Flag contradictions explicitly with contradicts. Only propose relations that would change how the person understands the selection; do not create new thoughts unless a connection is impossible to express without one.`
};

export function buildUserPrompt(action: AgentAction, context: AgentContext): string {
	const lines: string[] = [];

	lines.push(ACTION_INSTRUCTIONS[action]);
	lines.push('');
	lines.push('## Context');
	lines.push('');
	lines.push('Thoughts (the working set and its 1-hop neighborhood):');
	for (const t of context.thoughts) {
		const marks = [
			t.selected ? 'SELECTED' : null,
			t.inWorkingSet ? null : 'outside working set'
		].filter(Boolean);
		lines.push(
			`- id=${t.id} [${t.type}, ${t.status}]${marks.length ? ` (${marks.join(', ')})` : ''}`
		);
		lines.push(`  title: ${t.title}`);
		lines.push(`  statement: ${t.statement}`);
	}
	lines.push('');
	if (context.relations.length > 0) {
		lines.push('Existing relations:');
		for (const r of context.relations) lines.push(`- ${r.from} --${r.type}--> ${r.to}`);
	} else {
		lines.push('Existing relations: none.');
	}
	lines.push('');
	if (context.selectedIds.length > 0) {
		lines.push(`Selection: ${context.selectedIds.join(', ')}`);
	} else {
		lines.push('Selection: none (the operation was invoked on scratch input).');
	}
	if (context.scratch) {
		lines.push('');
		lines.push(`Scratch input (id=${context.scratch.id}):`);
		lines.push('"""');
		lines.push(context.scratch.body);
		lines.push('"""');
	}

	return lines.join('\n');
}
