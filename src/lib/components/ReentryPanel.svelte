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
							<span class="chip">{t.type}</span>
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
							<span class="chip">{t.type}</span>
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
		background: #fffdf8;
		border: 1px solid #e0dbcf;
		border-radius: 10px;
		box-shadow: 0 10px 40px rgba(40, 33, 18, 0.3);
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
		font-size: 17px;
		color: #2c2921;
	}
	h3 {
		margin: 16px 0 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a8375;
	}
	.meta {
		font-size: 11px;
		color: #8a8375;
		white-space: nowrap;
	}
	.changes {
		margin: 10px 0 0;
		font-size: 13px;
		color: #4d473c;
		line-height: 1.45;
	}
	.pending {
		margin: 8px 0 0;
		font-size: 13px;
		font-weight: 600;
		color: #7a5c15;
		background: #fdf8ec;
		border: 1.5px dashed #c9a860;
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
		font-size: 13px;
	}
	.chip {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-radius: 4px;
		padding: 1px 6px;
		background: #eee9dd;
		color: #5a523f;
		white-space: nowrap;
	}
	.chip.status {
		background: #f5e9c9;
		color: #8a6a1f;
	}
	.chip.pin {
		background: #faf6ea;
		border: 1px solid #dcd3bd;
		color: #8a6a1f;
	}
	.meta.new {
		color: #7a5c15;
		font-weight: 600;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: #3b5bdb;
		text-align: left;
		cursor: pointer;
		line-height: 1.35;
	}
	.link:hover {
		text-decoration: underline;
	}
	footer {
		margin-top: 18px;
		display: flex;
		justify-content: flex-end;
	}
	button.primary {
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		background: #3b5bdb;
		border: 1px solid #3b5bdb;
		color: #fff;
		border-radius: 6px;
		padding: 7px 16px;
		cursor: pointer;
	}
</style>
