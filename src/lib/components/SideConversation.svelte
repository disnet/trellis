<script lang="ts">
	import { untrack } from 'svelte';
	import DiscussionMarkdown from './DiscussionMarkdown.svelte';
	import { workspace as ws } from '$lib/workspace.svelte';
	import { CHAT_MESSAGE_LIMIT, type Conversation } from '$lib/types';
	let { thoughtId, operationId }: { thoughtId?: string; operationId?: string } = $props();
	const key = $derived(`${ws.activeGraphId}:${operationId ?? thoughtId}`);
	let conversations = $state<Conversation[]>([]);
	let loading = $state(false);
	let error = $state('');
	let opened = $state(false);
	let messageList: HTMLDivElement;
	const busy = $derived(ws.conversationRequests[key] ?? false);
	const latest = $derived(conversations.at(-1));
	const unanswered = $derived(latest?.messages.at(-1)?.role === 'user' ? latest.messages.at(-1) : undefined);
	let serial = 0;

	async function load() {
		const request = ++serial;
		loading = true;
		try {
			const params = new URLSearchParams(operationId ? { operationId } : { thoughtId: thoughtId! });
			const response = await fetch(`/api/conversations?${params}`);
			const data = await response.json();
			if (request !== serial) return;
			if (!response.ok) throw new Error(data.error || 'Could not load the discussion.');
			if (data.graphId !== ws.activeGraphId) return;
			conversations = data.conversations;
		} catch (e) { if (request === serial) error = (e as Error).message; }
		finally { if (request === serial) loading = false; }
	}
	$effect(() => {
		void key;
		conversations = [];
		error = '';
		opened = false;
		return () => { serial++; };
	});
	// Another mounted view may have sent a message; refresh after it finishes.
	$effect(() => { void key; if (!busy) untrack(load); });
	$effect(() => {
		void conversations.reduce((n, c) => n + c.messages.length, 0);
		if (!opened || !messageList) return;
		const frame = requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
		return () => cancelAnimationFrame(frame);
	});

	async function send() {
		if (busy || loading) return;
		const requestKey = key;
		const graphId = ws.activeGraphId;
		const body = unanswered?.body ?? (ws.conversationDrafts[key] ?? '').trim();
		if (!body) return;
		const messageId = unanswered?.id ?? crypto.randomUUID();
		ws.conversationRequests[requestKey] = true;
		error = '';
		if (!latest) conversations = [{ id: 'sending', graphId, thoughtId: thoughtId ?? null, operationId: operationId ?? null, title: '', messages: [] }];
		const active = conversations.at(-1)!;
		if (!active.messages.some(m => m.id === messageId)) active.messages.push({ id: messageId, role: 'user', body, createdAt: Date.now() });
		try {
			const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graphId, thoughtId, operationId, body, messageId, selection: { ...ws.modelSelection } }) });
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Could not get a reply.');
			if (requestKey === key) conversations = data.conversations;
			if (ws.conversationDrafts[requestKey]?.trim() === body) ws.conversationDrafts[requestKey] = '';
		} catch (e) { if (requestKey === key) error = (e as Error).message; }
		finally {
			ws.conversationRequests[requestKey] = false;
		}
	}
	async function propose() {
		if (!latest) return;
		const err = await ws.proposeFromConversation(latest.id);
		if (err) error = err;
	}
</script>

<details class="discussion" bind:open={opened} ontoggle={(event) => { if (event.currentTarget.open && !busy) void load(); }}>
	<summary>Discuss{conversations.length ? ` · ${conversations.reduce((n, c) => n + c.messages.length, 0)} messages` : ''}</summary>
	<p class="hint">Clarify this {operationId ? 'proposed thought' : 'thought'} together. Replies stay here; discussions inform later agent operations.</p>
	{#if loading && !conversations.length}<p class="hint" role="status">Loading discussion…</p>{/if}
	<div class="messages" bind:this={messageList} role="log" aria-label="Side conversation">
		{#each conversations as conversation (conversation.id)}
			{#if conversations.length > 1}<p class="thread-title">{conversation.title}</p>{/if}
			{#each conversation.messages as message (message.id)}
				<article>
					<div class="byline">{message.role === 'user' ? 'You' : 'Agent'} <span>{new Date(message.createdAt).toLocaleString()}{message.model ? ` · ${message.model}` : ''}</span></div>
					<DiscussionMarkdown body={message.body} />
				</article>
			{/each}
		{/each}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if busy}<p class="hint" role="status">Thinking… Your message is being saved with this thought.</p>{/if}
	{#if unanswered && !busy}
		<p class="hint">Your message is saved. Retry to get a reply.</p>
		<button onclick={send} disabled={loading}>Retry reply</button>
	{:else}
		<form onsubmit={(event) => { event.preventDefault(); void send(); }}>
			<label for={`message-${operationId ?? thoughtId}`}>Message about this thought</label>
			<textarea id={`message-${operationId ?? thoughtId}`} value={ws.conversationDrafts[key] ?? ''} oninput={(event) => ws.conversationDrafts[key] = event.currentTarget.value} rows="3" maxlength={CHAT_MESSAGE_LIMIT} placeholder="What do you mean by…" disabled={busy} onkeydown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void send(); } }}></textarea>
			<div class="actions"><button type="submit" disabled={busy || loading || !ws.conversationDrafts[key]?.trim()}>Send</button><span class="hint">Uses the selected model</span></div>
		</form>
	{/if}
	{#if latest?.messages.some(m => m.role === 'assistant')}
		<div class="handoff"><button onclick={propose} disabled={busy || !!unanswered || !!ws.invoking}>{ws.invoking ? 'Generating proposals…' : 'Propose thoughts'}</button><p class="hint">Turn this discussion into changes for review, or {operationId ? 'edit the proposal above' : 'use Revise above to write your own revision'}.</p></div>
	{/if}
</details>

<style>
	.discussion { margin-top: 16px; border-top: 1px solid var(--hairline); padding-top: 12px; color: var(--ink-soft); }
	summary { cursor: pointer; font-size: var(--fs-13); font-weight: 600; }
	.hint { color: var(--ink-muted); font-size: var(--fs-11); line-height: 1.5; }
	.messages { max-height: 420px; overflow-y: auto; overflow-wrap: anywhere; }
	article { padding: 12px 0; border-bottom: 1px solid var(--divider); }
	.byline, .thread-title { font-size: var(--fs-11); font-weight: 600; }
	.byline span { font-weight: 400; color: var(--ink-muted); font-size: var(--fs-10); }
	form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
	label { font-size: var(--fs-11); }
	textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 72px; font: inherit; font-size: var(--fs-13); line-height: 1.5; padding: 8px; color: var(--ink); background: var(--paper-raised); border: 1px solid var(--control-border); border-radius: 6px; }
	button { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--control-border); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
	button:hover:not(:disabled) { color: var(--blue); border-color: var(--blue); }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	.handoff { margin-top: 16px; }
	.error { font-size: var(--fs-12); color: var(--rust); }
</style>
