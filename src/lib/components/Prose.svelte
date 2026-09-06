<script lang="ts">
	import { untrack } from 'svelte';
	import { workspace } from '$lib/workspace.svelte';
	import { PROSE_GUIDANCE_LIMIT, type ProseStyle } from '$lib/types';
	import { proseBlocks, proseParts, parseProseReference } from '$lib/prose-format';

	const ws = workspace;
	const styles: { value: ProseStyle; label: string; description: string }[] = [
		{ value: 'overview', label: 'Overview', description: 'A clear synthesis of the ideas, connections, and open questions.' },
		{ value: 'paper', label: 'Paper', description: 'A formal argument with sections, evidence, and limitations.' },
		{ value: 'blog', label: 'Blog', description: 'An approachable narrative that draws a thread through the ideas.' },
		{ value: 'polemic', label: 'Polemic', description: 'A pointed argument that keeps uncertainty and counterarguments visible.' }
	];
	let groupId = $state(ws.proseGroupId || ws.activeWorkingSetId || '');
	let style = $state<ProseStyle>(ws.proseStyle);
	/** Which of the slot's saved drafts is open; null means the newest. */
	let draftId = $state<string | null>(null);
	/** The drawer under the rail: writing guidance and saved drafts. */
	let controlsOpen = $state(false);
	let guidance = $state('');
	let guidanceScope = '';
	let draftListError = $state<string | null>(null);
	let deleteError = $state<string | null>(null);
	let graphId = $state(ws.activeGraphId);
	let failure = $state<{ graphId: string; groupId: string; style: ProseStyle; message: string } | null>(null);
	const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	/** Long titles and group names would stretch a native select (and its OS
	 *  dropdown) to their widest option; clip the label, not the data. */
	const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

	$effect(() => {
		if (graphId !== ws.activeGraphId) {
			graphId = ws.activeGraphId;
			groupId = ws.activeWorkingSetId ?? '';
			style = 'overview';
			draftId = null;
			failure = null;
			deleteError = null;
			controlsOpen = false;
		} else if (groupId && !ws.workingSets.some((group) => group.id === groupId)) {
			groupId = '';
		}
	});
	/** Selecting a different group or style opens that slot's newest draft. */
	function resetDraft() {
		draftId = null;
		deleteError = null;
	}

	const group = $derived(ws.workingSets.find((item) => item.id === groupId));
	/** The open slot's saved drafts, newest first. */
	const slotDrafts = $derived(
		[...ws.prose.filter((item) => item.graphId === ws.activeGraphId && item.workingSetId === groupId && item.style === style)]
			.sort((a, b) => b.generatedAt - a.generatedAt)
	);
	const treatment = $derived(slotDrafts.find((item) => item.id === draftId) ?? slotDrafts[0]);
	const draftIndex = $derived(treatment ? slotDrafts.findIndex((item) => item.id === treatment.id) : -1);
	const error = $derived(failure?.graphId === graphId && failure?.groupId === groupId && failure?.style === style ? failure.message : null);
	const styleDescription = $derived(styles.find((option) => option.value === style)?.description ?? '');

	$effect(() => { ws.proseGroupId = groupId; ws.proseStyle = style; });
	$effect(() => {
		const key = JSON.stringify([graphId, groupId, style, treatment?.id]);
		if (guidanceScope !== key) { guidanceScope = key; guidance = treatment?.guidance ?? ''; }
	});
	// untrack: the load methods read and then replace ws state (prose, drafts);
	// tracking those reads would re-trigger the effect on every completed load.
	$effect(() => {
		ws.activeGraphId;
		let active = true;
		void untrack(() => ws.loadProseDrafts()).then((error) => { if (active) draftListError = error; });
		return () => { active = false; };
	});
	function openDraft(id: string) {
		const draft = ws.proseDrafts.find((item) => item.id === id);
		if (draft) { groupId = draft.workingSetId; style = draft.style; draftId = draft.id; deleteError = null; }
	}

	// Compare source values so dragging cards does not reload the reading view.
	const sourceKey = $derived(JSON.stringify({
		graphId: ws.activeGraphId,
		groupId,
		groupName: group?.name,
		thoughts: group?.members.map((id) => {
			const thought = ws.thoughts[id];
			return thought && [id, thought.title, thought.statement, thought.status, thought.type, thought.confidence, thought.source];
		}),
		relations: ws.relations.filter((relation) => group?.members.includes(relation.fromThoughtId) && group.members.includes(relation.toThoughtId))
			.map((relation) => [relation.fromThoughtId, relation.toThoughtId, relation.type])
	}));
	let loadingDrafts = $state(false);
	let loadError = $state<string | null>(null);
	$effect(() => {
		sourceKey;
		if (!groupId) { loadError = null; loadingDrafts = false; return; }
		const id = groupId;
		let active = true;
		loadingDrafts = true;
		loadError = null;
		void untrack(() => ws.loadProse(id)).then((message) => {
			if (active) { loadError = message; loadingDrafts = false; }
		});
		return () => { active = false; };
	});

	async function generate() {
		const target = { graphId, groupId, style };
		failure = null;
		const message = await ws.generateProse(target.groupId, target.style, guidance);
		if (message) failure = { ...target, message };
		// Show the fresh draft — unless the reader moved to another slot meanwhile.
		else if (groupId === target.groupId && style === target.style) {
			resetDraft();
			controlsOpen = false;
		}
	}

	async function removeDraft() {
		if (!treatment) return;
		deleteError = null;
		const message = await ws.deleteProseDraft(treatment.id);
		if (message) deleteError = message;
		else draftId = null;
	}
