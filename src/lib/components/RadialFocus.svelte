<script lang="ts">
	import { workspace as ws } from '$lib/workspace.svelte';
	import { radialNeighbors, radialSlot } from '$lib/radial-layout';
	import { fade } from 'svelte/transition';
	import { onMount, untrack } from 'svelte';

	let { initialId, onclose }: { initialId: string; onclose: () => void } = $props();
	let mapButton: HTMLButtonElement;
	onMount(() => mapButton?.focus());
	let trail = $state<string[]>([]);
	let currentId = $state(untrack(() => initialId));
	let page = $state(0);
	let width = $state(1080);
	let height = $state(840);
	let reducedMotion = $state(false);
	const current = $derived(ws.thoughts[currentId]);
	const neighbors = $derived(radialNeighbors(currentId, ws.thoughts, ws.relations));
	const pageCount = $derived(Math.max(1, Math.ceil(neighbors.length / 6)));
	const activePage = $derived(Math.min(page, pageCount - 1));
	const visible = $derived(neighbors.slice(activePage * 6, activePage * 6 + 6));
	const scale = $derived(Math.max(.7, Math.min(1, width / 1080, height / 840)));
	$effect(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => reducedMotion = media.matches;
		update(); media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});
	function focus(id: string) {
		if (id === currentId) return;
		trail = [...trail, currentId]; currentId = id; page = 0; ws.select(id);
	}
	function back() {
		const id = trail.at(-1);
		if (!id) return;
		trail = trail.slice(0, -1); currentId = id; page = 0; ws.select(id);
	}
</script>

