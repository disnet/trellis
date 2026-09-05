<script lang="ts">
	import { PROVIDERS, type AgentProvider } from '$lib/models';
	import { workspace as ws } from '$lib/workspace.svelte';
	let open = $state(false);
	let custom = $state('');
	let invalid = $state(false);
	const provider = $derived(PROVIDERS.find((p) => p.id === ws.modelSelection.provider)!);
	const selectedPreset = $derived(provider.models.find((m) => m.id === ws.modelSelection.model));
	const modelGroups = $derived([...new Set(provider.models.map((m) => m.group))]);
	function changeProvider(value: string) {
		ws.selectModel({ provider: value as AgentProvider, model: '' });
		custom = '';
		invalid = false;
	}
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

<div class="switcher">
	<button class="trigger" aria-expanded={open} aria-controls="model-options"
		disabled={ws.loading || ws.invoking !== null} onclick={() => open = !open}
		title="Choose the provider and model for agent operations">
		{provider.label} · {selectedPreset?.label ?? (ws.modelSelection.model || 'Default')} <span aria-hidden="true">⌄</span>
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
						onchange={(e) => ws.selectModel({ provider: provider.id, model: e.currentTarget.value })}>
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
					if (!invalid) { ws.selectModel({ provider: provider.id, model }); custom = ''; }
				}}>
					<label for="custom-model">Other model ID</label>
					<div class="custom"><input id="custom-model" bind:value={custom} placeholder="Enter a model ID"
						aria-invalid={invalid} disabled={ws.invoking !== null} maxlength="128" />
						<button disabled={!custom.trim() || ws.invoking !== null}>Use</button></div>
					{#if invalid}<p role="alert">Enter a valid model ID.</p>{/if}
				</form>
			{/if}
			<p>{provider.id === 'codex-cli' ? 'Uses your Codex CLI login. Run codex login to connect.' :
				provider.id === 'claude-cli' ? 'Uses your Claude Code login.' :
				provider.id === 'live' ? 'Uses the server’s Anthropic API credentials.' : 'Deterministic proposals. No model calls.'}</p>
			<p>Applies to all agent operations. Saved in this browser.</p>
			<button class="done" onclick={() => open = false}>Done</button>
		</div>
	{/if}
</div>

<style>
	.switcher { position: relative; flex-shrink: 0; }
	button, select, input { font: inherit; font-size: 12px; color: #4d473c; background: #fff; border: 1px solid #c9c4b8; border-radius: 6px; padding: 5px 8px; }
	button { cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
	.trigger { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.options { position: absolute; top: calc(100% + 10px); left: 0; z-index: 100; width: 280px; padding: 16px; background: #fffdf8; border: 1px solid #d5d0c4; border-radius: 8px; box-shadow: 0 6px 24px #382f201f; }
	label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
	.custom { display: flex; gap: 6px; }
	input { min-width: 0; flex: 1; }
	p { font-size: 11.5px; line-height: 1.5; color: #756d5f; }
	.done { width: 100%; }
</style>
