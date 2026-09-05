<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace as ws } from '$lib/workspace.svelte';
  type Provider = 'claude-cli' | 'codex-cli';
  type Status = { bin: string; status: string; message: string; version?: string };
  const providers = [
    { id: 'claude-cli' as Provider, label: 'Claude Code', command: 'claude auth login', install: 'https://code.claude.com/docs/en/setup' },
    { id: 'codex-cli' as Provider, label: 'Codex', command: 'codex login', install: 'https://developers.openai.com/codex/cli/' }
  ];
  let paths = $state<Record<Provider, string>>({ 'claude-cli': '', 'codex-cli': '' });
  let results = $state<Partial<Record<Provider, Status>>>({});
  let busy = $state<Partial<Record<Provider, boolean>>>({});
  let errors = $state<Partial<Record<Provider, string>>>({});
  let loading = $state(true);
  let error = $state('');
  let saved = $state<Partial<Record<Provider, boolean>>>({});
  async function request(body: unknown) {
    const response = await fetch('/api/local-agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Could not reach local agent setup.');
    return data;
  }
  async function check(provider: Provider, save = false) {
    busy[provider] = true; errors[provider] = ''; saved[provider] = false;
    try {
      results[provider] = await request({ action: save ? 'save' : 'check', provider, path: paths[provider].trim() });
      saved[provider] = save;
    } catch (e) { errors[provider] = e instanceof Error ? e.message : 'Check failed.'; }
    finally { busy[provider] = false; }
  }
  onMount(() => {
    void (async () => {
      try {
        const settings = await request({ action: 'load' });
        paths = { 'claude-cli': '', 'codex-cli': '', ...settings.paths };
        loading = false;
        await Promise.all(providers.map(p => check(p.id)));
      } catch (e) { error = e instanceof Error ? e.message : 'Could not load settings.'; }
      finally { loading = false; }
    })();
  });
  function loginCommand(provider: typeof providers[number]) {
    const bin = results[provider.id]?.bin;
    return bin?.startsWith('/') ? `'${bin.replaceAll("'", "'\\''")}' ${provider.id === 'claude-cli' ? 'auth login' : 'login'}` : provider.command;
  }
</script>

<div class="setup">
  <h3>Local agents</h3>
  <p>Connect the CLIs on this computer. Trellis uses their existing login and loads terminal authentication settings when opened from Finder.</p>
  {#if loading}<p role="status">Finding your settings…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#each providers as provider}
    {@const result = results[provider.id]}
    <section aria-label={provider.label}>
      <div class="heading"><h4>{provider.label}</h4><span class:ready={result?.status === 'ready'}>{busy[provider.id] ? 'Checking…' : result?.status === 'ready' ? 'Connected' : result?.status === 'signed-out' ? 'Sign-in needed' : result?.status === 'missing' ? 'Not installed' : 'Setup'}</span></div>
      {#if result}<p role="status">{result.message}</p>{/if}
      {#if result?.version}<small>{result.version}</small>{/if}
      {#if result?.status !== 'ready'}
        <p><a href={provider.install} target="_blank" rel="noreferrer">Install {provider.label}</a>, then run in your terminal:</p>
        <code>{loginCommand(provider)}</code>
        <p>After signing in, choose Check again.</p>
      {/if}
      <details>
        <summary>Executable path</summary>
        <label>Custom path <input aria-label={`${provider.label} executable path`} bind:value={paths[provider.id]} placeholder="Automatic detection" disabled={loading || busy[provider.id]} oninput={() => { saved[provider.id] = false; delete results[provider.id]; }} /></label>
        {#if result}<small class="path">Detected: {result.bin}</small>{/if}
        <button disabled={loading || busy[provider.id] || ws.invoking !== null} onclick={() => check(provider.id, true)}>Save path</button>
        {#if saved[provider.id]}<small role="status">Path saved.</small>{/if}
      </details>
      {#if errors[provider.id]}<p role="alert">{errors[provider.id]}</p>{/if}
      <div class="actions">
        <button disabled={loading || busy[provider.id]} onclick={() => check(provider.id)}>Check again</button>
        <button disabled={loading || busy[provider.id] || result?.status !== 'ready' || ws.invoking !== null} onclick={async () => {
          await check(provider.id, true);
          if (!errors[provider.id] && results[provider.id]?.status === 'ready') ws.selectModel({ provider: provider.id, model: '' });
        }}>{ws.modelSelection.provider === provider.id ? 'Selected' : `Use ${provider.label}`}</button>
      </div>
    </section>
  {/each}
</div>

<style>
  .setup { border-top: 1px solid var(--control-border); margin-top: 16px; padding-top: 16px; }
  h3 { font-size: var(--fs-13); margin: 0 0 8px; }
  h4 { font-size: var(--fs-12); margin: 0; }
  p, small, summary, label, span { font-size: var(--fs-11-5); line-height: 1.5; }
  p, small { color: var(--ink-muted); }
  section { border-top: 1px solid var(--divider); padding: 16px 0 0; margin-top: 16px; }
  .heading, .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .heading span { color: var(--ink-muted); } .heading .ready { color: var(--moss-ink); }
  button, input { font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: var(--paper-raised); border: 1px solid var(--card-border); border-radius: 6px; padding: 6px 8px; }
  button, summary { cursor: pointer; } button:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  a { color: var(--moss-ink); text-underline-offset: 2px; } a:hover { color: var(--blue); }
  code { display: block; overflow-wrap: anywhere; font-size: var(--fs-11); border-radius: 4px; padding: 8px; background: var(--inset-fill); color: var(--ink-soft); }
  details { margin: 12px 0; } label { display: grid; gap: 4px; margin-top: 8px; }
  input { width: 100%; box-sizing: border-box; } small { display: block; margin: 6px 0; } .path { overflow-wrap: anywhere; }
</style>
