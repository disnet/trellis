// Deterministic proposals standing in for the model. Fixtures emit the same
// wire format as the live adapter and run through the same validation, so the
// full review flow stays demoable and testable with no network or variance
// (select with TRELLIS_AGENT=fixture). They assume the seeded graph; ops
// referencing seed thoughts are skipped when those thoughts are gone.

import type { AgentAction } from '$lib/types';
import type { AgentContext } from './context';
import type { AgentProposal, WireOperation } from './wire';

export interface FixtureDeps {
	thoughtExists: (id: string) => boolean;
}

function titleOf(ctx: AgentContext, id: string): string {
	return ctx.thoughts.find((t) => t.id === id)?.title ?? id;
}

function decompose(ctx: AgentContext, deps: FixtureDeps): AgentProposal {
	const scratchRef = ctx.scratch?.id ?? 'scratch';
	const operations: WireOperation[] = [
		{
			op: 'create_thought',
			client_ref: 'new-1',
			depends_on: [],
			evidence_refs: [scratchRef],
			thought: {
				type: 'claim',
				status: 'tentative',
				title: 'Provenance must separate authorship from acceptance',
				statement:
					'Recording who wrote a revision is not enough; the system must separately record who endorsed it, because accepting an agent proposal expresses agreement, not authorship.'
			},
			rationale: 'This is an independently challengeable claim buried in the middle of the input.'
		},
		{
			op: 'create_thought',
			client_ref: 'new-2',
			depends_on: [],
			evidence_refs: [scratchRef],
			thought: {
				type: 'claim',
				status: 'tentative',
				title: 'Structure-only interaction can carry a whole session',
				statement:
					'A person can complete a full thinking session through proposals and ratification alone, with no free-form conversational surface at all.'
			},
			rationale:
				'A strong, testable claim in the input — note it appears to contradict an older thought from March ("Chat is compost").'
		},
		{
			op: 'create_thought',
			client_ref: 'new-3',
			depends_on: [],
			evidence_refs: [scratchRef],
			thought: {
				type: 'question',
				status: 'tentative',
				title: 'Which decisions are safe to auto-accept?',
				statement:
					'If every proposal requires deliberate review, ratification may fatigue; which classes of change (e.g. link-type maintenance) could be accepted automatically without eroding ownership?'
			},
			rationale: 'The input raises this as an open question rather than asserting an answer.'
		}
	];
	if (deps.thoughtExists('t-chat-compost')) {
		operations.push({
			op: 'add_relation',
			client_ref: 'rel-1',
			depends_on: ['new-2'],
			evidence_refs: ['new-2', 't-chat-compost'],
			from: 'new-2',
			to: 't-chat-compost',
			relation_type: 'contradicts',
			rationale:
				'The March thought argues free-form chat is where thinking starts; this new claim says it is unnecessary. Reifying the tension keeps it visible.'
		});
	}
	return {
		summary:
			'Proposed 2 claims and 1 question from scratch, plus 1 relation flagging a contradiction with an older thought.',
		operations
	};
}

function challenge(ctx: AgentContext): AgentProposal {
	const target = ctx.selectedIds[0];
	return {
		summary: `Proposed 1 objection and 2 relations challenging “${titleOf(ctx, target)}”.`,
		operations: [
			{
				op: 'create_thought',
				client_ref: 'obj-1',
				depends_on: [],
				evidence_refs: [target],
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Review friction may select for shallow acceptance',
					statement:
						'When every change demands a decision, people under time pressure tend to develop a reflexive accept habit — the ritual of ratification can persist while the understanding it was meant to produce disappears.'
				},
				rationale: `Strongest objection to “${titleOf(ctx, target)}”: the mechanism can hollow out while appearing to work.`
			},
			{
				op: 'add_relation',
				client_ref: 'obj-rel-1',
				depends_on: ['obj-1'],
				evidence_refs: ['obj-1', target],
				from: 'obj-1',
				to: target,
				relation_type: 'contradicts',
				rationale: 'Links the objection to the claim it challenges.'
			},
			{
				op: 'add_relation',
				client_ref: 'obj-rel-2',
				depends_on: ['obj-1'],
				evidence_refs: ['obj-1', target],
				from: target,
				to: 'obj-1',
				relation_type: 'depends_on',
				rationale:
					'The claim implicitly assumes review stays deliberate; making the assumption explicit lets it be examined.'
			}
		]
	};
}

