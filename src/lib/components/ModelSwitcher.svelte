<script lang="ts">
	import LocalAgentSetup from "./LocalAgentSetup.svelte";
	let setup = $state(false);
	import Icon from './Icon.svelte';
	import { PROVIDERS, REASONING_EFFORTS, supportsEffort, type AgentProvider, type ReasoningEffort } from '$lib/models';
	import { workspace as ws } from '$lib/workspace.svelte';
	/** Narrows the trigger to the provider alone when the toolbar is short of room. */
	let { compact = false }: { compact?: boolean } = $props();
	let open = $state(false);
	let custom = $state('');
	let invalid = $state(false);
	let setupShown = $state(false);
	$effect(() => {
		if (!ws.loading && ws.needsAgentSetup && !setupShown) { open = true; setup = true; setupShown = true; }
	});
	const provider = $derived(PROVIDERS.find((p) => p.id === ws.modelSelection.provider)!);
	const selectedPreset = $derived(provider.models.find((m) => m.id === ws.modelSelection.model));
	const modelGroups = $derived([...new Set(provider.models.map((m) => m.group))]);
	const modelLabel = $derived(selectedPreset?.label ?? (ws.modelSelection.model || 'Default'));
	const triggerLabel = $derived(compact ? provider.label : `${provider.label} · ${modelLabel}`);
	// Effort travels across a provider switch: the vocabulary is shared, so a
	// deliberate choice of "how hard to think" outlives the choice of who thinks.
	const effortUsed = $derived(supportsEffort(ws.modelSelection.provider, ws.modelSelection.model));
	const EFFORT_LABELS: Record<ReasoningEffort, string> = {
		low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max'
	};
	function changeProvider(value: string) {
		ws.selectModel({ ...ws.modelSelection, provider: value as AgentProvider, model: '' });
		custom = '';
		invalid = false;
	}
	function changeEffort(value: string) {
		ws.selectModel({ ...ws.modelSelection, effort: (value || undefined) as ReasoningEffort | undefined });
	}
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

<div class="switcher">
	<button class="trigger" class:compact aria-expanded={open} aria-controls="model-options"
		disabled={ws.loading || ws.invoking !== null} onclick={() => open = !open}
		title="Choose the provider and model for agent operations">
		{triggerLabel} <Icon name="chevron-down" size="0.9em" />
	</button>
	{#if open}
		<div class="options" id="model-options">
			<label>Provider
				<select value={provider.id} disabled={ws.invoking !== null}
					onchange={(e) => changeProvider(e.currentTarget.value)}>
					{#each PROVIDERS as p}<option value={p.id}>{p.label}</option>{/each}
				</select>
			</label>
			{#if provider.id !== 'fixture'}
				<label>Model
					<select value={ws.modelSelection.model} disabled={ws.invoking !== null}
						onchange={(e) => ws.selectModel({ ...ws.modelSelection, provider: provider.id, model: e.currentTarget.value })}>
						<option value="">Provider default</option>
						{#each modelGroups as group}
							<optgroup label={group}>
								{#each provider.models.filter((m) => m.group === group) as model}
									<option value={model.id}>{model.label}</option>
								{/each}
							</optgroup>
						{/each}
						{#if ws.modelSelection.model && !selectedPreset}
							<option value={ws.modelSelection.model}>{ws.modelSelection.model}</option>
						{/if}
					</select>
				</label>
				<p>Model access depends on your account and sign-in method.</p>
				<form onsubmit={(e) => {
					e.preventDefault();
					const model = custom.trim();
					invalid = !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model);
					if (!invalid) { ws.selectModel({ ...ws.modelSelection, provider: provider.id, model }); custom = ''; }
				}}>
					<label for="custom-model">Other model ID</label>
					<div class="custom"><input id="custom-model" bind:value={custom} placeholder="Enter a model ID"
						aria-invalid={invalid} disabled={ws.invoking !== null} maxlength="128" />
						<button disabled={!custom.trim() || ws.invoking !== null}>Use</button></div>
					{#if invalid}<p role="alert">Enter a valid model ID.</p>{/if}
				</form>
				<label>Reasoning effort
					<select value={ws.modelSelection.effort ?? ''} disabled={ws.invoking !== null}
						onchange={(e) => changeEffort(e.currentTarget.value)}>
						<option value="">Provider default</option>
						{#each REASONING_EFFORTS as level}
							<option value={level}>{EFFORT_LABELS[level]}</option>
						{/each}
					</select>
				</label>
				<p>{ws.modelSelection.effort && !effortUsed
					? `${modelLabel} predates reasoning effort, so this model ignores the setting.`
					: 'How much the model deliberates before answering. Higher costs more and takes longer.'}</p>
			{/if}
			<p>{provider.id === 'codex-cli' ? 'Uses your Codex CLI login. Run codex login to connect.' :
				provider.id === 'claude-cli' ? 'Uses your Claude Code login.' :
				provider.id === 'live' ? 'Uses the server’s Anthropic API credentials.' : 'Deterministic proposals. No model calls.'}</p>
			<p>Applies to all agent operations. Your selection is remembered.</p>
			<button class="done" aria-expanded={setup} onclick={() => setup = !setup}>{setup ? "Hide local agent setup" : "Set up local Claude / Codex"}</button>
			{#if setup}<LocalAgentSetup />{/if}
			<button class="done" onclick={() => open = false}>Done</button>
		</div>
	{/if}
</div>

<style>
	.switcher { position: relative; flex-shrink: 0; }
	button, select, input { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--card-white); border: 1px solid var(--card-border); border-radius: 6px; padding: 5px 8px; }
	button { cursor: pointer; }
	button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
	button:disabled { opacity: .45; cursor: not-allowed; }
	.trigger { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.trigger.compact { max-width: 120px; }
	.options { position: absolute; bottom: calc(100% + 10px); left: 0; z-index: 100; width: min(340px, calc(100vw - 48px)); max-height: calc(100dvh - 160px); overflow-y: auto; padding: 16px; background: var(--paper-raised); border: 1px solid var(--control-border); border-radius: 8px; box-shadow: var(--shadow-menu); }
	label { display: flex; flex-direction: column; gap: 6px; font-size: var(--fs-12); font-weight: 600; margin-bottom: 12px; }
	.custom { display: flex; gap: 6px; }
	input { min-width: 0; flex: 1; }
	p { font-size: var(--fs-11-5); line-height: 1.5; color: var(--ink-muted); }
	.done { width: 100%; margin-top: 8px; }
</style>
