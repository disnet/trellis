<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import type { ThoughtStatus } from '$lib/types';

	const ws = workspace;

	const thought = $derived(
		ws.selectedIds.length === 1 ? ws.thoughts[ws.selectedIds[0]] : undefined
	);

	let editing = $state(false);
	let editTitle = $state('');
	let editStatement = $state('');
	let editStatus = $state<ThoughtStatus>('tentative');

	$effect(() => {
		// Leaving edit mode whenever the selection changes.
		void thought?.id;
		editing = false;
	});

	function startEdit() {
		if (!thought) return;
		editTitle = thought.title;
		editStatement = thought.statement;
		editStatus = thought.status;
		editing = true;
	}

	function saveEdit() {
		if (!thought) return;
		ws.reviseThought(thought.id, { title: editTitle, statement: editStatement, status: editStatus });
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
				<div class="row">
					<button class="primary" onclick={saveEdit}>Save revision</button>
					<button onclick={() => (editing = false)}>Cancel</button>
				</div>
			</div>
		{:else}
			<div class="head">
				<span class="type">{thought.type}</span>
				<span class="status">{thought.status}</span>
			</div>
			<h3>{thought.title}</h3>
			<p class="statement">{thought.statement}</p>
			<button onclick={startEdit}>Revise…</button>
		{/if}

		<h4>Relations</h4>
		{#if relations.length === 0}
			<p class="hint">No relations yet.</p>
		{:else}
			<ul class="plain">
				{#each relations as r (r.id)}
					{@const outgoing = r.fromThoughtId === thought.id}
					{@const other = ws.thoughts[outgoing ? r.toThoughtId : r.fromThoughtId]}
					<li class="relation">
						<span class="rel-type">{outgoing ? '→' : '←'} {r.type.replace('_', ' ')}</span>
						<button class="link" onclick={() => ws.select(other.id)}>{other?.title}</button>
						<span class="meta">{r.createdBy === 'agent' ? '✳ agent' : '✎ you'}</span>
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
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6d675c;
	}
	h3 {
		margin: 6px 0;
		font-size: 15px;
		color: #2c2921;
	}
	h4 {
		margin: 16px 0 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a8375;
	}
	.hint {
		font-size: 12px;
		color: #8a8375;
	}
	.head {
		display: flex;
		gap: 6px;
	}
	.type,
	.status {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-radius: 4px;
		padding: 2px 7px;
		background: #eee9dd;
		color: #5a523f;
	}
	.statement {
		font-size: 13px;
		line-height: 1.5;
		color: #4d473c;
	}
	button {
		font: inherit;
		font-size: 12px;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 5px 10px;
		cursor: pointer;
	}
	button.primary {
		background: #3b5bdb;
		border-color: #3b5bdb;
		color: #fff;
		font-weight: 600;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		color: #3b5bdb;
		text-align: left;
		cursor: pointer;
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
		font-size: 12px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		align-items: baseline;
	}
	.rel-type {
		color: #5a523f;
		font-weight: 600;
		white-space: nowrap;
	}
	.meta {
		font-size: 11px;
		color: #8a8375;
	}
	.revision {
		border-left: 2px solid #e0dbcf;
		padding-left: 8px;
		font-size: 12px;
	}
	.rev-title {
		font-weight: 600;
		color: #4d473c;
	}
	.rev-statement {
		color: #6d675c;
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
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #8a8375;
	}
	.edit-form input,
	.edit-form textarea,
	.edit-form select {
		font: inherit;
		font-size: 13px;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 6px 8px;
		background: #fffdf8;
		color: #2c2921;
	}
	.row {
		display: flex;
		gap: 8px;
	}
</style>
