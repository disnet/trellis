import crypto from 'node:crypto';
import { db, activeGraphId } from './db';
import { CHAT_MESSAGE_LIMIT, type Conversation, type ConversationTarget, type OperationPayload } from '$lib/types';
import type { ModelSelection } from '$lib/models';
import { generateReply } from './agent/chat';

interface Row { id: string; graph_id: string; thought_id: string | null; operation_id: string | null; title: string; messages: string; subject: string | null }
const map = (r: Row): Conversation => ({ id: r.id, graphId: r.graph_id, thoughtId: r.thought_id, operationId: r.operation_id, title: r.title, messages: JSON.parse(r.messages), subject: r.subject ? JSON.parse(r.subject) : undefined });

export function conversationsForGraph(graphId = activeGraphId()): Conversation[] {
	return (db.prepare('SELECT * FROM conversations WHERE graph_id = ? ORDER BY created_at, rowid').all(graphId) as Row[]).map(map);
}

export function resolveTarget(target: ConversationTarget, graphId = activeGraphId()): { title: string; thoughtId: string | null; operationId?: string; material: unknown; subject: NonNullable<Conversation['subject']> } {
	if (!!target.thoughtId === !!target.operationId) throw new Error('Choose one thought or proposed thought.');
	if (target.thoughtId) {
		const thought = db.prepare('SELECT id, title, statement, type, status, confidence, source FROM thoughts WHERE id = ? AND graph_id = ?').get(target.thoughtId, graphId) as { id: string; title: string; statement: string } | undefined;
		if (!thought) throw new Error('Unknown thought.');
		const origin = db.prepare('SELECT o.id FROM proposed_operations o JOIN change_sets c ON c.id = o.change_set_id WHERE o.applied_thought_id = ? AND c.graph_id = ?').get(thought.id, graphId) as { id: string } | undefined;
		return { title: thought.title, thoughtId: thought.id, operationId: origin?.id, material: { state: 'canonical', thought }, subject: { title: thought.title, statement: thought.statement, proposed: false } };
	}
	const row = db.prepare(`SELECT o.payload, o.edited_payload, o.rationale, o.applied_thought_id, o.decision, c.status FROM proposed_operations o JOIN change_sets c ON c.id = o.change_set_id WHERE o.id = ? AND c.graph_id = ?`).get(target.operationId!, graphId) as { payload: string; edited_payload: string | null; rationale: string; applied_thought_id: string | null; decision: string; status: string } | undefined;
	if (!row) throw new Error('Unknown proposed thought.');
	const payload = JSON.parse(row.edited_payload ?? row.payload) as OperationPayload;
	if (payload.op === 'add_relation') throw new Error('Discuss a thought, not a relation.');
	const base = payload.op === 'revise_thought' ? resolveTarget({ thoughtId: payload.thoughtId }, graphId) : undefined;
	const title = payload.thought.title ?? base?.title ?? 'Proposed revision';
	return { title, thoughtId: row.applied_thought_id ?? base?.thoughtId ?? null, material: { state: `proposal (${row.status}, operation ${row.decision})`, payload, rationale: row.rationale, current: base?.material }, subject: { title, statement: payload.thought.statement ?? base?.subject.statement ?? '', proposed: true } };
}

export function getConversations(target: ConversationTarget, graphId = activeGraphId()) {
	resolveTarget(target, graphId);
	return conversationsForGraph(graphId).filter(c => target.operationId ? c.operationId === target.operationId : c.thoughtId === target.thoughtId);
}

/** Bound context by whole messages; disclose omissions instead of silently summarizing. */
export function conversationExcerpt(c: Conversation): Conversation {
	let size = 0;
	const messages = [];
	for (const m of [...c.messages].reverse()) {
		if (size + m.body.length > 24000 || messages.length >= 24) break;
		messages.unshift(m);
		size += m.body.length;
	}
	return { ...c, title: c.title + (messages.length < c.messages.length ? ' (older messages omitted)' : ''), messages };
}

const busy = new Set<string>();
export async function sendMessage(target: ConversationTarget, body: string, messageId: string, selection: ModelSelection, reply = generateReply) {
	if (!body.trim() || body.length > CHAT_MESSAGE_LIMIT) throw new Error(`Write a message of at most ${CHAT_MESSAGE_LIMIT} characters.`);
	const graphId = activeGraphId();
	const subject = resolveTarget(target, graphId);
	let conversation = getConversations(target, graphId).at(-1);
	if (!conversation) {
		conversation = { id: crypto.randomUUID(), graphId, thoughtId: subject.thoughtId, operationId: target.operationId ?? subject.operationId ?? null, title: subject.title, messages: [] };
		db.prepare('INSERT INTO conversations (id, graph_id, thought_id, operation_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(conversation.id, graphId, conversation.thoughtId, conversation.operationId, conversation.title, Date.now());
	}
	const key = conversation.id;
	if (busy.has(key)) throw new Error('A reply is already in progress for this thought.');
	busy.add(key);
	try {
		const existing = conversation.messages.findIndex(m => m.id === messageId);
		if (existing >= 0) {
			if (conversation.messages[existing].body !== body.trim()) throw new Error('This message was already saved with different text.');
			if (conversation.messages[existing + 1]?.role === 'assistant') return conversation;
		} else {
			if (conversation.messages.at(-1)?.role === 'user') throw new Error('Retry the unanswered message before sending another.');
			conversation.messages.push({ id: messageId, role: 'user', body: body.trim(), createdAt: Date.now() });
			conversation.subject = subject.subject;
			db.prepare('UPDATE conversations SET messages = ?, subject = ? WHERE id = ?').run(JSON.stringify(conversation.messages), JSON.stringify(conversation.subject), conversation.id);
		}
		const relatedDiscussions = subject.thoughtId
			? conversationsForGraph(graphId).filter(c => c.thoughtId === subject.thoughtId && c.id !== conversation.id && c.messages.length).map(conversationExcerpt)
			: [];
		const response = await reply({ subject: subject.material, relatedDiscussions }, conversationExcerpt(conversation), selection);
		conversation.messages.push({ id: crypto.randomUUID(), role: 'assistant', body: response.body, createdAt: Date.now(), model: response.model });
		// Update only messages: ratification may have attached the target while awaiting a reply.
		db.prepare('UPDATE conversations SET messages = ? WHERE id = ?').run(JSON.stringify(conversation.messages), conversation.id);
		return conversation;
	} finally { busy.delete(key); }
}
