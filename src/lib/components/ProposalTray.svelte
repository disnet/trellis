<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import {
		effectivePayload,
		formatConfidence,
		type ChangeSet,
		type OperationPayload,
		type ProposedOperation,
		type RelationType,
		type ThoughtStatus,
		type ThoughtType
	} from '$lib/types';

	const ws = workspace;

	let editingOpId = $state<string | null>(null);
	let showOriginalOpId = $state<string | null>(null);

	// Edit form state
	let eTitle = $state('');
	let eStatement = $state('');
	let eType = $state<ThoughtType>('claim');
	let eStatus = $state<ThoughtStatus>('tentative');
	let eRelType = $state<RelationType>('related_to');

	const thoughtTypes: ThoughtType[] = [
		'claim',
		'question',
		'concept',
		'example',
		'prediction',
		'evidence'
	];
	const thoughtStatuses: ThoughtStatus[] = ['tentative', 'developing', 'believed', 'contested', 'retired'];
	const relationTypes: RelationType[] = [
		'supports',
		'contradicts',
		'depends_on',
		'example_of',
		'supersedes',
		'related_to'
	];

	function startEdit(op: ProposedOperation) {
		const p = effectivePayload(op);
		if (p.op === 'create_thought') {
			eTitle = p.thought.title;
			eStatement = p.thought.statement;
			eType = p.thought.type;
			eStatus = p.thought.status;
		} else if (p.op === 'add_relation') {
			eRelType = p.relationType;
		}
		editingOpId = op.id;
	}

	async function saveEdit(cs: ChangeSet, op: ProposedOperation) {
		const p = effectivePayload(op);
		let edited: OperationPayload;
		if (p.op === 'create_thought') {
			// Structured fields (confidence, source) are not editable here; carry
			// them through unchanged so an edit never silently drops them.
			edited = {
				op: 'create_thought',
				thought: {
					type: eType,
					status: eStatus,
					title: eTitle,
					statement: eStatement,
					confidence: eType === 'prediction' ? p.thought.confidence : undefined,
					source: p.thought.source
				}
			};
		} else if (p.op === 'add_relation') {
			edited = { ...p, relationType: eRelType };
		} else {
			edited = p;
		}
		const err = await ws.saveEdit(cs, op, edited);
		if (err) {
			ws.notice = err;
			return;
		}
		const acceptErr = await ws.setDecision(cs, op, 'accepted');
		if (acceptErr) ws.notice = acceptErr;
		editingOpId = null;
	}

	async function decide(cs: ChangeSet, op: ProposedOperation, decision: 'accepted' | 'rejected' | 'pending') {
		const err = await ws.setDecision(cs, op, decision);
		if (err) ws.notice = err;
	}

	async function apply(cs: ChangeSet) {
		const err = await ws.applyChangeSet(cs);
		if (err) ws.notice = err;
	}

	function counts(cs: ChangeSet) {
		let a = 0,
			r = 0,
			p = 0;
		for (const op of cs.operations) {
			if (op.decision === 'accepted') a++;
			else if (op.decision === 'rejected') r++;
			else p++;
		}
		return { a, r, p };
	}

	function evidenceLabel(ref: string): string {
		if (ws.thoughts[ref]) return ws.thoughts[ref].title;
		if (ref.startsWith('scratch')) return 'scratch note';
		return ref;
	}

	const actionNames = {
		decompose: 'Decompose',
		develop: 'Develop',
		challenge: 'Challenge',
		connect: 'Connect'
	} as const;
</script>

