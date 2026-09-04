// Deterministic change-set fixtures standing in for the model in Phase 0.
// Each fixture is a pure function of the invocation (action + selection + scratch),
// so the full review flow is demoable and testable with no network or variance.

import type { AgentAction, ChangeSet, ProposedOperation } from './types';

export interface FixtureContext {
	selectedIds: string[];
	scratchId?: string;
	/** Returns a fresh unique id with the given prefix. */
	nextId: (prefix: string) => string;
	now: number;
	thoughtTitle: (id: string) => string;
	thoughtExists: (id: string) => boolean;
}

type OpSeed = Omit<ProposedOperation, 'id' | 'sequence' | 'decision' | 'decidedAt'>;

function build(
	ctx: FixtureContext,
	action: AgentAction,
	summary: string,
	seeds: OpSeed[]
): ChangeSet {
	return {
		id: ctx.nextId('cs'),
		action,
		status: 'pending',
		summary,
		invokedOn: ctx.selectedIds,
		scratchId: ctx.scratchId,
		createdAt: ctx.now,
		operations: seeds.map((seed, i) => ({
			...seed,
			id: ctx.nextId('op'),
			sequence: i,
			decision: 'pending'
		}))
	};
}

function decompose(ctx: FixtureContext): ChangeSet {
	const scratchRef = ctx.scratchId ?? 'scratch';
	const seeds: OpSeed[] = [
		{
			clientRef: 'new-1',
			dependsOn: [],
			evidenceRefs: [scratchRef],
			payload: {
				op: 'create_thought',
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Provenance must separate authorship from acceptance',
					statement:
						'Recording who wrote a revision is not enough; the system must separately record who endorsed it, because accepting an agent proposal expresses agreement, not authorship.'
				}
			},
			rationale: 'This is an independently challengeable claim buried in the middle of the input.'
		},
		{
			clientRef: 'new-2',
			dependsOn: [],
			evidenceRefs: [scratchRef],
			payload: {
				op: 'create_thought',
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Structure-only interaction can carry a whole session',
					statement:
						'A person can complete a full thinking session through proposals and ratification alone, with no free-form conversational surface at all.'
				}
			},
			rationale:
				'A strong, testable claim in the input — note it appears to contradict an older thought from March ("Chat is compost").'
		},
		{
			clientRef: 'new-3',
			dependsOn: [],
			evidenceRefs: [scratchRef],
			payload: {
				op: 'create_thought',
				thought: {
					type: 'question',
					status: 'tentative',
					title: 'Which decisions are safe to auto-accept?',
					statement:
						'If every proposal requires deliberate review, ratification may fatigue; which classes of change (e.g. link-type maintenance) could be accepted automatically without eroding ownership?'
				}
			},
			rationale: 'The input raises this as an open question rather than asserting an answer.'
		},
		{
			clientRef: 'rel-1',
			dependsOn: ['new-2'],
			evidenceRefs: ['new-2', 't-chat-compost'],
			payload: {
				op: 'add_relation',
				from: 'new-2',
				to: 't-chat-compost',
				relationType: 'contradicts'
			},
			rationale:
				'The March thought argues free-form chat is where thinking starts; this new claim says it is unnecessary. Reifying the tension keeps it visible.'
		}
	];
	return build(
		ctx,
		'decompose',
		'Proposed 2 claims and 1 question from scratch, plus 1 relation flagging a contradiction with an older thought.',
		seeds
	);
}

function challenge(ctx: FixtureContext): ChangeSet {
	const target = ctx.selectedIds[0];
	const seeds: OpSeed[] = [
		{
			clientRef: 'obj-1',
			dependsOn: [],
			evidenceRefs: [target],
			payload: {
				op: 'create_thought',
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Review friction may select for shallow acceptance',
					statement:
						'When every change demands a decision, people under time pressure tend to develop a reflexive accept habit — the ritual of ratification can persist while the understanding it was meant to produce disappears.'
				}
			},
			rationale: `Strongest objection to “${ctx.thoughtTitle(target)}”: the mechanism can hollow out while appearing to work.`
		},
		{
			clientRef: 'obj-rel-1',
			dependsOn: ['obj-1'],
			evidenceRefs: ['obj-1', target],
			payload: {
				op: 'add_relation',
				from: 'obj-1',
				to: target,
				relationType: 'contradicts'
			},
			rationale: 'Links the objection to the claim it challenges.'
		},
		{
			clientRef: 'obj-rel-2',
			dependsOn: ['obj-1'],
			evidenceRefs: ['obj-1', target],
			payload: {
				op: 'add_relation',
				from: target,
				to: 'obj-1',
				relationType: 'depends_on'
			},
			rationale:
				'The claim implicitly assumes review stays deliberate; making the assumption explicit lets it be examined.'
		}
	];
	return build(
		ctx,
		'challenge',
		`Proposed 1 objection and 2 relations challenging “${ctx.thoughtTitle(target)}”.`,
		seeds
	);
}

function connect(ctx: FixtureContext): ChangeSet {
	const target = ctx.selectedIds[0];
	const seeds: OpSeed[] = [
		{
			clientRef: 'conn-1',
			dependsOn: [],
			evidenceRefs: [target, 't-chat-compost'],
			payload: {
				op: 'add_relation',
				from: 't-chat-compost',
				to: target,
				relationType: 'related_to'
			},
			rationale: `An older thought from March (“Chat is compost”) bears directly on “${ctx.thoughtTitle(target)}” — surfacing it rather than leaving it buried.`
		},
		{
			clientRef: 'conn-2',
			dependsOn: [],
			evidenceRefs: [target, 't-outline-example'],
			payload: {
				op: 'add_relation',
				from: 't-outline-example',
				to: target,
				relationType: 'example_of'
			},
			rationale:
				'The April note on outliners is a concrete instance of the pattern this thought describes.'
		}
	];
	return build(
		ctx,
		'connect',
		`Found 2 relevant existing thoughts; proposed 2 typed relations to “${ctx.thoughtTitle(target)}”.`,
		seeds
	);
}

function develop(ctx: FixtureContext): ChangeSet {
	const target = ctx.selectedIds[0];
	const seeds: OpSeed[] = [
		{
			clientRef: 'dev-1',
			dependsOn: [],
			evidenceRefs: [target],
			payload: {
				op: 'create_thought',
				thought: {
					type: 'claim',
					status: 'tentative',
					title: 'Undo must operate at change-set granularity',
					statement:
						'If ratification is the unit of deliberate decision, then reversal must be too: undo should restore the state before the last applied change set, not before the last keystroke.'
				}
			},
			rationale: `A concrete implication of “${ctx.thoughtTitle(target)}” for the interaction design.`
		},
		{
			clientRef: 'dev-rel-1',
			dependsOn: ['dev-1'],
			evidenceRefs: ['dev-1', target],
			payload: {
				op: 'add_relation',
				from: 'dev-1',
				to: target,
				relationType: 'supports'
			},
			rationale: 'The implication, if it holds, reinforces the parent claim.'
		}
	];
	return build(
		ctx,
		'develop',
		`Proposed 1 extension and 1 relation developing “${ctx.thoughtTitle(target)}”.`,
		seeds
	);
}

export function runFixture(action: AgentAction, ctx: FixtureContext): ChangeSet {
	switch (action) {
		case 'decompose':
			return decompose(ctx);
		case 'challenge':
			return challenge(ctx);
		case 'connect':
			return connect(ctx);
		case 'develop':
			return develop(ctx);
	}
}
