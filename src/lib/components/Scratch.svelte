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
		class:busy={ws.invoking === 'decompose'}
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
		color: var(--ink-muted);
	}
	h3 {
		margin: 10px 0 0;
		font-size: var(--fs-12);
		color: var(--ink-muted);
	}
	.hint {
		margin: 0;
		font-size: var(--fs-12);
		color: var(--ink-quiet);
		line-height: 1.4;
	}
	.hint.small {
		font-size: var(--fs-11);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		/* The capture field never collapses below a few usable lines, however
		   full the notes below it get. */
		flex-shrink: 0;
		min-height: 96px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 8px;
		font: inherit;
		font-size: var(--fs-13);
		background: var(--paper-raised);
		color: var(--ink);
	}
	textarea:focus {
		outline: 2px solid var(--focus-glow);
		border-color: var(--blue);
	}
	button.primary {
		align-self: flex-start;
		background: var(--card-white);
		color: var(--ink-soft);
		border: 1px solid var(--card-border);
		border-radius: 6px;
		padding: 6px 14px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	button.primary:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	button.primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.primary.busy {
		opacity: 1;
		border-color: var(--blue);
		color: var(--blue);
		cursor: progress;
		animation: busy-pulse 1.2s ease-in-out infinite;
	}
	@keyframes busy-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button.primary.busy {
			animation: none;
		}
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
		color: var(--ink-faded);
		background: var(--inset-fill);
		border-radius: 6px;
		padding: 6px 8px;
		display: flex;
		justify-content: space-between;
		gap: 6px;
		align-items: baseline;
	}
	.distilled {
		font-size: var(--fs-10);
		color: var(--moss-ink);
		background: var(--moss);
		border-radius: 999px;
		padding: 1px 7px;
		white-space: nowrap;
	}
</style>
