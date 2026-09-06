<script lang="ts">
	// Inline composer: a card you type into where you put it, rather than a modal
	// that covers the canvas you were thinking on. Same write path as the full
	// composer — straight into the graph, no proposal.
	import type { ThoughtType } from '$lib/types';

	interface Props {
		x: number;
		y: number;
		width: number;
		/** Changes when something asks for the caret back (a second New thought). */
		focusSignal?: number;
		/** Write the draft; resolves null on success, else the error message. */
		onsave: (fields: {
			type: ThoughtType;
			title: string;
			statement: string;
		}) => Promise<string | null>;
		oncancel: () => void;
	}

	let { x, y, width, focusSignal = 0, onsave, oncancel }: Props = $props();

	const types: ThoughtType[] = ['claim', 'question', 'concept', 'example', 'prediction', 'evidence'];
	let type = $state<ThoughtType>('claim');
	let title = $state('');
	let statement = $state('');
	let saving = $state(false);
	let titleEl = $state<HTMLInputElement>();
	let statementEl = $state<HTMLTextAreaElement>();
	$effect(() => {
		focusSignal;
		titleEl?.focus();
	});

	const ready = $derived(title.trim().length > 0 && statement.trim().length > 0);
	const mod = /Mac|iP(hone|ad)/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';

	async function save() {
		if (!ready || saving) return;
		saving = true;
		// On failure the canvas reports it and the draft stays, text intact.
		await onsave({ type, title: title.trim(), statement: statement.trim() });
		saving = false;
	}

	function onkeydown(e: KeyboardEvent) {
		// The canvas owns Escape and the pan keys; while a draft is open neither
		// should reach it.
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			oncancel();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			save();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	class="card draft"
	style="left: 0; top: 0; transform: translate({x}px, {y}px); width: {width}px;"
	aria-label="New thought"
	onpointerdown={(e) => e.stopPropagation()}
	ondblclick={(e) => e.stopPropagation()}
	{onkeydown}
	onsubmit={(e) => {
		e.preventDefault();
		save();
	}}
>
	<div class="head">
		<select class="type type-{type}" bind:value={type} aria-label="Thought type">
			{#each types as t (t)}
				<option value={t}>{t}</option>
			{/each}
		</select>
		<span class="badge">✎ you</span>
	</div>
	<input
		class="title"
		bind:this={titleEl}
		bind:value={title}
		placeholder="Title"
		aria-label="Title"
		onkeydown={(e) => {
			// Enter moves on to the statement rather than submitting a half-written
			// thought — both fields are required.
			if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				statementEl?.focus();
			}
		}}
	/>
	<textarea
		class="statement"
		bind:this={statementEl}
		bind:value={statement}
		rows="3"
		placeholder="Say it in full…"
		aria-label="Statement"
	></textarea>
	<div class="foot">
		<span class="hint">{mod}↵ to add · Esc to discard</span>
		<button type="button" class="quiet" onclick={oncancel}>Cancel</button>
		<button type="submit" class="primary" disabled={!ready || saving}>
			{saving ? 'Adding…' : 'Add'}
		</button>
	</div>
</form>

<style>
	/* Reads as a card being written, not a dialog: the proposal card's dashed
	   edge, in the ink of something you are authoring yourself. */
	.draft {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-sizing: border-box;
		background: var(--card-white);
		border: 1.5px dashed var(--blue);
		border-radius: 8px;
		padding: 8px 10px;
		box-shadow: var(--shadow-lift);
		font-size: var(--fs-13);
		z-index: 12;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.type {
		font: inherit;
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		padding: 1px 6px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
		cursor: pointer;
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.badge {
		font-size: var(--fs-10);
		color: var(--ink-muted);
		white-space: nowrap;
	}
	input,
	textarea {
		font: inherit;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 5px 7px;
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
	.title {
		font-weight: 600;
	}
	.statement {
		font-size: var(--fs-12);
		line-height: 1.4;
		resize: vertical;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.hint {
		margin-right: auto;
		font-size: var(--fs-10);
		color: var(--ink-quiet);
		white-space: nowrap;
	}
	.foot button {
		font: inherit;
		font-size: var(--fs-11);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 3px 10px;
		cursor: pointer;
	}
	.foot button:hover:not(:disabled) {
		border-color: var(--blue);
		color: var(--blue);
	}
	.foot button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.foot .quiet {
		border-color: transparent;
		background: transparent;
		color: var(--ink-muted);
	}
	.foot .primary {
		font-weight: 600;
		border-color: var(--card-border);
	}
</style>