</script>

{#snippet inline(text: string)}
	{#each proseParts(text) as part}
		{@const reference = parseProseReference(part)}
		{@const thoughtId = reference?.thoughtId}
		{#if thoughtId && treatment?.sourceThoughtIds.includes(thoughtId) && ws.thoughts[thoughtId]}
			<button class="thought-link" title="Inspect thought: {ws.thoughts[thoughtId].title}" onclick={() => ws.select(thoughtId)}>{reference?.label ?? ws.thoughts[thoughtId].title}</button>
		{:else}
			{part}
		{/if}
	{/each}
{/snippet}

<section class="prose" aria-label="Prose treatment">
	<div class="rail" class:open={controlsOpen}>
		<div class="rail-row">
			<select class="rail-group" bind:value={groupId} onchange={resetDraft} aria-label="Group" title={group?.name}>
				<option value="">Choose a group…</option>
				{#each ws.workingSets as set (set.id)}
					<option value={set.id}>{clip(set.name, 40)} · {set.size}</option>
				{/each}
			</select>
			<select bind:value={style} onchange={resetDraft} aria-label="Style" title={styleDescription}>
				{#each styles as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<button class="generate" class:busy={ws.proseGenerating} disabled={!group?.size || ws.proseGenerating || loadingDrafts} onclick={generate}>
				{ws.proseGenerating ? 'Generating…' : treatment ? 'Generate new draft' : 'Generate'}
			</button>
			<button class="more" aria-expanded={controlsOpen} onclick={() => (controlsOpen = !controlsOpen)}>
				Guidance & drafts
				<svg class="chevron" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
		</div>
		<div class="drawer">
			<div class="drawer-clip">
				<div class="drawer-inner">
					<p class="field-hint">{styleDescription}{#if treatment}{' '}Generating adds a new draft; earlier drafts of this group and style are kept.{/if}</p>
					<label class="drawer-field">
						<span class="label-line"><span class="label-text">Writing guidance</span> <span class="optional">optional</span></span>
						<textarea bind:value={guidance} maxlength={PROSE_GUIDANCE_LIMIT} rows="3" disabled={loadingDrafts || ws.proseGenerating} placeholder="For example: Focus on the practical implications of X, and keep it accessible to a general reader."></textarea>
					</label>
					{#if ws.proseDrafts.length || draftListError}
						<label class="drawer-field">
							<span class="label-text">Saved drafts</span>
							<select aria-label="Open a saved draft" value={treatment?.id ?? ''} onchange={(event) => openDraft(event.currentTarget.value)}>
								<option value="">Open a saved draft…</option>
								{#each ws.proseDrafts as draft (draft.id)}
									<option value={draft.id}>{clip(draft.title, 56)} — {clip(ws.workingSets.find((item) => item.id === draft.workingSetId)?.name ?? 'Group', 24)} · {styles.find((item) => item.value === draft.style)?.label} · {when.format(draft.generatedAt)}</option>
								{/each}
							</select>
						</label>
						{#if draftListError}<p class="error" role="alert">{draftListError} <button class="thought-link" onclick={async () => draftListError = await ws.loadProseDrafts()}>Retry</button></p>{/if}
					{/if}
					{#if ws.modelSelection.provider === 'fixture'}<p class="field-hint">Offline fixtures preview the format. Choose a model to apply writing guidance.</p>{/if}
				</div>
			</div>
		</div>
	</div>

	{#if error || loadError || ws.proseGenerating}
		<div class="notices">
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if loadError}<p class="error" role="alert">{loadError} <button class="thought-link" onclick={async () => { loadingDrafts = true; loadError = await ws.loadProse(groupId); loadingDrafts = false; }}>Retry</button></p>{/if}
			{#if ws.proseGenerating}<p class="status" role="status">The agent is writing. Your saved drafts remain available.</p>{/if}
		</div>
	{/if}

	{#if treatment}
		<article aria-label={treatment.title}>
			<div class="provenance">
				<span>Agent-authored · {treatment.model}</span>
				<span>{treatment.sourceThoughtIds.length} source {treatment.sourceThoughtIds.length === 1 ? 'thought' : 'thoughts'} · {new Date(treatment.generatedAt).toLocaleString()}</span>
			</div>
			<div class="draft-history">
				{#if slotDrafts.length > 1}
					<button class="history-nav" disabled={draftIndex <= 0} onclick={() => { draftId = slotDrafts[draftIndex - 1].id; deleteError = null; }}>‹ Newer</button>
					<span>Draft {draftIndex + 1} of {slotDrafts.length}</span>
					<button class="history-nav" disabled={draftIndex >= slotDrafts.length - 1} onclick={() => { draftId = slotDrafts[draftIndex + 1].id; deleteError = null; }}>Older ›</button>
				{/if}
				<button class="history-delete" onclick={removeDraft}>Delete this draft</button>
			</div>
			{#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}
			{#if treatment.stale}<p class="stale" role="status">Sources changed since this draft was generated. Generate a new draft to refresh it.</p>{/if}
			<h1 class="treatment-title">{treatment.title}</h1>
			{#each proseBlocks(treatment.body) as block}
				{#if block.kind === 'h1'}
					<h2>{@render inline(block.text)}</h2>
				{:else if block.kind === 'h2'}
					<h3>{@render inline(block.text)}</h3>
				{:else}
					<p>{@render inline(block.text)}</p>
				{/if}
			{/each}
		</article>
	{:else}
		<div class="empty">
			{#if loadingDrafts}
				<p role="status">Loading saved drafts…</p>
			{:else if ws.workingSets.length === 0}
				<h2>Start with a group</h2>
				<p>Prose turns a group of thoughts into an agent-authored piece you can read — with links back to the thoughts behind it. Create a group from the group menu above and add the thoughts you want to write about.</p>
			{:else if !group}
				<h2>Choose the thoughts to write from</h2>
				<p>Select a group above. The agent will use its thoughts and the connections between them.</p>
			{:else if group.size === 0}
				<h2>This group has no thoughts yet</h2>
				<p>Add thoughts to {group.name}, then return here to generate a treatment.</p>
			{:else}
				<h2>A new reading of {group.name}</h2>
				<p>Choose a style and generate a draft. Follow its inline references to inspect the source thoughts while you read.</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.prose {
		box-sizing: border-box; height: 100%; overflow: auto; color: var(--ink);
		padding: 0 0 48px;
		/* One shared reading column: the rail's content and the article align. */
		--column: calc(36 * var(--fs-17));
		--gutter: clamp(20px, 5vw, 64px);
	}

	/* The instrument rail: the whole writing loop in one quiet sticky row.
	   Guidance and saved drafts wait in the drawer beneath it. */
	.rail {
		position: sticky; top: 0; z-index: 5;
		padding: 0 var(--gutter);
		background: var(--paper-panel);
		border-bottom: 1px solid var(--hairline);
	}
	.rail-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: var(--column); margin: 0 auto; padding: 10px 0; }
	.rail-row select, .generate, .more {
		box-sizing: border-box; font: inherit; font-size: var(--fs-12); color: var(--ink-soft);
		border: 1px solid var(--control-border); background: var(--card-white); border-radius: 6px;
		padding: 5px 8px; min-height: 30px; max-width: 100%;
	}
	.rail-row select.rail-group { flex: 0 1 auto; min-width: 0; max-width: min(100%, 26ch); text-overflow: ellipsis; }
	.generate { cursor: pointer; font-weight: 600; padding: 5px 12px; flex-shrink: 0; }
	.generate:hover:not(:disabled) { color: var(--blue); border-color: var(--blue); }
	.generate:disabled { opacity: .45; cursor: not-allowed; }
	.generate.busy { color: var(--blue); border-color: var(--blue); animation: busy-pulse 1.2s ease-in-out infinite; }
	@keyframes busy-pulse { 50% { opacity: .55; } }
	.more {
		display: inline-flex; align-items: center; gap: 6px; margin-left: auto; cursor: pointer;
		border-color: transparent; background: none; color: var(--ink-muted);
	}
	.more:hover { color: var(--blue); }
	.rail.open .more { color: var(--ink-soft); }
	.chevron { transition: rotate .28s cubic-bezier(.2, .7, .3, 1); flex-shrink: 0; }
	.rail.open .chevron { rotate: 180deg; }

	/* Collapsed rows animate open; visibility keeps the closed drawer out of
	   the tab order. */
	.drawer {
		display: grid; grid-template-rows: 0fr; visibility: hidden;
		transition: grid-template-rows .28s cubic-bezier(.2, .7, .3, 1), visibility 0s .28s;
	}
	.rail.open .drawer {
		grid-template-rows: 1fr; visibility: visible;
		transition: grid-template-rows .28s cubic-bezier(.2, .7, .3, 1);
	}
	.drawer-clip { overflow: hidden; min-height: 0; }
	.drawer-inner { display: grid; gap: 10px; max-width: var(--column); margin: 0 auto; padding: 2px 0 14px; }
	.drawer-field { display: grid; gap: 5px; min-width: 0; }
	.label-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.label-text { font-size: var(--fs-11); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-muted); font-weight: 600; }
	.optional { color: var(--ink-quiet); font-size: var(--fs-11); }
	.drawer-inner select {
		box-sizing: border-box; width: 100%; min-width: 0; text-overflow: ellipsis; font: inherit; font-size: var(--fs-13); color: var(--ink-soft);
		border: 1px solid var(--control-border); background: var(--card-white); border-radius: 6px; padding: 7px 10px;
	}
	textarea {
		box-sizing: border-box; width: 100%; resize: vertical; min-height: 64px; font: inherit; font-size: var(--fs-13);
		line-height: 1.5; color: var(--ink); background: var(--card-white); border: 1px solid var(--control-border);
		border-radius: 6px; padding: 8px 10px;
	}
	textarea:disabled { opacity: .6; }
	textarea:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	.field-hint { margin: 0; font-size: var(--fs-12); color: var(--ink-muted); line-height: 1.5; }

	.notices { max-width: var(--column); margin: 14px auto 0; padding: 0 var(--gutter); display: grid; gap: 6px; box-sizing: content-box; }
	.status { margin: 0; font-size: var(--fs-12); color: var(--ink-muted); line-height: 1.5; }
	.error { margin: 0; color: var(--rust); font-size: var(--fs-13); line-height: 1.5; }

	article { max-width: var(--column); margin: 28px auto 0; padding: 0 var(--gutter); box-sizing: content-box; font-size: var(--fs-17); line-height: 1.75; overflow-wrap: anywhere; }
	.treatment-title { margin: 20px 0 28px; font-size: var(--fs-30); line-height: 1.2; letter-spacing: -.02em; }
	article h2 { margin: 32px 0 12px; font-size: var(--fs-22); line-height: 1.3; }
	article h3 { margin: 28px 0 10px; font-size: var(--fs-18); line-height: 1.4; }
	article p { white-space: pre-wrap; margin: 0 0 20px; }
	.provenance { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: var(--fs-11); line-height: 1.5; color: var(--ink-muted); }
	.draft-history { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 8px; font-size: var(--fs-12); line-height: 1.5; color: var(--ink-muted); }
	.history-nav, .history-delete { font: inherit; padding: 0; border: 0; background: none; color: var(--ink-muted); cursor: pointer; }
	.history-nav:hover:not(:disabled) { color: var(--blue); }
	.history-nav:disabled { opacity: .4; cursor: default; }
	.history-delete { margin-left: auto; }
	.history-delete:hover { color: var(--rust); }
	article .stale { margin-top: 12px; font-size: var(--fs-12); line-height: 1.5; color: var(--gold-ink); }
	.thought-link { display: inline; font: inherit; text-align: inherit; padding: 0; border: 0; border-radius: 0; background: none; color: var(--blue); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; overflow-wrap: anywhere; }
	.thought-link:hover { color: var(--blue-deep); }
	button:focus-visible, select:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

	.empty { max-width: var(--column); margin: 0 auto; padding: 48px var(--gutter) 36px; box-sizing: content-box; color: var(--ink-muted); }
	.empty h2 { color: var(--ink-soft); font-size: var(--fs-20); line-height: 1.3; margin: 0 0 12px; }
	.empty p { font-size: var(--fs-13); line-height: 1.6; max-width: 55ch; }

	@media (prefers-reduced-motion: reduce) {
		.drawer, .rail.open .drawer, .chevron { transition: none; }
	}
	@media (max-width: 600px) {
		.rail { padding: 0 16px; }
		article, .notices, .empty { padding-left: 16px; padding-right: 16px; }
	}
</style>
