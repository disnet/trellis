<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let { label, trigger, children, open = $bindable(false), align = 'left', side = 'bottom', width = 320, chevron = true, disabled = false }: {
		label: string; trigger: Snippet; children: Snippet<[() => void]>;
		open?: boolean; align?: 'left' | 'right'; side?: 'top' | 'bottom'; width?: number; chevron?: boolean; disabled?: boolean;
	} = $props();
	const id = $props.id();
	let root: HTMLDivElement;
	let button = $state<HTMLButtonElement>();
	let panel = $state<HTMLDivElement>();
	let x = $state(0);
	let y = $state(0);
	let maxHeight = $state(400);

	function close() { open = false; button?.focus(); }
	function position() {
		if (!button || !panel) return;
		const rect = button.getBoundingClientRect();
		x = Math.max(8, Math.min(align === 'right' ? rect.right - width : rect.left, window.innerWidth - width - 8));
		y = side === 'top' ? Math.max(8, rect.top - panel.offsetHeight - 8) : rect.bottom + 8;
		maxHeight = Math.max(120, side === 'top' ? rect.top - 16 : window.innerHeight - y - 16);
	}
	$effect(() => {
		if (!open || !panel) return;
		untrack(position);
		const observer = new ResizeObserver(position);
		observer.observe(panel);
		untrack(() => { tick().then(() => { if (open) panel?.querySelector<HTMLElement>('input, button:not(:disabled), a, select')?.focus(); }); });
		return () => observer.disconnect();
	});
	function keydown(event: KeyboardEvent) {
		if (!open || !root?.contains(event.target as Node)) return;
		if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		if ((event.target as HTMLElement).matches('input, select')) return;
		const items = [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a, input, select') ?? [])];
		const index = items.indexOf(document.activeElement as HTMLElement);
		if (index < 0) return;
		event.preventDefault();
		items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
	}
</script>

<svelte:document onkeydown={keydown} onfocusin={(event) => { if (open && !root?.contains(event.target as Node)) open = false; }} onpointerdown={(event) => { if (open && !root?.contains(event.target as Node)) open = false; }} />
<svelte:window onresize={() => open = false} />
<div class="popover" bind:this={root}>
	<button class="trigger" bind:this={button} aria-label={label} aria-expanded={open} aria-controls={id} {disabled} onclick={() => open ? close() : open = true}>
		{@render trigger()}{#if chevron}<Icon name="chevron-down" size="0.9em" />{/if}
	</button>
	{#if open}
		<div class="panel" id={id} bind:this={panel} style="left: {x}px; top: {y}px; width: {width}px; max-height: {maxHeight}px">
			{@render children(close)}
		</div>
	{/if}
</div>

<style>
	.popover { min-width: 0; }
	.trigger { display: flex; align-items: center; gap: 8px; max-width: 100%; min-height: 32px; padding: 4px 8px; font: inherit; font-size: var(--fs-12); color: var(--ink-soft); background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
	.trigger:hover, .trigger[aria-expanded='true'] { background: var(--inset-fill); border-color: var(--control-border); }
	.trigger:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
	.trigger:disabled { opacity: .45; cursor: not-allowed; }
	.panel { position: fixed; z-index: 50; box-sizing: border-box; max-width: calc(100vw - 16px); overflow: auto; padding: 8px; background: var(--paper-raised); border: 1px solid var(--card-border); border-radius: 12px; box-shadow: var(--shadow-menu); }
</style>