function connect(ctx: AgentContext, deps: FixtureDeps): AgentProposal {
	const target = ctx.selectedIds[0];
	const operations: WireOperation[] = [];
	if (deps.thoughtExists('t-chat-compost')) {
		operations.push({
			op: 'add_relation',
			client_ref: 'conn-1',
			depends_on: [],
			evidence_refs: [target, 't-chat-compost'],
			from: 't-chat-compost',
			to: target,
			relation_type: 'related_to',
			rationale: `An older thought from March (“Chat is compost”) bears directly on “${titleOf(ctx, target)}” — surfacing it rather than leaving it buried.`
		});
	}
	if (deps.thoughtExists('t-outline-example')) {
		operations.push({
			op: 'add_relation',
			client_ref: 'conn-2',
			depends_on: [],
			evidence_refs: [target, 't-outline-example'],
			from: 't-outline-example',
			to: target,
			relation_type: 'example_of',
			rationale:
				'The April note on outliners is a concrete instance of the pattern this thought describes.'
		});
	}
	return {
		summary: `Found ${operations.length} relevant existing thoughts; proposed ${operations.length} typed relations to “${titleOf(ctx, target)}”.`,
		operations
	};
}

function develop(ctx: AgentContext): AgentProposal {
	const target = ctx.selectedIds[0];
	return {
		summary: `Proposed 1 extension, 1 prediction, and 2 relations developing “${titleOf(ctx, target)}”.`,
		operations: [
			{
				op: 'create_thought',
				client_ref: 'dev-1',
				depends_on: [],
				evidence_refs: [target],
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Undo must operate at change-set granularity',
					statement:
						'If ratification is the unit of deliberate decision, then reversal must be too: undo should restore the state before the last applied change set, not before the last keystroke.'
				},
				rationale: `A concrete implication of “${titleOf(ctx, target)}” for the interaction design.`
			},
			{
				op: 'add_relation',
				client_ref: 'dev-rel-1',
				depends_on: ['dev-1'],
				evidence_refs: ['dev-1', target],
				from: 'dev-1',
				to: target,
				relation_type: 'supports',
				rationale: 'The implication, if it holds, reinforces the parent claim.'
			},
			{
				op: 'create_thought',
				client_ref: 'dev-2',
				depends_on: [],
				evidence_refs: [target],
				thought: {
					type: 'prediction',
					status: 'tentative',
					title: 'Most ratification sessions will use partial accepts',
					statement:
						'Within a month of real use, the majority of applied change sets will have at least one rejected or edited operation — if everything is always accepted wholesale, ratification is theater.',
					confidence: { probability: 0.7, resolve_by: '2026-10-04' }
				},
				rationale: `A testable expectation implied by “${titleOf(ctx, target)}”: it stakes out what real engagement with review would look like.`
			},
			{
				op: 'add_relation',
				client_ref: 'dev-rel-2',
				depends_on: ['dev-2'],
				evidence_refs: ['dev-2', target],
				from: 'dev-2',
				to: target,
				relation_type: 'depends_on',
				rationale: 'The prediction only makes sense if the parent thought holds.'
			}
		]
	};
}

export function runFixture(
	action: AgentAction,
	ctx: AgentContext,
	deps: FixtureDeps
): AgentProposal {
	switch (action) {
		case 'decompose':
			return decompose(ctx, deps);
		case 'challenge':
			return challenge(ctx);
		case 'connect':
			return connect(ctx, deps);
		case 'develop':
			return develop(ctx);
	}
}
