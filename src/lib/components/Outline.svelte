<script lang="ts">
	// Read-only outline projection of the working set (Phase 4). Same objects,
	// same selection, same provisional change-set content as the canvas — only
	// the presentation differs. No editing, reordering, or capture here.
	import { workspace } from '$lib/workspace.svelte';
	import { effectivePayload, type ThoughtType } from '$lib/types';

	const ws = workspace;

	interface RefLine {
		key: string;
		dir: '→' | '←';
		type: string;
		title: string;
		/** Existing thought to select on click, when the endpoint is one. */
		targetId?: string;
		proposed: boolean;
	}

	interface OutlineEntry {
		key: string;
		/** Present only for accepted working-set thoughts — ghosts are not selectable. */
		id?: string;
		ghost: 'proposed' | 'surfaced' | null;
		type: ThoughtType;
		status: string;
		title: string;
		statement: string;
		provenance: 'human' | 'agent';
		pinned: boolean;
		refs: RefLine[];
		pendingRevision: boolean;
	}

	function provenance(thoughtId: string): 'human' | 'agent' {
		const t = ws.thoughts[thoughtId];
		return t?.revisions[0]?.actorType === 'agent' && !t.revisions.some((r) => r.actorType === 'human')
			? 'agent'
			: 'human';
	}

	// Thoughts with a non-rejected pending revision, marked so provisional
	// status is visible here as well as in the tray.
	const pendingRevisionIds = $derived.by((): Set<string> => {
		const out = new Set<string>();
		for (const cs of ws.pendingChangeSets) {
			for (const op of cs.operations) {
				const p = effectivePayload(op);
				if (p.op === 'revise_thought' && op.decision !== 'rejected') out.add(p.thoughtId);
			}
		}
		return out;
	});

	const entries = $derived.by((): OutlineEntry[] => {
		const out: OutlineEntry[] = [];
		// Endpoint token → entry, for attaching relation lines. Tokens are thought
		// ids, plus `${csId}:${clientRef}` for proposed creates.
		const byToken = new Map<string, OutlineEntry>();

		for (const item of ws.workingSet) {
			const t = ws.thoughts[item.thoughtId];
			if (!t) continue;
			const e: OutlineEntry = {
				key: t.id,
				id: t.id,
				ghost: null,
				type: t.type,
				status: t.status,
				title: t.title,
				statement: t.statement,
				provenance: provenance(t.id),
				pinned: ws.isPinned(t.id),
				refs: [],
				pendingRevision: pendingRevisionIds.has(t.id)
			};
			out.push(e);
			byToken.set(t.id, e);
		}

		// Provisional entries, mirroring the canvas ghost cards.
		for (const cs of ws.pendingChangeSets) {
			for (const pr of ws.previewRefs(cs)) {
				const key = `${cs.id}:${pr.ref}`;
				if (pr.existingId) {
					const t = ws.thoughts[pr.existingId];
					if (!t || byToken.has(pr.existingId)) continue;
					const e: OutlineEntry = {
						key,
						ghost: 'surfaced',
						type: t.type,
						status: t.status,
						title: t.title,
						statement: t.statement,
						provenance: provenance(t.id),
						pinned: ws.isPinned(t.id),
						refs: [],
						pendingRevision: false
					};
					out.push(e);
					byToken.set(pr.existingId, e);
					continue;
				}
				const op = cs.operations.find((o) => o.clientRef === pr.ref);
				if (!op || op.decision === 'rejected') continue;
				const p = effectivePayload(op);
				if (p.op !== 'create_thought') continue;
				const e: OutlineEntry = {
					key,
					ghost: 'proposed',
					type: p.thought.type,
					status: p.thought.status,
					title: p.thought.title,
					statement: p.thought.statement,
					provenance: 'agent',
					pinned: false,
					refs: [],
					pendingRevision: false
				};
				out.push(e);
				byToken.set(key, e);
			}
		}

		// Accepted relations, inline on accepted thoughts.
		for (const r of ws.relations) {
			const label = r.type.replace('_', ' ');
			const from = byToken.get(r.fromThoughtId);
			if (from && !from.ghost) {
				from.refs.push({
					key: `${r.id}:out`,
					dir: '→',
					type: label,
					title: ws.thoughts[r.toThoughtId]?.title ?? '?',
					targetId: r.toThoughtId in ws.thoughts ? r.toThoughtId : undefined,
					proposed: false
				});
			}
			const to = byToken.get(r.toThoughtId);
			if (to && !to.ghost) {
				to.refs.push({
					key: `${r.id}:in`,
					dir: '←',
					type: label,
					title: ws.thoughts[r.fromThoughtId]?.title ?? '?',
					targetId: r.fromThoughtId in ws.thoughts ? r.fromThoughtId : undefined,
					proposed: false
				});
			}
		}

		// Proposed relations, visibly provisional on both endpoints.
		for (const cs of ws.pendingChangeSets) {
			const hiddenRefs = new Set(
				cs.operations
					.filter((o) => o.decision === 'rejected' && effectivePayload(o).op === 'create_thought')
					.map((o) => o.clientRef)
			);
			const createTitle = (token: string): string | undefined => {
				const op = cs.operations.find((o) => o.clientRef === token);
				if (!op) return undefined;
				const p = effectivePayload(op);
				return p.op === 'create_thought' ? p.thought.title : undefined;
			};
			const resolve = (token: string) => byToken.get(token) ?? byToken.get(`${cs.id}:${token}`);
			for (const op of cs.operations) {
				const p = effectivePayload(op);
				if (p.op !== 'add_relation' || op.decision === 'rejected') continue;
				if (hiddenRefs.has(p.from) || hiddenRefs.has(p.to)) continue;
				const label = p.relationType.replace('_', ' ');
				const from = resolve(p.from);
				if (from) {
					from.refs.push({
						key: `${op.id}:out`,
						dir: '→',
						type: label,
						title: ws.thoughts[p.to]?.title ?? createTitle(p.to) ?? '?',
						targetId: p.to in ws.thoughts ? p.to : undefined,
						proposed: true
					});
				}
				const to = resolve(p.to);
				if (to) {
					to.refs.push({
						key: `${op.id}:in`,
						dir: '←',
						type: label,
						title: ws.thoughts[p.from]?.title ?? createTitle(p.from) ?? '?',
						targetId: p.from in ws.thoughts ? p.from : undefined,
						proposed: true
					});
				}
			}
		}

		return out;
	});

	const TYPE_ORDER: { type: ThoughtType; label: string }[] = [
		{ type: 'claim', label: 'Claims' },
		{ type: 'prediction', label: 'Predictions' },
		{ type: 'question', label: 'Questions' },
		{ type: 'concept', label: 'Concepts' },
		{ type: 'example', label: 'Examples' },
		{ type: 'evidence', label: 'Evidence' }
	];

	// Accepted thoughts first (alphabetical), then proposals at the edge of the
	// group — the outline's version of "proposals appear at the edge".
	const groups = $derived(
		TYPE_ORDER.map(({ type, label }) => ({
			type,
			label,
			entries: entries
				.filter((e) => e.type === type)
				.sort((a, b) => {
					const rank = (e: OutlineEntry) => (e.ghost === null ? 0 : e.ghost === 'proposed' ? 1 : 2);
					return rank(a) - rank(b) || a.title.localeCompare(b.title);
				})
		})).filter((g) => g.entries.length > 0)
	);

	function selectEntry(e: OutlineEntry, additive: boolean) {
		if (e.id) ws.select(e.id, additive);
	}

	function selectRef(ref: RefLine) {
		if (ref.targetId) ws.select(ref.targetId);
	}
