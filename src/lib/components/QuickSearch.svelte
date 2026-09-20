<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import { ACTION_NAMES, BRIEF_INSTRUCTION_LIMIT, CHAT_MESSAGE_LIMIT, type AgentAction, type Brief, type Thought } from '$lib/types';
	import DiscussionMarkdown from './DiscussionMarkdown.svelte';
	import Icon from './Icon.svelte';

	const ws = workspace;

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// The palette does double duty. Search is the default: type, pick a thought.
	// Ask (⌘↩, or the last row) hands the same text to the brief agent and the
	// palette becomes the brief: a short exchange that ends in an editable brief
	// card, whose Run button is the only way this surface reaches the graph —
	// and even then only by staging a change set for review.
	let mode = $state<'search' | 'brief'>('search');
	let query = $state('');
	let activeIndex = $state(0);
	let busy = $state(false);
	let inputEl = $state<HTMLInputElement>();
	let composerEl = $state<HTMLTextAreaElement>();
	let listEl = $state<HTMLElement>();
	let transcriptEl = $state<HTMLElement>();

	const RECENT_LIMIT = 9;
	const RESULT_LIMIT = 40;
	const ACTIONS: AgentAction[] = ['decompose', 'develop', 'challenge', 'connect'];

	type Row = { kind: 'thought'; t: Thought } | { kind: 'ask' } | { kind: 'continue' };

	const searching = $derived(query.trim().length > 0);
	const briefOpen = $derived(!!ws.brief && ws.brief.messages.length > 0);
	// With no query the modal is a launcher: an open brief to continue, pinned
	// landmarks, then the most recently touched thoughts. With a query it is
	// search, plus one row to ask the agent about the same words.
	const pinned = $derived(
		searching
			? []
			: ws.pinnedThoughtIds.map((id) => ws.thoughts[id]).filter((t) => t !== undefined)
	);
	const rest = $derived(
		searching
			? ws.searchGraph(query).slice(0, RESULT_LIMIT)
			: Object.values(ws.thoughts)
					.filter((t) => !ws.isPinned(t.id))
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.slice(0, RECENT_LIMIT)
	);
	const rows = $derived<Row[]>([
		...(!searching && briefOpen ? [{ kind: 'continue' } as Row] : []),
		...pinned.map((t) => ({ kind: 'thought', t }) as Row),
		...rest.map((t) => ({ kind: 'thought', t }) as Row),
		...(searching ? [{ kind: 'ask' } as Row] : [])
	]);
	const activeGroup = $derived(ws.workingSets.find((s) => s.id === ws.activeWorkingSetId));
	/** Index of the first pinned / recent thought row, for section labels. */
	const firstPinnedRow = $derived(!searching && briefOpen ? 1 : 0);
	const firstRecentRow = $derived(firstPinnedRow + pinned.length);

	// The brief card is the person's editable copy of the agent's draft. It
	// follows the agent's latest draft whenever that changes, and otherwise
	// keeps the person's edits.
	let card = $state<Brief | null>(null);
	let lastDraft = '';
	$effect(() => {
		const draft = ws.brief?.brief ?? null;
		const key = JSON.stringify(draft);
		if (key !== lastDraft) {
			lastDraft = key;
			card = draft ? { ...draft, thoughtIds: [...draft.thoughtIds] } : null;
		}
	});
	const cardNeedsTargets = $derived(!!card && card.action !== 'decompose' && card.thoughtIds.length === 0);
	const running = $derived(ws.briefRunning || !!ws.invoking);

	$effect(() => {
		if (open) {
			query = '';
			mode = 'search';
			void ws.loadBrief();
			queueMicrotask(() => inputEl?.focus());
		}
	});
	$effect(() => {
		if (open && mode === 'brief') queueMicrotask(() => composerEl?.focus());
	});
	// A new query restarts keyboard position at the top; other list changes
	// (an add flipping a row to "in group") keep the position, so a batch of
	// Enter-adds doesn't rewind between each one.
	$effect(() => {
		void query;
		activeIndex = 0;
	});
	$effect(() => {
		if (activeIndex >= rows.length) activeIndex = Math.max(0, rows.length - 1);
	});
	$effect(() => {
		listEl?.querySelector(`[data-row="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
	});
	$effect(() => {
		void ws.brief?.messages.length;
		void ws.briefBusy;
		if (mode !== 'brief' || !transcriptEl) return;
		const frame = requestAnimationFrame(() => {
			transcriptEl!.scrollTop = transcriptEl!.scrollHeight;
		});
		return () => cancelAnimationFrame(frame);
	});

	function close() {
		open = false;
	}

	/** Enter / click. Under a group lens the primary verb is add-and-stay-open,
	 *  so several thoughts can be gathered in one pass; without a lens (or for a
	 *  thought already in the group, or with ⇧ held) it jumps to the thought. */
	async function act(id: string, jump: boolean) {
		if (busy) return;
		if (!jump && ws.lensActive && !ws.inWorkingSet(id)) {
			busy = true;
			try {
				const err = await ws.addToSet([id]);
				if (err) ws.notice = err;
			} finally {
				busy = false;
			}
		} else {
			ws.select(id);
			close();
		}
	}

	function activate(row: Row, jump: boolean) {
		if (row.kind === 'thought') void act(row.t.id, jump);
		else if (row.kind === 'ask') void ask();
		else mode = 'brief';
	}

	/** Hands the query to the brief agent and switches the palette to the brief. */
	async function ask() {
		const text = query.trim();
		if (!text || ws.briefBusy) return;
		query = '';
		mode = 'brief';
		const err = await ws.sendBriefMessage(text);
		if (err) ws.briefError = err;
	}

	async function send() {
		if (ws.briefBusy) return;
		const err = await ws.sendBriefMessage(ws.briefDraft);
		if (err) ws.briefError = err;
	}

	async function retry() {
		const err = await ws.sendBriefMessage();
		if (err) ws.briefError = err;
	}

	async function run() {
		if (!card || running || cardNeedsTargets) return;
		const err = await ws.runBrief({ ...card, instruction: card.instruction.trim() });
		if (!err) {
			ws.notice = 'The brief ran. Review its proposal in the tray.';
			close();
		}
	}

	async function discard() {
		const err = await ws.discardBrief();
		if (err) ws.briefError = err;
		else {
			mode = 'search';
			queueMicrotask(() => inputEl?.focus());
		}
	}

	function removeTarget(id: string) {
		if (!card) return;
		card.thoughtIds = card.thoughtIds.filter((t) => t !== id);
	}

	function jumpTo(id: string) {
		if (!ws.thoughts[id]) return;
		ws.select(id);
		close();
	}

	async function focusNeighborhood(id: string) {
		if (busy) return;
		busy = true;
		try {
			const err = await ws.openNeighborhood(id);
			if (err) ws.notice = err;
			else close();
		} finally {
			busy = false;
		}
	}

	function browseAll() {
		ws.view = 'browse';
		close();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if (mode !== 'search') return;
		if (e.key === 'ArrowDown' && rows.length) {
			e.preventDefault();
			activeIndex = (activeIndex + 1) % rows.length;
		} else if (e.key === 'ArrowUp' && rows.length) {
			e.preventDefault();
			activeIndex = (activeIndex - 1 + rows.length) % rows.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if ((e.metaKey || e.ctrlKey) && searching) {
				void ask();
				return;
			}
			const row = rows[activeIndex];
			if (row) activate(row, e.shiftKey);
		}
	}

	function onComposerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void send();
		}
	}

	const thoughtTitle = (id: string) => ws.thoughts[id]?.title ?? 'A thought no longer in the graph';
</script>

{#if open}
	<div class="scrim" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && close()}>
		<div
			class="panel"
			class:brief-mode={mode === 'brief'}
			role="dialog"
			aria-modal="true"
			aria-label={mode === 'brief' ? 'Brief the agent' : 'Search the graph'}
			tabindex="-1"
			onkeydown={onKeydown}
		>
			{#if mode === 'search'}
				<div class="search-row">
					<Icon name="search" size="1em" />
					<input
						bind:this={inputEl}
						bind:value={query}
						type="text"
						role="combobox"
						aria-expanded="true"
						aria-controls="quick-search-list"
						aria-activedescendant={rows.length ? `qs-row-${activeIndex}` : undefined}
						aria-label="Search the graph, or ask the agent"
						placeholder="Search thoughts, or ask the agent…"
						autocomplete="off"
						spellcheck="false"
					/>
				</div>
				{#if rows.length === 0}
					<p class="empty">The graph is empty. Type what you want to think about and press <kbd>⌘↩</kbd> to brief the agent.</p>
				{:else}
					<ul class="results" id="quick-search-list" role="listbox" bind:this={listEl}>
						{#each rows as row, i (row.kind === 'thought' ? row.t.id : row.kind)}
							{#if !searching && pinned.length > 0 && i === firstPinnedRow}
								<li class="section" role="presentation">⚑ Pinned</li>
							{/if}
							{#if !searching && i === firstRecentRow && rest.length > 0}
								<li class="section" role="presentation">Recent</li>
							{/if}
							{#if row.kind === 'thought'}
								{@const t = row.t}
								{@const inSet = ws.inWorkingSet(t.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<li
									id="qs-row-{i}"
									data-row={i}
									role="option"
									aria-selected={i === activeIndex}
									class="row"
									class:active={i === activeIndex}
									onmousemove={() => (activeIndex = i)}
									onclick={(e) => act(t.id, e.shiftKey)}
								>
									<span class="type type-{t.type}">{t.type}</span>
									{#if ws.isPinned(t.id)}<span class="pin-mark" title="Pinned">⚑</span>{/if}
									<span class="title">{t.title}</span>
									<span class="meta">
										{#if ws.lensActive && inSet}
											<span class="in-set">in group</span>
										{:else}
											<span class="status">{t.status}</span>
										{/if}
									</span>
									{#if ws.isPinned(t.id)}
										<button
											class="focus-pin"
											title="Focus this thought and its neighbors in a new group"
											onclick={(e) => {
												e.stopPropagation();
												void focusNeighborhood(t.id);
											}}
										>⌾ focus</button>
									{/if}
								</li>
							{:else}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<li
									id="qs-row-{i}"
									data-row={i}
									role="option"
									aria-selected={i === activeIndex}
									class="row agent-row"
									class:active={i === activeIndex}
									onmousemove={() => (activeIndex = i)}
									onclick={() => activate(row, false)}
								>
									<span class="type agent-chip">{row.kind === 'ask' ? 'ask' : 'brief'}</span>
									<span class="title">
										{#if row.kind === 'ask'}
											Ask the agent about “{query.trim()}”
										{:else}
											Continue brief: {ws.brief?.title}
										{/if}
									</span>
									<span class="meta">
										<span class="status">
											{#if row.kind === 'ask'}
												starts a brief
											{:else}
												{ws.brief?.messages.length} messages{ws.brief?.brief?.ready ? ' · ready' : ''}
											{/if}
										</span>
									</span>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
				<div class="footer">
					<span class="hints">
						{#if ws.lensActive}
							<kbd>↩</kbd> add to “{activeGroup?.name}” · <kbd>⇧↩</kbd> jump
						{:else}
							<kbd>↩</kbd> jump to thought
						{/if}
						· <kbd>⌘↩</kbd> ask the agent · <kbd>esc</kbd> close
					</span>
					<button class="browse" onclick={browseAll}>Browse all <Icon name="browse" size="0.9em" /></button>
				</div>
			{:else}
				<div class="brief-head">
					<button class="back" onclick={() => { mode = 'search'; queueMicrotask(() => inputEl?.focus()); }}>
						<Icon name="search" size="0.9em" /> Search
					</button>
					<span class="brief-title">Brief</span>
					{#if briefOpen}
						<button class="discard" onclick={discard} disabled={ws.briefBusy || running} title="Forget this brief and start over">Discard</button>
					{/if}
				</div>
				<p class="brief-hint">
					Say what you want to work on. The agent asks what it needs, then drafts a brief for you to edit and run. Only running the brief reaches the graph, and only as a proposal for review.
				</p>
				<div class="transcript" bind:this={transcriptEl} role="log" aria-label="Brief conversation">
					{#each ws.brief?.messages ?? [] as message (message.id)}
						<article class="message" class:agent={message.role === 'assistant'}>
							<div class="byline">{message.role === 'user' ? 'You' : 'Agent'} <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{message.model ? ` · ${message.model}` : ''}</span></div>
							<DiscussionMarkdown body={message.body} />
							{#if message.consulted?.length}
								<details class="consulted">
									<summary>Considered {message.consulted.length} thought{message.consulted.length === 1 ? '' : 's'}</summary>
									<div class="chips">
										{#each message.consulted as id (id)}
											<button class="chip" class:gone={!ws.thoughts[id]} onclick={() => jumpTo(id)} title="Jump to this thought">
												{#if ws.thoughts[id]}<span class="type type-{ws.thoughts[id].type}">{ws.thoughts[id].type}</span>{/if}
												{thoughtTitle(id)}
											</button>
										{/each}
									</div>
								</details>
							{/if}
						</article>
					{/each}
					{#if ws.briefBusy}
						<p class="thinking" role="status">Thinking…</p>
					{/if}
				</div>
				{#if ws.briefError}<p class="error" role="alert">{ws.briefError}</p>{/if}
				{#if card}
					<section class="card" aria-label="Brief for the agent" class:ready={card.ready}>
						<div class="card-head">
							<span class="card-label">Brief</span>
							<span class="card-state">{card.ready ? 'The agent thinks this is ready' : 'The agent is still clarifying'}</span>
						</div>
						<div class="card-row">
							<label class="field">
								<span>Operation</span>
								<select bind:value={card.action} disabled={running}>
									{#each ACTIONS as a (a)}<option value={a}>{ACTION_NAMES[a]}</option>{/each}
								</select>
							</label>
							<div class="field targets">
								<span>Thoughts{card.action === 'decompose' && card.thoughtIds.length === 0 ? ' · seeds from this conversation' : ''}</span>
								<div class="chips">
									{#each card.thoughtIds as id (id)}
										<span class="chip target" class:gone={!ws.thoughts[id]}>
											{#if ws.thoughts[id]}<span class="type type-{ws.thoughts[id].type}">{ws.thoughts[id].type}</span>{/if}
											{thoughtTitle(id)}
											<button class="remove" aria-label="Remove {thoughtTitle(id)} from the brief" onclick={() => removeTarget(id)} disabled={running}>×</button>
										</span>
									{/each}
									{#if cardNeedsTargets}
										<span class="needs">{ACTION_NAMES[card.action]} needs at least one thought — ask the agent to name some, or search for them.</span>
									{/if}
								</div>
							</div>
						</div>
						<label class="field">
							<span>Direction</span>
							<textarea bind:value={card.instruction} rows="3" maxlength={BRIEF_INSTRUCTION_LIMIT} disabled={running} placeholder="What the operation should emphasize, exclude, or resolve."></textarea>
						</label>
						<div class="card-actions">
							<button class="run" onclick={run} disabled={running || ws.briefBusy || cardNeedsTargets || !!ws.briefUnanswered}>
								{running ? 'Drafting proposal…' : `Run ${ACTION_NAMES[card.action]}`}
							</button>
							<span class="hint">Stages a change set for review; nothing is accepted until you ratify it.</span>
						</div>
					</section>
				{/if}
				{#if ws.briefUnanswered && !ws.briefBusy}
					<div class="composer retry-row">
						<span class="hint">Your message is saved. Retry to get a reply.</span>
						<button class="send" onclick={retry}>Retry reply</button>
					</div>
				{:else}
					<form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
						<textarea
							bind:this={composerEl}
							bind:value={ws.briefDraft}
							rows="2"
							maxlength={CHAT_MESSAGE_LIMIT}
							placeholder={briefOpen ? 'Reply, or refine what you want…' : 'What do you want to think about?'}
							aria-label="Message to the agent"
							disabled={ws.briefBusy || running}
							onkeydown={onComposerKeydown}
						></textarea>
						<button class="send" type="submit" disabled={ws.briefBusy || running || !ws.briefDraft.trim()}>Send</button>
					</form>
				{/if}
				<div class="footer">
					<span class="hints"><kbd>↩</kbd> send · <kbd>⇧↩</kbd> new line · <kbd>esc</kbd> close</span>
					<span class="hints">Uses the selected model</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(44, 41, 33, 0.35);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 12vh 16px 16px;
		z-index: 70;
	}
	.panel {
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		border-radius: 12px;
		box-shadow: var(--shadow-modal);
		width: min(600px, 100%);
		max-height: min(480px, 76vh);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.panel.brief-mode {
		width: min(680px, 100%);
		max-height: min(720px, 84vh);
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--hairline);
		color: var(--ink-muted);
	}
	input {
		flex: 1;
		border: none;
		background: none;
		font: inherit;
		font-size: var(--fs-14);
		color: var(--ink);
		padding: 0;
	}
	input:focus {
		outline: none;
	}
	input::placeholder {
		color: var(--ink-quiet);
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 6px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}
	.section {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		color: var(--gold-ink);
		padding: 8px 8px 4px;
	}
	.section + .section,
	.row + .section {
		margin-top: 4px;
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 7px;
		padding: 7px 8px;
		border-radius: 6px;
		cursor: pointer;
	}
	.row.active {
		background: var(--inset-fill);
	}
	.agent-row {
		border-top: 1px dashed var(--hairline);
		border-radius: 0 0 6px 6px;
		margin-top: 4px;
		padding-top: 10px;
	}
	.agent-row .title {
		color: var(--blue);
	}
	.agent-chip {
		background: var(--blue-wash);
		color: var(--blue-deep);
	}
	.title {
		font-size: var(--fs-13);
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.type {
		font-size: var(--fs-9);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
		white-space: nowrap;
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.pin-mark {
		font-size: var(--fs-11);
		color: var(--gold-ink);
	}
	.meta {
		flex-shrink: 0;
	}
	.status {
		font-size: var(--fs-10);
		color: var(--ink-quiet);
	}
	.in-set {
		font-size: var(--fs-10);
		color: var(--moss-ink);
		background: var(--moss);
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
	.focus-pin {
		font: inherit;
		font-size: var(--fs-10);
		font-weight: 600;
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 999px;
		padding: 1px 7px;
		cursor: pointer;
		color: var(--ink-soft);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.focus-pin:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.empty {
		margin: 0;
		padding: 18px 14px;
		font-size: var(--fs-12);
		color: var(--ink-quiet);
		line-height: 1.5;
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 14px;
		border-top: 1px solid var(--hairline);
		background: var(--paper-panel);
	}
	.hints {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font-family: inherit;
		font-size: var(--fs-10);
		border: 1px solid var(--hairline);
		border-radius: 4px;
		background: var(--card-white);
		padding: 0 4px;
		color: var(--ink-muted);
	}
	.browse {
		display: flex;
		align-items: center;
		gap: 5px;
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 600;
		border: none;
		background: none;
		padding: 2px 0;
		color: var(--ink-soft);
		cursor: pointer;
		white-space: nowrap;
	}
	.browse:hover {
		color: var(--blue);
	}

	/* --- brief mode --- */
	.brief-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--hairline);
	}
	.brief-title {
		flex: 1;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--ink);
	}
	.back,
	.discard {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: inherit;
		font-size: var(--fs-11);
		font-weight: 600;
		border: 1px solid var(--control-border);
		background: var(--card-white);
		border-radius: 6px;
		padding: 3px 9px;
		color: var(--ink-soft);
		cursor: pointer;
		white-space: nowrap;
	}
	.back:hover:not(:disabled),
	.discard:hover:not(:disabled) {
		color: var(--blue);
		border-color: var(--blue);
	}
	.discard:hover:not(:disabled) {
		color: var(--rust);
		border-color: var(--rust);
	}
	.brief-hint {
		margin: 0;
		padding: 8px 14px 0;
		font-size: var(--fs-11);
		line-height: 1.5;
		color: var(--ink-muted);
	}
	.transcript {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-wrap: anywhere;
		padding: 4px 14px 8px;
	}
	.message {
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		font-size: var(--fs-13);
		color: var(--ink-soft);
	}
	.message.agent {
		color: var(--ink);
	}
	.byline {
		font-size: var(--fs-11);
		font-weight: 600;
		color: var(--ink-soft);
	}
	.byline span {
		font-weight: 400;
		color: var(--ink-quiet);
		font-size: var(--fs-10);
	}
	.consulted {
		margin-top: 6px;
		font-size: var(--fs-11);
		color: var(--ink-muted);
	}
	.consulted summary {
		cursor: pointer;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
		font: inherit;
		font-size: var(--fs-11);
		border: 1px solid var(--card-border);
		background: var(--card-white);
		border-radius: 999px;
		padding: 2px 8px;
		color: var(--ink-soft);
		cursor: pointer;
		text-align: left;
	}
	.chip:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.chip.gone {
		color: var(--ink-quiet);
		border-style: dashed;
	}
	.chip.target {
		cursor: default;
		padding-right: 4px;
	}
	.chip.target:hover {
		border-color: var(--card-border);
		color: var(--ink-soft);
	}
	.remove {
		font: inherit;
		font-size: var(--fs-12);
		line-height: 1;
		border: none;
		background: none;
		color: var(--ink-quiet);
		cursor: pointer;
		padding: 0 3px;
		border-radius: 999px;
	}
	.remove:hover:not(:disabled) {
		color: var(--rust);
	}
	.thinking,
	.hint {
		font-size: var(--fs-11);
		color: var(--ink-muted);
		margin: 6px 0 0;
	}
	.error {
		margin: 0;
		padding: 6px 14px 0;
		font-size: var(--fs-12);
		color: var(--rust);
	}

	/* The brief card borrows the proposal vocabulary: gold-edged, dashed, not
	 * yet part of the graph. Readiness is stated in words, never color alone. */
	.card {
		margin: 8px 14px 0;
		padding: 10px 12px;
		border: 1px dashed var(--gold-soft);
		border-radius: 8px;
		background: var(--parchment);
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-shrink: 0;
	}
	.card.ready {
		border-style: solid;
	}
	.card-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.card-label {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		color: var(--gold-ink);
	}
	.card-state {
		font-size: var(--fs-11);
		color: var(--gold-deep);
	}
	.card-row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.field > span {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: var(--ink-faded);
	}
	.targets {
		flex: 1;
		min-width: 200px;
	}
	.targets .chips {
		margin-top: 0;
	}
	.needs {
		font-size: var(--fs-11);
		color: var(--rust);
		line-height: 1.4;
	}
	select,
	.card textarea,
	.composer textarea {
		font: inherit;
		font-size: var(--fs-12);
		color: var(--ink);
		background: var(--card-white);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 5px 8px;
	}
	.card textarea,
	.composer textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		line-height: 1.5;
		font-size: var(--fs-13);
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.card-actions .hint {
		margin: 0;
	}
	.run,
	.send {
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 600;
		border: 1px solid var(--blue);
		background: var(--blue);
		color: var(--card-white);
		border-radius: 6px;
		padding: 6px 12px;
		cursor: pointer;
		white-space: nowrap;
	}
	.run:disabled,
	.send:disabled,
	.discard:disabled,
	.remove:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		padding: 8px 14px 10px;
		flex-shrink: 0;
	}
	.composer textarea {
		flex: 1;
		min-height: 44px;
	}
	.retry-row {
		align-items: center;
		justify-content: space-between;
	}
	.retry-row .hint {
		margin: 0;
	}
	.browse:focus-visible,
	.focus-pin:focus-visible,
	.back:focus-visible,
	.discard:focus-visible,
	.chip:focus-visible,
	.remove:focus-visible,
	.run:focus-visible,
	.send:focus-visible,
	select:focus-visible,
	textarea:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}
</style>
