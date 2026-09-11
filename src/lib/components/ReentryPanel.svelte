<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';

	const ws = workspace;
	const summary = $derived(ws.reentry);

	const hasChanges = $derived(
		summary !== null &&
			(summary.newThoughts.length > 0 ||
				summary.revisedThoughts.length > 0 ||
				summary.newRelations > 0)
	);

	function fmt(ts: number): string {
		return new Date(ts).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function open(id: string) {
		ws.select(id);
		ws.dismissReentry();
	}
</script>

{#if ws.showReentry && summary}
	<div class="scrim">
		<div class="panel" role="dialog" aria-label="Where you left off">
			<header>
				<h2>Where you left off</h2>
				{#if summary.lastVisitAt}
					<span class="meta">last visit {fmt(summary.lastVisitAt)}</span>
				{/if}
			</header>

			{#if hasChanges}
				<p class="changes">
					Since then:
					{#if summary.newThoughts.length > 0}
						{summary.newThoughts.length} new {summary.newThoughts.length === 1 ? 'thought' : 'thoughts'}
					{/if}
					{#if summary.revisedThoughts.length > 0}
						· {summary.revisedThoughts.length} revised
					{/if}
					{#if summary.newRelations > 0}
						· {summary.newRelations} new {summary.newRelations === 1 ? 'relation' : 'relations'}
					{/if}
				</p>
			{:else}
				<p class="changes">The graph is unchanged since your last visit.</p>
			{/if}

			{#if summary.pendingChangeSets > 0}
				<p class="pending">
					◇ {summary.pendingChangeSets}
					{summary.pendingChangeSets === 1 ? 'proposal is' : 'proposals are'} still awaiting your review.
				</p>
			{/if}

			{#if summary.pinned.length > 0}
				<h3>Pinned</h3>
				<ul>
					{#each summary.pinned as t (t.id)}
						<li>
							<span class="chip pin">⚑ {t.type}</span>
							<button class="link" onclick={() => open(t.id)}>{t.title}</button>
							{#if t.newRelations > 0}
								<span class="meta new">
									{t.newRelations} new {t.newRelations === 1 ? 'relation' : 'relations'}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if summary.central.length > 0}
				<h3>Central right now</h3>
				<ul>
					{#each summary.central as t (t.id)}
						<li>
							<span class="chip type-{t.type}">{t.type}</span>
							<button class="link" onclick={() => open(t.id)}>{t.title}</button>
							<span class="meta">{t.degree} {t.degree === 1 ? 'relation' : 'relations'}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if summary.attention.length > 0}
				<h3>Contested or unresolved</h3>
				<ul>
					{#each summary.attention as t (t.id)}
						<li>
							<span class="chip status">{t.status}</span>
							<button class="link" onclick={() => open(t.id)}>{t.title}</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if summary.newThoughts.length > 0}
				<h3>New since last visit</h3>
				<ul>
					{#each summary.newThoughts as t (t.id)}
						<li>
							<span class="chip type-{t.type}">{t.type}</span>
							<button class="link" onclick={() => open(t.id)}>{t.title}</button>
						</li>
					{/each}
				</ul>
			{/if}

			<footer>
				<button class="primary" onclick={() => ws.dismissReentry()}>Back to the workspace</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(44, 41, 33, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}
	.panel {
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		border-radius: 8px;
		box-shadow: var(--shadow-modal);
		padding: 20px 24px;
		width: min(560px, calc(100vw - 48px));
		max-height: 80vh;
		overflow-y: auto;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-17);
		color: var(--ink);
	}
	h3 {
		margin: 16px 0 6px;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-quiet);
	}
	.meta {
		font-size: var(--fs-11);
		color: var(--ink-quiet);
		white-space: nowrap;
	}
	.changes {
		margin: 10px 0 0;
		font-size: var(--fs-13);
		color: var(--ink-soft);
		line-height: 1.45;
	}
	.pending {
		margin: 8px 0 0;
		font-size: var(--fs-13);
		font-weight: 600;
		color: var(--gold-deep);
		background: var(--parchment);
		border: 1.5px dashed var(--gold-soft);
		border-radius: 6px;
		padding: 6px 10px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: var(--fs-13);
	}
	.chip {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
		border-radius: 4px;
		padding: 1px 6px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
		white-space: nowrap;
	}
	/* The bound specimen-tag pairings, same as cards and search. */
	.chip.type-claim { background: var(--moss); color: var(--moss-ink); }
	.chip.type-question { background: var(--violet); color: var(--violet-ink); }
	.chip.type-concept { background: var(--slate); color: var(--slate-ink); }
	.chip.type-example { background: var(--clay); color: var(--clay-ink); }
	.chip.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.chip.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	/* Thought status is accepted state, not a proposal — it never wears gold. */
	.chip.status {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		background: var(--pill-fill);
		color: var(--ink-faded);
	}
	.chip.pin {
		background: var(--pin-fill);
		border: 1px solid var(--pin-border);
		color: var(--gold-ink);
	}
	.meta.new {
		color: var(--ink-soft);
		font-weight: 600;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--ink-soft);
		text-align: left;
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
		cursor: pointer;
		line-height: 1.35;
	}
	.link:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	footer {
		margin-top: 18px;
		display: flex;
		justify-content: flex-end;
	}
	button.primary {
		font: inherit;
		font-size: var(--fs-13);
		font-weight: 600;
		background: var(--card-white);
		border: 1px solid var(--card-border);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 6px 16px;
		cursor: pointer;
	}
	button.primary:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
</style>