</script>

<div class="outline" aria-label="Outline projection of the working set">
	{#if entries.length === 0}
		<div class="empty">The working set is empty — search the library to add thoughts.</div>
	{:else}
		<div class="inner">
			{#each groups as g (g.type)}
				<section>
					<h2>
						<span class="type type-{g.type}">{g.label}</span>
						<span class="count">{g.entries.length}</span>
					</h2>
					<ul class="rows">
						{#each g.entries as e (e.key)}
							<li>
								<div
									class="row {e.ghost ?? ''}"
									class:selected={e.id !== undefined && ws.selectedIds.includes(e.id)}
									class:selectable={e.id !== undefined}
									role="button"
									tabindex={e.id !== undefined ? 0 : undefined}
									onclick={(ev) => selectEntry(e, ev.shiftKey)}
									onkeydown={(ev) => {
										if (ev.key === 'Enter' || ev.key === ' ') {
											ev.preventDefault();
											selectEntry(e, ev.shiftKey);
										}
									}}
								>
									<div class="head">
										{#if e.pinned}<span class="pin" title="Pinned">⚑</span>{/if}
										<span class="title">{e.title}</span>
										{#if e.ghost === 'proposed'}
											<span class="badge proposed-badge">◇ proposed</span>
										{:else if e.ghost === 'surfaced'}
											<span class="badge surfaced-badge">↖ existing</span>
										{:else}
											<span class="badge actor">{e.provenance === 'agent' ? '✳ agent' : '✎ you'}</span>
										{/if}
										{#if e.pendingRevision}
											<span class="badge revision-badge">◇ revision pending</span>
										{/if}
										<span class="status">{e.status}</span>
									</div>
									{#if ws.zoom === 'reading'}
										<p class="statement">{e.statement}</p>
									{/if}
									{#if e.refs.length > 0}
										<ul class="refs">
											{#each e.refs as ref (ref.key)}
												<li class="ref" class:proposed={ref.proposed}>
													<span class="dir">{ref.dir}</span>
													<span class="reltype">{ref.type}</span>
													{#if ref.targetId}
														<button
															class="ref-target"
															title="Select “{ref.title}”"
															onclick={(ev) => {
																ev.stopPropagation();
																selectRef(ref);
															}}
														>{ref.title}</button>
													{:else}
														<span class="ref-target plain">{ref.title}</span>
													{/if}
													{#if ref.proposed}<span class="ref-mark">◇</span>{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.outline {
		height: 100%;
		overflow-y: auto;
		background: var(--paper);
	}
	.inner {
		max-width: 720px;
		margin: 0 auto;
		padding: 18px 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.empty {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-quiet);
		font-size: var(--fs-13);
	}
	h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 0 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-muted);
	}
	.count {
		font-size: var(--fs-11);
		font-weight: 600;
		color: var(--ink-quiet);
	}
	.type {
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--chip-neutral);
		color: var(--ink-faded);
	}
	.type-claim { background: var(--moss); color: var(--moss-ink); }
	.type-question { background: var(--violet); color: var(--violet-ink); }
	.type-concept { background: var(--slate); color: var(--slate-ink); }
	.type-example { background: var(--clay); color: var(--clay-ink); }
	.type-prediction { background: var(--plum); color: var(--plum-ink); }
	.type-evidence { background: var(--ochre); color: var(--ochre-ink); }
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		background: var(--card-white);
		border: 1.5px solid var(--card-border);
		border-radius: 8px;
		padding: 8px 10px;
		font-size: var(--fs-13);
	}
	.row.selectable {
		cursor: pointer;
	}
	.row.selectable:hover {
		border-color: var(--blue);
	}
	.row.selected {
		border-color: var(--blue);
		/* Border width stays fixed so selecting never reflows the row. */
		box-shadow:
			inset 0 0 0 0.5px var(--blue),
			var(--ring-selection);
	}
	.row.proposed {
		border-style: dashed;
		border-color: var(--gold);
		background: var(--parchment);
	}
	.row.surfaced {
		border-style: dotted;
		border-color: var(--surfaced-slate);
		background: var(--surfaced-fill);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.title {
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
		flex: 1;
	}
	.badge {
		font-size: var(--fs-10);
		white-space: nowrap;
		color: var(--ink-muted);
	}
	.proposed-badge { color: var(--gold-ink); font-weight: 700; }
	.surfaced-badge { color: var(--slate-ink); font-weight: 600; }
	.revision-badge { color: var(--gold-ink); font-weight: 700; }
	.pin {
		font-size: var(--fs-11);
		color: var(--gold-ink);
	}
	.status {
		font-size: var(--fs-10);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--ink-faded);
		background: var(--pill-fill);
		white-space: nowrap;
	}
	.statement {
		margin: 6px 0 0;
		color: var(--ink-soft);
		line-height: 1.4;
		font-size: var(--fs-12);
	}
	.refs {
		list-style: none;
		margin: 6px 0 0;
		padding: 4px 0 0;
		border-top: 1px solid var(--divider);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ref {
		display: flex;
		align-items: baseline;
		gap: 5px;
		font-size: var(--fs-11);
		color: var(--ink-muted);
	}
	.ref.proposed {
		color: var(--gold-deep);
	}
	.dir {
		font-size: var(--fs-11);
	}
	.reltype {
		font-style: italic;
		white-space: nowrap;
	}
	.ref-target {
		font: inherit;
		border: none;
		background: none;
		padding: 0;
		color: var(--ink-soft);
		cursor: pointer;
		text-align: left;
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
	}
	.ref-target:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	.ref-target.plain {
		cursor: default;
		text-decoration: none;
	}
	.ref.proposed .ref-target {
		color: var(--gold-deep);
	}
	.ref-mark {
		font-weight: 700;
		color: var(--gold-ink);
	}
</style>
