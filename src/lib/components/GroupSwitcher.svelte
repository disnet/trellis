<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';
	import { groupColor } from '$lib/group-colors';
	import { workspace } from '$lib/workspace.svelte';
	import ControlPopover from './ControlPopover.svelte';
	import Icon from './Icon.svelte';
	const ws = workspace;
	let open = $state(false);
	let query = $state('');
	let busy = $state(false);
	const active = $derived(ws.workingSets.find(set => set.id === ws.activeWorkingSetId));
	const total = $derived(Object.keys(ws.thoughts).length);
	const groups = $derived(ws.workingSets.map((set, index) => ({ ...set, color: groupColor(index) }))
		.filter(set => set.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
	$effect(() => { if (!open) query = ''; });
	$effect(() => { ws.activeGraphId; open = false; });

	async function run(fn: () => Promise<string | null>, close: () => void) {
		busy = true;
		try { const err = await fn(); if (err) ws.notice = err; else close(); }
		finally { busy = false; }
	}
	async function create(close: () => void) {
		close();
		const name = await dialogs.prompt('Give this group a name. Add thoughts to it from the canvas or library.', '', 'New group', 40);
		if (name?.trim()) await run(() => ws.createSet(name.trim()), close);
	}
	async function manage(action: 'rename' | 'empty' | 'delete', close: () => void) {
		const group = active;
		if (!group) return;
		close();
		if (action === 'rename') {
			const name = await dialogs.prompt('Rename this group:', group.name, 'Rename group', 40);
			if (name?.trim() && name.trim() !== group.name) await run(() => ws.renameSet(group.id, name.trim()), close);
		} else {
			const verb = action === 'empty' ? 'Empty' : 'Delete';
			if (await dialogs.confirm(`${verb} group “${group.name}”? Every thought stays in the graph.`, `${verb} group`)) {
				await run(() => action === 'empty' ? ws.startFresh() : ws.deleteSet(group.id), close);
			}
		}
	}
</script>

<ControlPopover label={`Switch group: ${active?.name ?? 'All thoughts'}`} bind:open>
	{#snippet trigger()}
		<span class="scope-label">Group</span>
		<span class="current" title={active?.name ?? 'All thoughts'}>{active?.name ?? 'All thoughts'}</span>
		<span class="count">{active?.size ?? total}</span>
	{/snippet}
	{#snippet children(close)}
		<div class="menu-heading">Groups <span>{ws.workingSets.length}</span></div>
		<p class="hint">Focus your attention and the agent’s context.</p>
		<input class="search" aria-label="Find a group" placeholder="Find a group…" bind:value={query}
			onkeydown={(event) => {
				if (event.key === 'ArrowDown') { event.preventDefault(); (event.currentTarget.nextElementSibling as HTMLElement)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
				if (event.key === 'Enter' && query.trim() && groups.length === 1 && !busy) { event.preventDefault(); run(() => ws.switchSet(groups[0].id), close); }
			}} />
		<div class="choices" aria-label="Choose a group">
			<button class="choice all" class:active={!active} aria-pressed={!active} disabled={busy} onclick={() => run(() => ws.switchSet(null), close)}>
				<Icon name="canvas" /><span class="name">All thoughts</span><span class="count">{total}</span><span class="check">{!active ? '✓' : ''}</span>
			</button>
			{#each groups as group (group.id)}
				<button class="choice" class:active={group.id === active?.id} aria-pressed={group.id === active?.id} disabled={busy} onclick={() => run(() => ws.switchSet(group.id), close)}>
					<span class="swatch" style="background: {group.color}"></span><span class="name">{group.name}</span><span class="count">{group.size}</span><span class="check">{group.id === active?.id ? '✓' : ''}</span>
				</button>
			{:else}<p class="empty">{query ? 'No matching groups.' : 'No groups yet. Create one to gather related thoughts.'}</p>{/each}
		</div>
		<button class="action" disabled={busy} onclick={() => create(close)}><Icon name="plus" /> New group…</button>
		{#if active}
			<div class="management">
				<div class="menu-heading">This group <span class="group-name">{active.name}</span></div>
				<button class="action" disabled={busy} onclick={() => manage('rename', close)}><Icon name="pencil" /> Rename group…</button>
				<button class="action" disabled={busy || !active.size} onclick={() => manage('empty', close)}><Icon name="clear" /> Empty group…</button>
				<button class="action danger" disabled={busy} onclick={() => manage('delete', close)}>Delete group…</button>
				<p class="hint">Emptying or deleting a group keeps its thoughts.</p>
			</div>
		{/if}
	{/snippet}
</ControlPopover>

<style>
	.scope-label { color: var(--ink-muted); font-size: var(--fs-11); }
	.current { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
	.count { color: var(--ink-muted); font-size: var(--fs-11); font-variant-numeric: tabular-nums; flex-shrink: 0; }
	.menu-heading { display: flex; align-items: baseline; gap: 8px; padding: 8px 8px 0; font-size: var(--fs-12); font-weight: 600; color: var(--ink); }
	.menu-heading span { font-weight: 400; color: var(--ink-muted); }
	.group-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hint, .empty { margin: 4px 8px 12px; font-size: var(--fs-11); line-height: 1.5; color: var(--ink-muted); }
	.search { box-sizing: border-box; width: calc(100% - 16px); margin: 0 8px 8px; padding: 8px; font: inherit; font-size: var(--fs-12); border: 1px solid var(--control-border); border-radius: 6px; background: var(--card-white); color: var(--ink); }
	.choices { max-height: 260px; overflow-y: auto; }
	.choice, .action { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; min-height: 36px; text-align: left; font: inherit; font-size: var(--fs-12); border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink-soft); cursor: pointer; }
	.choice:hover, .action:hover:not(:disabled) { background: var(--inset-fill); }
	.choice.active { background: var(--inset-fill); font-weight: 600; }
	.name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
	.swatch { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
	.check { width: 12px; color: var(--ink); }
	.all { margin-bottom: 4px; }
	.action:disabled, .choice:disabled { opacity: .45; cursor: not-allowed; }
	.management { margin-top: 8px; padding-top: 4px; border-top: 1px solid var(--hairline); }
	.management .menu-heading { margin-bottom: 4px; }
	.danger:hover:not(:disabled) { color: var(--rust); }
	button:focus-visible, input:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
	@media (max-width: 600px) { .current { max-width: 112px; } .scope-label { display: none; } }
</style>