<section class="radial-focus" aria-label="Radial focus view">
	<header>
		<div class="navigation">
			<button bind:this={mapButton} onclick={onclose}>← Map</button>
			<button onclick={back} disabled={!trail.length} title={trail.length ? `Back to ${ws.thoughts[trail.at(-1)!]?.title ?? 'previous thought'}` : 'No previous focus'}>← Back</button>
			<span class="eyebrow">Focus <span class="prototype">Prototype</span></span>
		</div>
		<p>Inspect a neighbor, or choose <strong>Focus here</strong> to follow its connections.</p>
	</header>
	{#if current}
		<div class="orbit-viewport" bind:clientWidth={width} bind:clientHeight={height}>
			<div class="orbit-frame" style="width: {1080 * scale}px; height: {840 * scale}px;">
				<div class="orbit" style="transform: scale({scale})">
					<svg width="1080" height="840" aria-hidden="true">
						<ellipse cx="540" cy="420" rx="380" ry="270" class="guide" />
						{#each visible as neighbor, index (neighbor.thought.id)}
							{@const pos = radialSlot(index)}
							<line x1="540" y1="420" x2={pos.x} y2={pos.y} class:highlight={ws.selectedIds.includes(neighbor.thought.id)} />
						{/each}
					</svg>
					{#key currentId}
						<article class="center" in:fade={{ duration: reducedMotion ? 0 : 160 }}>
							<span class="eyebrow">In focus · {current.type}</span>
							<button class="center-title" onclick={() => ws.select(currentId)}>{current.title}</button>
							<p class="statement">{current.statement}</p>
							<div class="center-footer"><span>{current.status}</span><span>{neighbors.length} {neighbors.length === 1 ? 'neighbor' : 'neighbors'}</span></div>
						</article>
					{/key}
					{#each visible as neighbor, index (neighbor.thought.id)}
						{@const thought = neighbor.thought}
						{@const pos = radialSlot(index)}
						{@const beyond = radialNeighbors(thought.id, ws.thoughts, ws.relations).filter(n => n.thought.id !== currentId).length}
						<article class="neighbor" class:selected={ws.selectedIds.includes(thought.id)} style="left: {pos.x}px; top: {pos.y}px;">
							<button class="inspect" onclick={() => ws.select(thought.id)} aria-label={`Inspect ${thought.title}`}>
								<span class="eyebrow">{thought.type}{ws.lensActive && !ws.inWorkingSet(thought.id) ? ' · Outside group' : ''}</span>
								<strong>{thought.title}</strong>
							</button>
							<div class="relations">
								{#each neighbor.relations as relation (relation.id)}
									<span>{relation.fromThoughtId === currentId ? 'Focus' : 'This thought'} → {relation.type.replaceAll('_', ' ')} → {relation.fromThoughtId === currentId ? 'this thought' : 'focus'}</span>
								{/each}
							</div>
							<button class="follow" onclick={() => focus(thought.id)}>Focus here <span>{beyond ? `${beyond} more` : '→'}</span></button>
						</article>
					{/each}
					{#if !neighbors.length}<p class="empty">No connections yet. Use Develop or Connect to explore this thought.</p>{/if}
				</div>
			</div>
		</div>
		<footer>
			<div class="pagination">
				{#if pageCount > 1}<button disabled={activePage === 0} onclick={() => page = activePage - 1}>Previous</button>{/if}
				<span aria-live="polite">{neighbors.length ? `${activePage * 6 + 1}–${Math.min((activePage + 1) * 6, neighbors.length)} of ${neighbors.length} direct neighbors` : 'No direct neighbors'}</span>
				{#if pageCount > 1}<button disabled={activePage === pageCount - 1} onclick={() => page = activePage + 1}>Next</button>{/if}
			</div>
			<p>Arrows show relation direction. More distant thoughts appear when you focus a neighbor.</p>
			{#if ws.pendingChangeSets.length}<p class="pending">◇ Pending proposals are in the Proposals panel. Accepted connections appear here when applied.</p>{/if}
		</footer>
	{:else}
		<p class="missing">This thought is no longer available. <button onclick={onclose}>Return to map</button></p>
	{/if}
</section>

<style>
	.radial-focus { position: absolute; inset: var(--workspace-top, 80px) var(--focus-right, 16px) var(--dock-space, 144px) var(--focus-left, 16px); z-index: 20; border: 1px solid var(--hairline); border-radius: 12px; min-width: 260px; display: flex; flex-direction: column; background: var(--paper); color: var(--ink); container-type: inline-size; }
	header { padding: 20px 24px 0; flex-shrink: 0; }
	.navigation { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	button { font: inherit; color: var(--ink-soft); background: var(--paper-raised); border: 1px solid var(--card-border); border-radius: 6px; padding: 7px 12px; cursor: pointer; font-size: var(--fs-12); }
	button:hover:not(:disabled) { color: var(--blue); border-color: var(--blue); }
	button:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
	button:disabled { opacity: .4; cursor: default; }
	.eyebrow { font-size: var(--fs-10); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-muted); }
	.navigation > .eyebrow { margin-left: 12px; }
	.prototype { font-weight: 400; margin-left: 8px; text-transform: none; letter-spacing: 0; }
	header p, footer p { font-size: var(--fs-12); color: var(--ink-muted); line-height: 1.5; margin: 10px 0 0; }
	.orbit-viewport { flex: 1; min-height: 0; overflow: auto; }
	.orbit-frame { position: relative; margin: 0 auto; }
	.orbit { position: relative; width: 1080px; height: 840px; transform-origin: top left; }
	svg { position: absolute; inset: 0; pointer-events: none; }
	.guide { fill: none; stroke: var(--hairline); stroke-dasharray: 3 7; }
	line { stroke: var(--edge-ink); stroke-width: 1; }
	line.highlight { stroke: var(--blue); stroke-width: 2; }
	.center { position: absolute; left: 390px; top: 295px; width: 300px; height: 250px; box-sizing: border-box; padding: 20px; border: 1px solid var(--blue); border-radius: 8px; background: var(--paper-raised); display: flex; flex-direction: column; gap: 10px; }
	.center > .eyebrow { color: var(--blue); }
	.center-title { text-align: left; font-size: var(--fs-16); font-weight: 650; line-height: 1.35; padding: 0; border: 0; background: transparent; max-height: 68px; overflow: auto; flex-shrink: 0; }
	.statement { font-size: var(--fs-13); line-height: 1.6; margin: 0; overflow: auto; flex: 1; white-space: pre-wrap; }
	.center-footer { display: flex; justify-content: space-between; font-size: var(--fs-11); color: var(--ink-muted); }
	.neighbor { position: absolute; transform: translate(-50%, -50%); width: 240px; height: 180px; box-sizing: border-box; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card-white); display: flex; flex-direction: column; overflow: hidden; }
	.neighbor.selected { border-color: var(--blue); box-shadow: 0 0 0 2px var(--focus-glow); }
	.inspect { padding: 12px 14px 6px; border: 0; border-radius: 0; background: transparent; text-align: left; display: flex; flex-direction: column; gap: 6px; }
	.inspect strong { font-size: var(--fs-13); line-height: 1.4; display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.relations { margin: 0 14px 8px; overflow: auto; flex: 1; font-size: var(--fs-11); color: var(--ink-muted); display: flex; flex-direction: column; gap: 4px; }
	.follow { display: flex; justify-content: space-between; border: 0; border-top: 1px solid var(--hairline); border-radius: 0; padding: 9px 14px; color: var(--blue); }
	.follow span { color: var(--ink-muted); }
	.empty { position: absolute; top: 560px; left: 330px; width: 420px; text-align: center; color: var(--ink-muted); font-size: var(--fs-13); line-height: 1.6; }
	footer { padding: 12px 24px 16px; text-align: center; flex-shrink: 0; }
	.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; font-size: var(--fs-12); }
	.pending { color: var(--gold-deep); }
	.missing { padding: 24px; }
	@media (max-width: 700px) { .radial-focus { left: 8px; right: 8px; } }
	@container (max-width: 600px) { header { padding: 12px 16px 0; } footer { padding-inline: 16px; } }
</style>
