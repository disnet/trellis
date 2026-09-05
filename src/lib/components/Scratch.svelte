<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';

	const ws = workspace;

	async function decompose() {
		const err = await ws.invoke('decompose');
		if (err) ws.notice = err;
	}
</script>

<section class="scratch">
	<h2>Scratch</h2>
	<p class="hint">Freeform capture. Nothing here becomes durable knowledge on its own.</p>
	<textarea
		bind:value={ws.scratchDraft}
		placeholder="Paste or type messy thinking here, then decompose it into thoughts…"
		rows="10"
	></textarea>
	<button
		class="primary"
		onclick={decompose}
		disabled={ws.invoking !== null ||
			(ws.scratchDraft.trim().length === 0 && ws.selectedIds.length === 0)}
	>
		{ws.invoking === 'decompose' ? 'Decomposing…' : 'Decompose'}
	</button>
	<p class="hint small">
		Decomposes the scratch text above, or the selected card when scratch is empty.
	</p>

	{#if ws.scratchNotes.length > 0}
		<h3>Captured notes</h3>
		<ul class="notes">
			{#each [...ws.scratchNotes].reverse() as note (note.id)}
				<li>
					<span class="note-body">{note.body.length > 90 ? note.body.slice(0, 90) + '…' : note.body}</span>
					{#if note.distilledChangeSetId}
						<span class="distilled">distilled</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.scratch {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-13);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6d675c;
	}
	h3 {
		margin: 10px 0 0;
		font-size: var(--fs-12);
		color: #6d675c;
	}
	.hint {
		margin: 0;
		font-size: var(--fs-12);
		color: #8a8375;
		line-height: 1.4;
	}
	.hint.small {
		font-size: var(--fs-11);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 8px;
		font: inherit;
		font-size: var(--fs-13);
		background: #fffdf8;
	}
	textarea:focus {
		outline: 2px solid #3b5bdb33;
		border-color: #3b5bdb;
	}
	button.primary {
		align-self: flex-start;
		background: #3b5bdb;
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 7px 14px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	button.primary:disabled {
		background: #b5b0a4;
		cursor: not-allowed;
	}
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.notes li {
		font-size: var(--fs-12);
		color: #5a523f;
		background: #f2eee4;
		border-radius: 6px;
		padding: 6px 8px;
		display: flex;
		justify-content: space-between;
		gap: 6px;
		align-items: baseline;
	}
	.distilled {
		font-size: var(--fs-10);
		color: #3d5537;
		background: #e3ecdf;
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
</style>
