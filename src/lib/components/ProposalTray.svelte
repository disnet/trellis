<script lang="ts">
	import { workspace } from '$lib/workspace.svelte';
	import {
		effectivePayload,
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

	const thoughtTypes: ThoughtType[] = ['claim', 'question', 'concept', 'example'];
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
			edited = { op: 'create_thought', thought: { type: eType, status: eStatus, title: eTitle, statement: eStatement } };
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

				<footer>
					<span class="tally">
						{c.a} accepted · {c.r} rejected{c.p > 0 ? ` · ${c.p} to review` : ''}
					</span>
					<button
						class="primary"
						disabled={c.p > 0}
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
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6d675c;
	}
	h3 {
		margin: 8px 0 0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a8375;
	}
	.hint {
		font-size: 12px;
		color: #8a8375;
		line-height: 1.4;
	}
	.changeset {
		border: 1.5px dashed #c9a860;
		border-radius: 8px;
		background: #fdf8ec;
		padding: 10px;
	}
	.changeset header {
		margin-bottom: 8px;
	}
	.action {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: #8a6a1f;
		background: #f5e9c9;
		border-radius: 4px;
		padding: 2px 7px;
	}
	.action.small {
		font-size: 9px;
		padding: 1px 5px;
	}
	.summary {
		margin: 6px 0 0;
		font-size: 13px;
		font-weight: 600;
		color: #4d473c;
		line-height: 1.35;
	}
	.using {
		margin: 4px 0 0;
		font-size: 11px;
		color: #8a8375;
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
		background: #fff;
		border: 1px solid #e2dccc;
		border-radius: 6px;
		padding: 8px;
		font-size: 12px;
	}
	.op.decision-accepted {
		border-color: #7fa876;
		background: #f4f8f2;
	}
	.op.decision-rejected {
		border-color: #d0c6be;
		background: #f5f2ef;
		opacity: 0.75;
	}
	.op-head {
		display: flex;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.op-kind {
		font-weight: 700;
		color: #5a523f;
		font-size: 11px;
	}
	.op-decision {
		font-size: 11px;
		color: #6d675c;
		font-weight: 600;
	}
	.decision-accepted .op-decision {
		color: #3d5537;
	}
	.decision-rejected .op-decision {
		color: #7a4a3a;
	}
	.op-label {
		font-weight: 600;
		color: #2c2921;
		line-height: 1.3;
	}
	.op-statement {
		margin: 4px 0 0;
		color: #4d473c;
		line-height: 1.4;
	}
	.rationale {
		margin: 6px 0 0;
		color: #6d675c;
		font-style: italic;
		line-height: 1.35;
	}
	.evidence {
		margin: 4px 0 0;
		font-size: 11px;
		color: #8a8375;
	}
	.edited-note {
		margin: 6px 0 0;
		font-size: 11px;
		color: #3d5537;
	}
	.original {
		margin-top: 4px;
		border-left: 2px solid #d5d0c4;
		padding-left: 8px;
		opacity: 0.8;
	}
	.blocked {
		margin: 6px 0 0;
		font-size: 11px;
		color: #8a3a2a;
		background: #f8ece8;
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
		font-size: 12px;
		border: 1px solid #d5d0c4;
		background: #fff;
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.accept {
		border-color: #7fa876;
		color: #3d5537;
		font-weight: 600;
	}
	button.reject {
		border-color: #c8a89a;
		color: #7a4a3a;
	}
	button.primary {
		background: #3b5bdb;
		border-color: #3b5bdb;
		color: #fff;
		font-weight: 600;
	}
	button.primary:disabled {
		background: #b5b0a4;
		border-color: #b5b0a4;
	}
	button.link {
		border: none;
		background: none;
		padding: 0;
		color: #3b5bdb;
		cursor: pointer;
		font-size: 11px;
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
		font-size: 12px;
		border: 1px solid #d5d0c4;
		border-radius: 6px;
		padding: 5px 7px;
		background: #fffdf8;
		width: 100%;
		box-sizing: border-box;
	}
	.rel-edit {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 11px;
		color: #8a8375;
	}
	.changeset footer {
		margin-top: 10px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.tally {
		font-size: 11px;
		color: #6d675c;
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
		font-size: 11px;
		color: #6d675c;
		display: flex;
		gap: 6px;
		align-items: baseline;
		background: #f2eee4;
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
		color: #5a523f;
	}
</style>
