<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import { dialogs } from '$lib/dialogs.svelte';
	import SideConversation from './SideConversation.svelte';
	import {
		formatConfidence,
		type Confidence,
		type RelationType,
		type ThoughtStatus
	} from '$lib/types';

	const ws = workspace;

	const thought = $derived(
		ws.selectedIds.length === 1 ? ws.thoughts[ws.selectedIds[0]] : undefined
	);

	let editing = $state(false);
	let editTitle = $state('');
	let editStatement = $state('');
	let editStatus = $state<ThoughtStatus>('tentative');
	// Prediction confidence (probability entered as a percentage) and evidence source.
	let editProbability = $state('');
	let editLow = $state('');
	let editHigh = $state('');
	let editUnit = $state('');
	let editResolveBy = $state('');
	let editSource = $state('');

	// Leaving edit mode whenever the selection changes — but only then: every
	// applied edit refreshes state and replaces the thought object, and that
	// must not kick the person out of an open editor.
	let lastInspectedId: string | undefined;
	$effect(() => {
		const tid = thought?.id;
		if (tid === lastInspectedId) return;
		lastInspectedId = tid;
		editing = false;
		addingRelation = false;
		editingRelationId = null;
	});

	// --- manual relations ---
	// Drawing or fixing a connection by hand: a direct human edit, instant like
	// revision — never routed through the proposal tray.

	const relationTypes: RelationType[] = [
		'supports',
		'contradicts',
		'depends_on',
		'example_of',
		'supersedes',
		'related_to'
	];

	let addingRelation = $state(false);
	let relType = $state<RelationType>('related_to');
	let relOutgoing = $state(true);
	let relQuery = $state('');
	let relTargetId = $state<string | null>(null);
	let editingRelationId = $state<string | null>(null);

	const relTarget = $derived(relTargetId ? ws.thoughts[relTargetId] : undefined);
	const relCandidates = $derived.by(() => {
		if (!thought) return [];
		const q = relQuery.trim().toLowerCase();
		return Object.values(ws.thoughts)
			.filter(
				(t) =>
					t.id !== thought.id &&
					(q === '' ||
						t.title.toLowerCase().includes(q) ||
						t.statement.toLowerCase().includes(q))
			)
			.sort((a, b) => a.title.localeCompare(b.title))
			.slice(0, 6);
	});

	function startAddRelation() {
		relType = 'related_to';
		relOutgoing = true;
		relQuery = '';
		relTargetId = null;
		addingRelation = true;
	}

	async function addRelation() {
		if (!thought || !relTargetId) return;
		const from = relOutgoing ? thought.id : relTargetId;
		const to = relOutgoing ? relTargetId : thought.id;
		const err = await ws.createRelation(from, to, relType);
		if (err) {
			ws.notice = err;
			return;
		}
		addingRelation = false;
	}

	async function removeRelation(relationId: string) {
		const err = await ws.deleteRelation(relationId);
		ws.notice = err ?? 'Removed the relation. Undo brings it back.';
		if (!err) editingRelationId = null;
	}

	// Connecting the two selected thoughts straight from the canvas selection.
	const pair = $derived(
		ws.selectedIds.length === 2
			? ws.selectedIds.map((sid) => ws.thoughts[sid]).filter(Boolean)
			: []
	);
	let pairForward = $state(true);

	async function connectPair() {
		if (pair.length !== 2) return;
		const [a, b] = pairForward ? [pair[0], pair[1]] : [pair[1], pair[0]];
		const err = await ws.createRelation(a.id, b.id, relType);
		if (err) {
			ws.notice = err;
			return;
		}
		ws.notice = 'Connected.';
	}

	function startEdit() {
		if (!thought) return;
		editTitle = thought.title;
		editStatement = thought.statement;
		editStatus = thought.status;
		const c = thought.confidence;
		editProbability = c?.probability !== undefined ? String(Math.round(c.probability * 100)) : '';
		editLow = c?.low !== undefined ? String(c.low) : '';
		editHigh = c?.high !== undefined ? String(c.high) : '';
		editUnit = c?.unit ?? '';
		editResolveBy = c?.resolveBy ?? '';
		editSource = thought.source ?? '';
		editing = true;
	}

	async function saveEdit() {
		if (!thought) return;
		let confidence: Confidence | null | undefined;
		if (thought.type === 'prediction') {
			const c: Confidence = {};
			if (editProbability.trim()) c.probability = Number(editProbability) / 100;
			if (editLow.trim()) c.low = Number(editLow);
			if (editHigh.trim()) c.high = Number(editHigh);
			if (editUnit.trim()) c.unit = editUnit.trim();
			if (editResolveBy.trim()) c.resolveBy = editResolveBy.trim();
			confidence = Object.keys(c).length > 0 ? c : null;
		}
		const err = await ws.reviseThought(thought.id, {
			title: editTitle,
			statement: editStatement,
			status: editStatus,
			confidence,
			source: thought.type === 'evidence' ? editSource.trim() || null : undefined
		});
		if (err) {
			ws.notice = err;
			return;
		}
		editing = false;
	}

	const relations = $derived(
		thought
			? ws.relations.filter(
					(r) => r.fromThoughtId === thought.id || r.toThoughtId === thought.id
				)
			: []
	);

	const statuses: ThoughtStatus[] = ['tentative', 'developing', 'believed', 'contested', 'retired'];

	// Working-set membership actions (Phase 3): transient, never touch the graph.
	const inSet = $derived(thought ? ws.inWorkingSet(thought.id) : false);
	const neighborCount = $derived(thought ? ws.neighborIds([thought.id]).length : 0);
	// Pins (Phase 6): attention state, as transient as membership.
	const pinned = $derived(thought ? ws.isPinned(thought.id) : false);

	async function run(fn: () => Promise<string | null>) {
		const err = await fn();
		if (err) ws.notice = err;
	}

	/** Deleting is the last resort — retiring keeps what the graph once believed.
	 *  Say what goes with it, and how much of the graph it touches. */
	async function remove() {
		if (!thought) return;
		const n = relations.length;
		const loses = n
			? `Its revision history and ${n} relation${n === 1 ? '' : 's'} go with it.`
			: 'Its revision history goes with it.';
		const ok = await dialogs.confirm(
			`Delete “${thought.title}”? ${loses} Undo can bring it back; retiring keeps it in the graph.`,
			'Delete thought'
		);
		if (!ok) return;
		const err = await ws.deleteThoughts([thought.id]);
		ws.notice = err ?? 'Deleted. Undo brings it back.';
	}

	function fmt(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<section class="inspector">
	<h2>Inspector</h2>
	{#if !thought}
		<p class="hint">
			{ws.selectedIds.length > 1
				? `${ws.selectedIds.length} thoughts selected.`
				: 'Select a thought to inspect it.'}
		</p>
		{#if pair.length === 2}
			<div class="rel-form">
				<span class="endpoint">{pairForward ? pair[0].title : pair[1].title}</span>
				<div class="row">
					<select bind:value={relType} aria-label="Relation type">
						{#each relationTypes as rt (rt)}
							<option value={rt}>{rt.replace('_', ' ')}</option>
						{/each}
					</select>
					<button title="Reverse direction" onclick={() => (pairForward = !pairForward)}>⇄</button>
				</div>
				<span class="endpoint">{pairForward ? pair[1].title : pair[0].title}</span>
				<div class="row">
					<button class="primary" onclick={connectPair}>Connect</button>
				</div>
			</div>
		{/if}
	{:else}
		{#if editing}
			<div class="edit-form">
				<label>
					Title
					<input bind:value={editTitle} />
				</label>
				<label>
					Statement
					<textarea bind:value={editStatement} rows="5"></textarea>
				</label>
				<label>
					Status
					<select bind:value={editStatus}>
						{#each statuses as s (s)}
							<option value={s}>{s}</option>
						{/each}
					</select>
				</label>
				{#if thought.type === 'prediction'}
					<div class="row confidence-row">
						<label>
							Probability (%)
							<input inputmode="numeric" bind:value={editProbability} placeholder="e.g. 70" />
						</label>
						<label>
							Resolve by
							<input type="date" bind:value={editResolveBy} />
						</label>
					</div>
					<div class="row confidence-row">
						<label>
							Interval low
							<input inputmode="decimal" bind:value={editLow} />
						</label>
						<label>
							Interval high
							<input inputmode="decimal" bind:value={editHigh} />
						</label>
						<label>
							Unit
							<input bind:value={editUnit} placeholder="e.g. ms" />
						</label>
					</div>
				{/if}
				{#if thought.type === 'evidence'}
					<label>
						Source
						<input bind:value={editSource} placeholder="citation, URL, or dataset" />
					</label>
				{/if}
				<div class="row">
					<button class="primary" onclick={saveEdit}>Save revision</button>
					<button onclick={() => (editing = false)}>Cancel</button>
				</div>
			</div>
		{:else}
			<div class="head">
				<span class="type type-{thought.type}">{thought.type}</span>
				<span class="status">{thought.status}</span>
				{#if thought.confidence}
					<span class="confidence" title="Confidence">{formatConfidence(thought.confidence)}</span>
				{/if}
				{#if pinned}<span class="pin-mark" title="Pinned">⚑ pinned</span>{/if}
			</div>
			<h3>{thought.title}</h3>
			<p class="statement">{thought.statement}</p>
			{#if thought.source}
				<p class="source">
					source:
					{#if /^https?:\/\//.test(thought.source)}
						<a href={thought.source} target="_blank" rel="noopener noreferrer">{thought.source}</a>
					{:else}
						{thought.source}
					{/if}
				</p>
			{/if}
			<div class="actions">
				<button onclick={startEdit}>Revise…</button>
				<button
					class:pinned
					title={pinned
						? 'Unpin — pins never touch the graph itself'
						: 'Mark as a landmark you keep returning to'}
					onclick={() => run(() => ws.togglePin(thought.id))}
				>
					{pinned ? '⚑ Unpin' : '⚑ Pin'}
				</button>
				<button
					title="Focus this thought and its 1-hop neighbors in a new group"
					onclick={() => run(() => ws.openNeighborhood(thought.id))}
				>
					⌾ Focus neighborhood
				</button>
				{#if ws.lensActive}
					{#if inSet}
						<button
							title="1-hop neighbors outside the group"
							disabled={neighborCount === 0}
							onclick={() => run(() => ws.pullNeighbors(thought.id))}
						>
							Pull in neighbors{neighborCount > 0 ? ` (${neighborCount})` : ''}
						</button>
						<button
							title="Membership only — the thought stays on the canvas"
							onclick={() => run(() => ws.removeFromSet(thought.id))}
						>
							Remove from group
						</button>
					{:else}
						<span class="off-canvas">Not in the group.</span>
						<button onclick={() => run(() => ws.addToSet([thought.id]))}>Add to group</button>
					{/if}
				{/if}
				<button
					class="delete"
					title="Remove it from the graph entirely — relations and history included"
					onclick={remove}
				>
					Delete…
				</button>
			</div>
		{/if}

		<SideConversation thoughtId={thought.id} />
		<div class="rel-head">
			<h4>Relations</h4>
			{#if !addingRelation}
				<button class="quiet" title="Draw a relation by hand" onclick={startAddRelation}>
					+ Add
				</button>
			{/if}
		</div>
		{#if addingRelation}
			<div class="rel-form">
				<div class="row rel-sentence">
					<span class="endpoint">{relOutgoing ? 'This thought' : (relTarget?.title ?? '…')}</span>
					<select bind:value={relType} aria-label="Relation type">
						{#each relationTypes as rt (rt)}
							<option value={rt}>{rt.replace('_', ' ')}</option>
						{/each}
					</select>
					<span class="endpoint">{relOutgoing ? (relTarget?.title ?? '…') : 'This thought'}</span>
					<button title="Reverse direction" onclick={() => (relOutgoing = !relOutgoing)}>⇄</button>
				</div>
				{#if relTarget}
					<div class="row">
						<button class="link" onclick={() => (relTargetId = null)}>Change thought…</button>
					</div>
				{:else}
					<input placeholder="Find a thought…" bind:value={relQuery} />
					<ul class="plain candidates">
						{#each relCandidates as c (c.id)}
							<li>
								<button class="link" onclick={() => (relTargetId = c.id)}>{c.title}</button>
							</li>
						{:else}
							<li class="hint">No matching thoughts.</li>
						{/each}
					</ul>
				{/if}
				<div class="row">
					<button class="primary" disabled={!relTargetId} onclick={addRelation}>
						Add relation
					</button>
					<button onclick={() => (addingRelation = false)}>Cancel</button>
				</div>
			</div>
		{/if}
		{#if relations.length === 0}
			{#if !addingRelation}<p class="hint">No relations yet.</p>{/if}
		{:else}
			<ul class="plain">
				{#each relations as r (r.id)}
					{@const outgoing = r.fromThoughtId === thought.id}
					{@const other = ws.thoughts[outgoing ? r.toThoughtId : r.fromThoughtId]}
					<li class="relation">
						{#if editingRelationId === r.id}
							<select
								value={r.type}
								aria-label="Relation type"
								onchange={(e) =>
									run(() =>
										ws.updateRelation(r.id, {
											type: e.currentTarget.value as RelationType
										})
									)}
							>
								{#each relationTypes as rt (rt)}
									<option value={rt}>{rt.replace('_', ' ')}</option>
								{/each}
							</select>
							<span class="rel-type">{outgoing ? '→' : '←'}</span>
							<button class="link" onclick={() => ws.select(other.id)}>{other?.title}</button>
							<button
								title="Reverse direction"
								onclick={() => run(() => ws.updateRelation(r.id, { reverse: true }))}
							>
								⇄
							</button>
							<button class="delete-rel" onclick={() => removeRelation(r.id)}>Remove</button>
							<button onclick={() => (editingRelationId = null)}>Done</button>
						{:else}
							<span class="rel-type">{outgoing ? '→' : '←'} {r.type.replace('_', ' ')}</span>
							<button class="link" onclick={() => ws.select(other.id)}>{other?.title}</button>
							<span class="meta">{r.createdBy === 'agent' ? '✳ agent' : '✎ you'}</span>
							<button
								class="quiet"
								title="Change the type or direction, or remove it"
								onclick={() => (editingRelationId = r.id)}
							>
								Edit
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<h4>History</h4>
		<ul class="plain">
			{#each [...thought.revisions].reverse() as rev, i (rev.id)}
				<li class="revision">
					<div class="rev-head">
						<span class="meta">
							{rev.actorType === 'agent' ? '✳ agent-authored' : '✎ you'}
							{#if rev.editedFromProposal}(edited from proposal){/if}
							· {fmt(rev.createdAt)}
							{#if i === 0}· current{/if}
						</span>
					</div>
					<div class="rev-title">{rev.title}</div>
					{#if rev.confidence}
						<div class="meta">confidence: {formatConfidence(rev.confidence)}</div>
					{/if}
					{#if i !== 0}
						<div class="rev-statement">{rev.statement}</div>
					{/if}
					{#if rev.sourceChangeSetId}
						<div class="meta">from change set {rev.sourceChangeSetId}</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.inspector {
		padding: 12px;
		overflow-y: auto;
		height: 100%;
		box-sizing: border-box;
	}
	h2 {
		margin: 0 0 8px;
		font-size: var(--fs-13);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-muted);
	}
	h3 {
		margin: 6px 0;
		font-size: var(--fs-15);
		color: var(--ink);
	}
	h4 {
		margin: 16px 0 6px;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-quiet);
	}
	.hint {
		font-size: var(--fs-12);
		color: var(--ink-quiet);
	}
	.head {
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.pin-mark {
		font-size: var(--fs-10);
		font-weight: 700;
		color: var(--gold-ink);
	}
	/* Destructive, so it sits apart from the reversible actions and stays quiet
	   until reached for. */
	.actions button.delete {
		margin-left: auto;
		border-color: transparent;
		color: var(--ink-quiet);
	}
	.actions button.delete:hover {
		border-color: var(--rust);
		background: var(--rust-wash);
		color: var(--rust);
	}
	.actions button.pinned {
		border-color: var(--gold-soft);
		background: var(--pin-fill);
		color: var(--gold-ink);
	}
	/* The specimen tag: same bound type→hue pairings as every other surface. */
	.type {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
		border-radius: 4px;
		padding: 2px 7px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.status {
		font-size: var(--fs-10);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		background: var(--pill-fill);
		color: var(--ink-faded);
	}
	.statement {
		font-size: var(--fs-13);
		line-height: 1.5;
		color: var(--ink-soft);
	}
	.confidence {
		font-size: var(--fs-10);
		font-weight: 700;
		border: 1px solid var(--confidence-border);
		border-radius: 999px;
		padding: 2px 7px;
		color: var(--plum-ink);
		background: var(--confidence-fill);
		white-space: nowrap;
	}
	.source {
		font-size: var(--fs-12);
		color: var(--ochre-ink);
		word-break: break-word;
	}
	.source a {
		color: inherit;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
	}
	.source a:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	.confidence-row label {
		flex: 1;
		min-width: 0;
	}
	.confidence-row input {
		width: 100%;
		box-sizing: border-box;
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	button.primary {
		border-color: var(--card-border);
		font-weight: 600;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--ink-soft);
		text-align: left;
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
		cursor: pointer;
	}
	button.link:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.relation {
		font-size: var(--fs-12);
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		align-items: baseline;
	}
	.rel-type {
		color: var(--ink-faded);
		font-weight: 600;
		white-space: nowrap;
	}
	.rel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-top: 16px;
	}
	.rel-head h4 {
		margin: 0;
	}
	/* Quiet affordances (add / edit a relation): present but not clamoring,
	   like the delete button — the graph's relations are mostly read. */
	button.quiet {
		border-color: transparent;
		color: var(--ink-quiet);
		padding: 2px 6px;
		font-size: var(--fs-11);
	}
	button.quiet:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.rel-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 6px 0 10px;
		font-size: var(--fs-12);
	}
	.rel-form select,
	.rel-form input {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 4px 6px;
		background: var(--paper-raised);
		color: var(--ink);
		min-width: 0;
	}
	.rel-sentence {
		align-items: center;
		flex-wrap: wrap;
	}
	.endpoint {
		font-weight: 600;
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.candidates {
		gap: 4px;
		max-height: 160px;
		overflow-y: auto;
	}
	.relation select {
		font: inherit;
		font-size: var(--fs-11);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 2px 4px;
		background: var(--paper-raised);
		color: var(--ink);
	}
	.relation button:not(.link) {
		padding: 2px 6px;
		font-size: var(--fs-11);
	}
	.relation button.delete-rel {
		border-color: transparent;
		color: var(--ink-quiet);
	}
	.relation button.delete-rel:hover {
		border-color: var(--rust);
		background: var(--rust-wash);
		color: var(--rust);
	}
	.meta {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
	.revision {
		border-left: 2px solid var(--hairline);
		padding-left: 8px;
		font-size: var(--fs-12);
	}
	.rev-title {
		font-weight: 600;
		color: var(--ink-soft);
	}
	.rev-statement {
		color: var(--ink-muted);
		margin-top: 2px;
	}
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.edit-form label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-quiet);
	}
	.edit-form input,
	.edit-form textarea,
	.edit-form select {
		font: inherit;
		font-size: var(--fs-13);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 6px 8px;
		background: var(--paper-raised);
		color: var(--ink);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.actions button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.off-canvas {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
</style>