<section class="tray">
	<h2>Proposals</h2>
	{#if ws.pendingChangeSets.length === 0}
		<p class="hint">
			No pending proposals. Run an operation on a selection, or decompose scratch text.
		</p>
	{:else}
		{#each ws.pendingChangeSets as cs (cs.id)}
			{@const c = counts(cs)}
			<article class="changeset">
				<header>
					<span class="action">{actionNames[cs.action]}</span>
					<p class="summary">{cs.summary}</p>
					{#if cs.invokedOn.length > 0}
						<p class="using">
							using: {cs.invokedOn.map((id) => ws.thoughts[id]?.title ?? id).join(', ')}
						</p>
					{/if}
					{#if cs.consulted.length > 0}
						<!-- Graph-wide retrieval is disclosed, never invisible: exactly
						     which thoughts the search added to the agent's context. -->
						<details class="consulted">
							<summary>consulted {cs.consulted.length} thought{cs.consulted.length === 1 ? '' : 's'} found across the graph</summary>
							<ul>
								{#each cs.consulted as cid (cid)}
									<li>
										<button
											class="consulted-link"
											title="Select this thought"
											onclick={() => ws.select(cid)}
										>{ws.thoughts[cid]?.title ?? cid}</button>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</header>

				<ul class="ops">
					{#each cs.operations as op (op.id)}
						{@const p = effectivePayload(op)}
						{@const blocked = ws.acceptBlockReason(cs, op)}
						<li class="op decision-{op.decision}">
							<div class="op-head">
								<span class="op-kind">
									{p.op === 'create_thought'
										? `+ ${p.thought.type}`
										: p.op === 'add_relation'
											? `⇢ ${p.relationType.replace('_', ' ')}`
											: '± revise'}
								</span>
								<span class="op-decision">
									{op.decision === 'pending' ? '· pending' : op.decision === 'accepted' ? '✓ accepted' : '✕ rejected'}
								</span>
							</div>

							{#if editingOpId === op.id}
								<div class="edit-form">
									{#if p.op === 'create_thought'}
										<div class="row">
											<select bind:value={eType} aria-label="Type">
												{#each thoughtTypes as t (t)}<option value={t}>{t}</option>{/each}
											</select>
											<select bind:value={eStatus} aria-label="Status">
												{#each thoughtStatuses as s (s)}<option value={s}>{s}</option>{/each}
											</select>
										</div>
										<input bind:value={eTitle} aria-label="Title" />
										<textarea bind:value={eStatement} rows="4" aria-label="Statement"></textarea>
									{:else if p.op === 'add_relation'}
										<label class="rel-edit">
											Relation type
											<select bind:value={eRelType}>
												{#each relationTypes as t (t)}<option value={t}>{t.replace('_', ' ')}</option>{/each}
											</select>
										</label>
									{/if}
									<div class="row">
										<button class="primary" onclick={() => saveEdit(cs, op)}>Save edit & accept</button>
										<button onclick={() => (editingOpId = null)}>Cancel</button>
									</div>
								</div>
							{:else}
								<div class="op-label">{ws.opLabel(op)}</div>
								{#if p.op === 'create_thought'}
									<p class="op-statement">{p.thought.statement}</p>
								{/if}
								{#if (p.op === 'create_thought' || p.op === 'revise_thought') && p.thought.confidence}
									<p class="op-extra">confidence: {formatConfidence(p.thought.confidence)}</p>
								{/if}
								{#if (p.op === 'create_thought' || p.op === 'revise_thought') && p.thought.source}
									<p class="op-extra">source: {p.thought.source}</p>
								{/if}
								<p class="rationale">{op.rationale}</p>
								{#if op.evidenceRefs.length > 0}
									<p class="evidence">evidence: {op.evidenceRefs.map(evidenceLabel).join(', ')}</p>
								{/if}
								{#if op.editedPayload}
									<p class="edited-note">
										✎ edited by you — original preserved
										<button
											class="link"
											onclick={() => (showOriginalOpId = showOriginalOpId === op.id ? null : op.id)}
										>
											{showOriginalOpId === op.id ? 'hide original' : 'view original'}
										</button>
									</p>
									{#if showOriginalOpId === op.id}
										<div class="original">
											{#if op.payload.op === 'create_thought'}
												<div class="op-label">{op.payload.thought.title}</div>
												<p class="op-statement">{op.payload.thought.statement}</p>
											{:else if op.payload.op === 'add_relation'}
												<p class="op-statement">relation type: {op.payload.relationType.replace('_', ' ')}</p>
											{/if}
										</div>
									{/if}
								{/if}
								{#if blocked && op.decision === 'pending'}
									<p class="blocked">{blocked}</p>
								{/if}
								<div class="row buttons">
									{#if op.decision === 'pending'}
										<button class="accept" disabled={blocked !== null} onclick={() => decide(cs, op, 'accepted')}>
											Accept
										</button>
										<button onclick={() => startEdit(op)}>Edit…</button>
										<button class="reject" onclick={() => decide(cs, op, 'rejected')}>Reject</button>
									{:else}
										<button class="link" onclick={() => decide(cs, op, 'pending')}>Reconsider</button>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>

				{#if cs.operations.some(op => op.decision === 'accepted' && effectivePayload(op).op === 'create_thought')}
					<div class="placement">
						<button disabled={c.p > 0 || ws.applying} onclick={() => ws.layoutPreview?.csId === cs.id ? ws.cancelLayoutPreview() : ws.previewPlacement(cs)}>
							{ws.layoutPreview?.csId === cs.id ? 'Cancel placement preview' : 'Preview placement'}
						</button>
						<p>{ws.layoutPreview?.csId === cs.id ? `${ws.layoutPreview.moved} existing thoughts will move. Nothing is saved until you apply.` : 'Applying makes room near connected thoughts. Undo last apply also restores their positions.'}</p>
					</div>
				{/if}
				<footer>
					<span class="tally">
						{c.a} accepted · {c.r} rejected{c.p > 0 ? ` · ${c.p} to review` : ''}
					</span>
					<button
						class="primary"
						disabled={c.p > 0 || ws.applying}
						title={c.p > 0 ? 'Decide every operation before applying' : ''}
						onclick={() => apply(cs)}
					>
						{c.a === 0 ? 'Dismiss change set' : c.r === 0 ? 'Apply all' : `Apply ${c.a} accepted`}
					</button>
				</footer>
			</article>
		{/each}
	{/if}

	{#if ws.decidedChangeSets.length > 0}
		<h3>Ratified</h3>
		<ul class="history">
			{#each [...ws.decidedChangeSets].reverse() as cs (cs.id)}
				<li>
					<span class="action small">{actionNames[cs.action]}</span>
					<span class="hist-summary">{cs.summary}</span>
					<span class="hist-status">{cs.status.replace('_', ' ')}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.tray {
		padding: 12px;
		overflow-y: auto;
		height: 100%;
		box-sizing: border-box;
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
	h3 {
		margin: 8px 0 0;
		font-size: var(--fs-11);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-quiet);
	}
	.hint {
		font-size: var(--fs-12);
		color: var(--ink-quiet);
		line-height: 1.4;
	}
	.changeset {
		border: 1.5px dashed var(--gold-soft);
		border-radius: 8px;
		background: var(--parchment);
		padding: 10px;
	}
	.changeset header {
		margin-bottom: 8px;
	}
	.action {
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: var(--gold-ink);
		background: var(--gold-tag);
		border-radius: 4px;
		padding: 2px 7px;
	}
	/* Ratified history: gold leaves an accepted change set entirely — the tag
	   goes neutral once the decision is made. */
	.action.small {
		font-size: var(--fs-9);
		padding: 1px 5px;
		background: var(--divider);
		color: var(--ink-muted);
	}
	.summary {
		margin: 6px 0 0;
		font-size: var(--fs-13);
		font-weight: 600;
		color: var(--ink-soft);
		line-height: 1.35;
	}
	.using {
		margin: 4px 0 0;
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
	.consulted {
		margin: 4px 0 0;
		font-size: var(--fs-11);
		color: var(--slate-ink);
	}
	.consulted summary {
		cursor: pointer;
		list-style: none;
	}
	.consulted summary::before {
		content: '▸ ';
	}
	.consulted[open] summary::before {
		content: '▾ ';
	}
	.consulted summary::-webkit-details-marker {
		display: none;
	}
	.consulted ul {
		list-style: none;
		margin: 4px 0 0;
		padding: 0 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.consulted-link {
		font: inherit;
		border: none;
		background: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
	}
	.consulted-link:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	.ops {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.op {
		background: var(--card-white);
		border: 1px solid var(--hairline);
		border-radius: 6px;
		padding: 8px;
		font-size: var(--fs-12);
	}
	.op.decision-accepted {
		border-color: var(--accept-green);
		background: var(--accept-fill);
	}
	.op.decision-rejected {
		border-color: var(--control-border);
		background: var(--inset-fill);
		opacity: 0.75;
	}
	.op-head {
		display: flex;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.op-kind {
		font-weight: 700;
		color: var(--ink-faded);
		font-size: var(--fs-11);
	}
	.op-decision {
		font-size: var(--fs-11);
		color: var(--ink-muted);
		font-weight: 600;
	}
	.decision-accepted .op-decision {
		color: var(--moss-ink);
	}
	.decision-rejected .op-decision {
		color: var(--clay-ink);
	}
	.op-label {
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
	}
	.op-statement {
		margin: 4px 0 0;
		color: var(--ink-soft);
		line-height: 1.4;
	}
	.rationale {
		margin: 6px 0 0;
		color: var(--ink-muted);
		font-style: italic;
		line-height: 1.35;
	}
	.evidence {
		margin: 4px 0 0;
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
	.op-extra {
		margin: 4px 0 0;
		font-size: var(--fs-11);
		font-weight: 600;
		color: var(--plum-ink);
		word-break: break-word;
	}
	.edited-note {
		margin: 6px 0 0;
		font-size: var(--fs-11);
		color: var(--moss-ink);
	}
	.original {
		margin-top: 4px;
		border-left: 2px solid var(--control-border);
		padding-left: 8px;
		opacity: 0.8;
	}
	.blocked {
		margin: 6px 0 0;
		font-size: var(--fs-11);
		color: var(--rust);
		background: var(--rust-wash);
		border-radius: 4px;
		padding: 4px 6px;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.buttons {
		margin-top: 8px;
	}
	button {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		background: var(--card-white);
		color: var(--ink-soft);
		border-radius: 6px;
		padding: 4px 10px;
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
	button.accept {
		border-color: var(--accept-green);
		color: var(--moss-ink);
		font-weight: 600;
	}
	button.accept:hover:not(:disabled) {
		border-color: var(--accept-green);
		background: var(--accept-fill);
		color: var(--moss-ink);
	}
	button.reject {
		border-color: #c8a89a;
		color: var(--clay-ink);
	}
	button.reject:hover:not(:disabled) {
		border-color: var(--rust);
		color: var(--rust);
	}
	button.primary {
		border-color: var(--card-border);
		font-weight: 600;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--ink-muted);
		text-decoration: underline;
		text-decoration-color: var(--card-border);
		text-underline-offset: 2px;
		cursor: pointer;
		font-size: var(--fs-11);
	}
	button.link:hover {
		color: var(--blue);
		text-decoration-color: var(--blue);
	}
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 4px;
	}
	.edit-form input,
	.edit-form textarea,
	.edit-form select {
		font: inherit;
		font-size: var(--fs-12);
		border: 1px solid var(--control-border);
		border-radius: 6px;
		padding: 5px 7px;
		background: var(--paper-raised);
		width: 100%;
		box-sizing: border-box;
	}
	.rel-edit {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: var(--fs-11);
		color: var(--ink-quiet);
	}
	.placement { margin-top: 12px; }
	.placement p { font-size: var(--fs-11); color: var(--ink-muted); line-height: 1.5; margin: 6px 0 0; }
	.changeset footer {
		margin-top: 10px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.tally {
		font-size: var(--fs-11);
		color: var(--ink-muted);
	}
	.history {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.history li {
		font-size: var(--fs-11);
		color: var(--ink-muted);
		display: flex;
		gap: 6px;
		align-items: baseline;
		background: var(--inset-fill);
		border-radius: 6px;
		padding: 5px 8px;
	}
	.hist-summary {
		flex: 1;
		line-height: 1.3;
	}
	.hist-status {
		white-space: nowrap;
		font-weight: 600;
		color: var(--ink-faded);
	}
</style>
