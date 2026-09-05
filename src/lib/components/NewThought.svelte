<script lang="ts">
	// Manual thought composer: the human-authored counterpart to the agent's
	// create_thought proposals. Writes straight to the graph — no proposal tray.
	import { workspace } from '$lib/workspace.svelte';
	import type { Confidence, ThoughtStatus, ThoughtType } from '$lib/types';

	const ws = workspace;

	const types: ThoughtType[] = ['claim', 'question', 'concept', 'example', 'prediction', 'evidence'];
	const statuses: ThoughtStatus[] = ['tentative', 'developing', 'believed', 'contested', 'retired'];

	let type = $state<ThoughtType>('claim');
	let status = $state<ThoughtStatus>('tentative');
	let title = $state('');
	let statement = $state('');
	// Prediction confidence (probability entered as a percentage) and evidence source.
	let probability = $state('');
	let low = $state('');
	let high = $state('');
	let unit = $state('');
	let resolveBy = $state('');
	let source = $state('');
	let saving = $state(false);
	let titleEl = $state<HTMLInputElement>();

	$effect(() => {
		if (!ws.composerOpen) return;
		type = 'claim';
		status = 'tentative';
		title = '';
		statement = '';
		probability = '';
		low = '';
		high = '';
		unit = '';
		resolveBy = '';
		source = '';
		queueMicrotask(() => titleEl?.focus());
	});

	function close() {
		ws.composerOpen = false;
	}

	async function save(e?: Event) {
		e?.preventDefault();
		if (saving) return;
		let confidence: Confidence | undefined;
		if (type === 'prediction') {
			const c: Confidence = {};
			if (probability.trim()) c.probability = Number(probability) / 100;
			if (low.trim()) c.low = Number(low);
			if (high.trim()) c.high = Number(high);
			if (unit.trim()) c.unit = unit.trim();
			if (resolveBy.trim()) c.resolveBy = resolveBy.trim();
			if (Object.keys(c).length > 0) confidence = c;
		}
		saving = true;
		const err = await ws.createThought({
			type,
			status,
			title,
			statement,
			confidence,
			source: type === 'evidence' ? source.trim() || null : undefined
		});
		saving = false;
		if (err) {
			ws.notice = err;
			return;
		}
		close();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (ws.composerOpen && e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}}
/>

{#if ws.composerOpen}
	<div class="scrim" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && close()}>
		<div class="panel" role="dialog" aria-modal="true" aria-label="New thought">
			<form onsubmit={save}>
				<h2>New thought</h2>
				<div class="row">
					<label>
						Type
						<select bind:value={type}>
							{#each types as t (t)}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</label>
					<label>
						Status
						<select bind:value={status}>
							{#each statuses as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</label>
				</div>
				<label>
					Title
					<input bind:this={titleEl} bind:value={title} />
				</label>
				<label>
					Statement
					<textarea bind:value={statement} rows="5"></textarea>
				</label>
				{#if type === 'prediction'}
					<div class="row">
						<label>
							Probability (%)
							<input inputmode="numeric" bind:value={probability} placeholder="e.g. 70" />
						</label>
						<label>
							Resolve by
							<input type="date" bind:value={resolveBy} />
						</label>
					</div>
					<div class="row">
						<label>
							Interval low
							<input inputmode="decimal" bind:value={low} />
						</label>
						<label>
							Interval high
							<input inputmode="decimal" bind:value={high} />
						</label>
						<label>
							Unit
							<input bind:value={unit} placeholder="e.g. ms" />
						</label>
					</div>
				{/if}
				{#if type === 'evidence'}
					<label>
						Source
						<input bind:value={source} placeholder="citation, URL, or dataset" />
					</label>
				{/if}
				<div class="actions">
					<button type="button" onclick={close}>Cancel</button>
					<button
						type="submit"
						class="primary"
						disabled={saving || !title.trim() || !statement.trim()}
					>
						{saving ? 'Adding…' : 'Add to graph'}
					</button>
				</div>
			</form>
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
		z-index: 80;
	}
	.panel {
		background: var(--paper-raised);
		border: 1px solid var(--hairline);
		border-radius: 8px;
		box-shadow: var(--shadow-modal);
		padding: 16px 18px;
		width: min(440px, calc(100vw - 48px));
		max-height: calc(100vh - 48px);
		overflow-y: auto;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-13);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-muted);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-quiet);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row label {
		flex: 1;
		min-width: 0;
	}
	input,
	textarea,
	select {
		font: inherit;
		font-size: var(--fs-13);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 6px 8px;
		background: var(--paper-raised);
		color: var(--ink);
		width: 100%;
		box-sizing: border-box;
	}
	input:focus,
	textarea:focus,
	select:focus {
		outline: 2px solid var(--focus-glow);
		border-color: var(--blue);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 5px 12px;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.primary {
		font-weight: 600;
		border-color: var(--card-border);
	}
</style>
