<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';

	const d = $derived(dialogs.current);

	let draft = $state('');
	let inputEl = $state<HTMLInputElement>();
	let confirmEl = $state<HTMLButtonElement>();

	$effect(() => {
		if (!d) return;
		draft = d.initial;
		// Focus the input (prompt) or the affirmative action (confirm).
		queueMicrotask(() => (d.kind === 'prompt' ? inputEl?.select() : confirmEl?.focus()));
	});

	function cancel() {
		if (!d) return;
		dialogs.settle(d.kind === 'confirm' ? false : null);
	}

	function submit(e?: Event) {
		e?.preventDefault();
		if (!d) return;
		dialogs.settle(d.kind === 'confirm' ? true : draft);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (d && e.key === 'Escape') {
			e.stopPropagation();
			cancel();
		}
	}}
/>

{#if d}
	<div class="scrim" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && cancel()}>
		<div class="panel" role="alertdialog" aria-modal="true" aria-label={d.message}>
			<form onsubmit={submit}>
				<p class="message">{d.message}</p>
				{#if d.kind === 'prompt'}
					<input bind:this={inputEl} bind:value={draft} maxlength={d.maxLength ?? 80} aria-label={d.message} />
				{/if}
				<div class="row">
					<button type="button" onclick={cancel}>Cancel</button>
					<button
						type="submit"
						class="confirm"
						bind:this={confirmEl}
						disabled={d.kind === 'prompt' && draft.trim() === ''}
					>
						{d.confirmLabel}
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
		width: min(400px, calc(100vw - 48px));
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.message {
		margin: 0;
		font-size: var(--fs-13);
		line-height: 1.45;
		color: var(--ink-soft);
	}
	input {
		font: inherit;
		font-size: var(--fs-13);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 6px 8px;
		background: var(--paper-raised);
		color: var(--ink);
	}
	input:focus {
		outline: 2px solid var(--focus-glow);
		border-color: var(--blue);
	}
	.row {
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
	.confirm {
		font-weight: 600;
		border-color: var(--card-border);
	}
</style>
