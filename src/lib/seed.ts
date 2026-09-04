// Seed graph: this design's own topic, per the prototype plan.
// A handful of thoughts are in the working set; a couple sit outside it so
// Connect has something real to surface.

import type { Relation, Thought, WorkingSetItem } from './types';

const MARCH = new Date('2026-03-12T10:00:00Z').getTime();
const APRIL = new Date('2026-04-02T15:30:00Z').getTime();
const JUNE = new Date('2026-06-18T09:00:00Z').getTime();
const AUGUST = new Date('2026-08-21T14:00:00Z').getTime();

function seedThought(
	t: Omit<Thought, 'revisions' | 'updatedAt'> & { updatedAt?: number }
): Thought {
	const updatedAt = t.updatedAt ?? t.createdAt;
	return {
		...t,
		updatedAt,
		revisions: [
			{
				id: `${t.id}-r1`,
				title: t.title,
				statement: t.statement,
				status: t.status,
				actorType: 'human',
				createdAt: t.createdAt
			}
		]
	};
}

export const seedThoughts: Thought[] = [
	seedThought({
		id: 't-state-over-transcript',
		type: 'claim',
		status: 'believed',
		title: 'Thinking needs state, not transcript',
		statement:
			'The durable artifact of thinking with an agent should be shared thought state; the transcript is history and poorly represents the current shape of an idea.',
		createdAt: JUNE
	}),
	seedThought({
		id: 't-ratification',
		type: 'claim',
		status: 'developing',
		title: 'Ratification is where thinking happens',
		statement:
			'Agent changes should be staged until a person deliberately accepts them; the friction of review is not overhead but the mechanism by which the person keeps ownership of their beliefs.',
		createdAt: JUNE
	}),
	seedThought({
		id: 't-selection-context',
		type: 'concept',
		status: 'believed',
		title: 'Selection is context',
		statement:
			'The visible working set defines the agent context: the person includes or excludes thoughts directly instead of managing a hidden prompt or trusting opaque retrieval.',
		createdAt: AUGUST
	}),
	seedThought({
		id: 't-granularity',
		type: 'question',
		status: 'tentative',
		title: 'What makes one thought become two?',
		statement:
			'What is the right granularity for a thought? Too small and the workspace is a database; too big and it is a page-based note tool again.',
		createdAt: AUGUST
	}),
	seedThought({
		id: 't-typed-links',
		type: 'claim',
		status: 'tentative',
		title: 'Typed links survive if the agent maintains them',
		statement:
			'Typed relation ontologies historically collapse into "related" when humans must maintain them; they can survive if the person mostly just writes and the agent proposes and maintains the types.',
		createdAt: AUGUST
	}),
	// Outside the working set: older thoughts for Connect to surface.
	seedThought({
		id: 't-chat-compost',
		type: 'claim',
		status: 'contested',
		title: 'Chat is compost',
		statement:
			'Free-form conversation is where messy thinking starts; its useful results should be reified into structure while the transcript itself is left behind as provenance.',
		createdAt: MARCH
	}),
	seedThought({
		id: 't-outline-example',
		type: 'example',
		status: 'believed',
		title: 'Outliners as a cautionary example',
		statement:
			'Outliners show that a single enforced structure (the tree) makes capture feel like filing; structure imposed at capture time taxes thinking.',
		createdAt: APRIL
	})
];

export const seedRelations: Relation[] = [
	{
		id: 'r-seed-1',
		fromThoughtId: 't-ratification',
		toThoughtId: 't-state-over-transcript',
		type: 'depends_on',
		createdBy: 'human',
		createdAt: JUNE
	},
	{
		id: 'r-seed-2',
		fromThoughtId: 't-selection-context',
		toThoughtId: 't-state-over-transcript',
		type: 'supports',
		createdBy: 'human',
		createdAt: AUGUST
	},
	{
		id: 'r-seed-3',
		fromThoughtId: 't-outline-example',
		toThoughtId: 't-granularity',
		type: 'example_of',
		createdBy: 'human',
		createdAt: AUGUST
	}
];

export const seedWorkingSet: WorkingSetItem[] = [
	{ thoughtId: 't-state-over-transcript', x: 340, y: 120 },
	{ thoughtId: 't-ratification', x: 90, y: 320 },
	{ thoughtId: 't-selection-context', x: 620, y: 300 },
	{ thoughtId: 't-granularity', x: 380, y: 480 },
	{ thoughtId: 't-typed-links', x: 680, y: 60 }
];
