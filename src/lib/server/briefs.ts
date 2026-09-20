// Briefs: the one graph-scoped conversation a graph may have open at a time.
// It starts from the search palette, runs a few turns with the brief agent,
// and ends in exactly one of two ways — the person runs the brief (which
// stages an ordinary change set and retires the brief) or discards it. Nothing
// here touches thought state.

import crypto from 'node:crypto';
import { z } from 'zod';
import { activeGraphId, db } from './db';
import { BRIEF_INSTRUCTION_LIMIT, isBriefConversation, type Brief, type Conversation } from '$lib/types';
import type { ModelSelection } from '$lib/models';
import { generateBriefReply } from './agent/brief';
import { appendUserMessage, checkMessage, conversationExcerpt, conversationsForGraph, withConversationLock } from './conversations';

const BRIEF_TITLE_LIMIT = 80;

/** The brief still being drafted for this graph, if any. */
export function openBrief(graphId = activeGraphId()): Conversation | undefined {
	return conversationsForGraph(graphId).filter(c => isBriefConversation(c) && !c.changeSetId).at(-1);
}

const briefSchema = z.object({
	action: z.enum(['decompose', 'develop', 'challenge', 'connect']),
	thoughtIds: z.array(z.string().min(1).max(100)).max(24),
	instruction: z.string().trim().max(BRIEF_INSTRUCTION_LIMIT),
	ready: z.boolean()
}).strict();

/** Validates a person-edited brief from the client. */
export function parseBrief(input: unknown): Brief {
	const parsed = briefSchema.safeParse(input);
	if (!parsed.success) throw new Error('Invalid brief.');
	return { ...parsed.data, thoughtIds: [...new Set(parsed.data.thoughtIds)] };
}

export async function sendBriefMessage(body: string, messageId: string, selection: ModelSelection, reply = generateBriefReply): Promise<Conversation> {
	checkMessage(body);
	const graphId = activeGraphId();
	let conversation = openBrief(graphId);
	if (!conversation) {
		const title = body.trim().replace(/\s+/g, ' ').slice(0, BRIEF_TITLE_LIMIT);
		conversation = { id: crypto.randomUUID(), graphId, thoughtId: null, operationId: null, title, messages: [], brief: null, changeSetId: null };
		db.prepare('INSERT INTO conversations (id, graph_id, thought_id, operation_id, title, created_at) VALUES (?, ?, NULL, NULL, ?, ?)').run(conversation.id, graphId, title, Date.now());
	}
	const active = conversation;
	return withConversationLock(active.id, 'A reply is already in progress for this brief.', async () => {
		const { needsReply, appended } = appendUserMessage(active, messageId, body);
		if (!needsReply) return active;
		if (appended) db.prepare('UPDATE conversations SET messages = ? WHERE id = ?').run(JSON.stringify(active.messages), active.id);
		const response = await reply(conversationExcerpt(active), graphId, selection);
		active.messages.push({ id: crypto.randomUUID(), role: 'assistant', body: response.body, createdAt: Date.now(), model: response.model, consulted: response.consulted });
		// A turn that returns no brief keeps the previous draft: the agent may
		// simply be answering a question, and the card should not blink away.
		if (response.brief) active.brief = response.brief;
		db.prepare('UPDATE conversations SET messages = ?, brief = ? WHERE id = ?').run(JSON.stringify(active.messages), active.brief ? JSON.stringify(active.brief) : null, active.id);
		return active;
	});
}

/** Forgets the open brief. Ran briefs stay as provenance for their change set. */
export function discardBrief(graphId = activeGraphId()): boolean {
	const brief = openBrief(graphId);
	if (!brief) return false;
	db.prepare('DELETE FROM conversations WHERE id = ?').run(brief.id);
	return true;
}
