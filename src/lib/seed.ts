// First-run onboarding graph: the thoughts themselves walk a new user through
// Trellis's concepts (thoughts, typed relations, agent operations, the
// proposal tray, Scratch, Discuss, Prose), and the graph demonstrates the
// data model it describes — every type, several statuses, and most relation
// types appear. Two older thoughts sit off to the left so Connect has
// something real to surface from across the graph; the offline fixtures
// reference them by id, so keep `t-chat-compost` and `t-outline-example`
// stable (or update src/lib/server/agent/fixtures.ts with them).

import type { CanvasPosition, Relation, Thought } from './types';

const MARCH = new Date('2026-03-12T10:00:00Z').getTime();
const APRIL = new Date('2026-04-02T15:30:00Z').getTime();
const NOW = new Date('2026-09-01T09:00:00Z').getTime();

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
				...(t.confidence ? { confidence: t.confidence } : {}),
				actorType: 'human',
				createdAt: t.createdAt
			}
		]
	};
}

export const seedThoughts: Thought[] = [
	seedThought({
		id: 't-welcome',
		type: 'concept',
		status: 'believed',
		title: 'Start here: what Trellis is',
		statement:
			'Trellis is a workspace where you and an AI agent develop a graph of thoughts together. Each card holds one idea; the lines between cards are typed relations. The agent never edits the graph directly — it proposes changes, and you accept, edit, or reject each one. Drag these cards around, then follow them roughly left to right, top to bottom.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-anatomy',
		type: 'concept',
		status: 'believed',
		title: 'A thought is small, typed, and has a status',
		statement:
			'Every card has a type — claim, question, concept, example, prediction, or evidence — and a status that tracks how settled it is, from tentative through developing to believed (or contested, or retired). Click a card to open the Inspector and see its statement, relations, and full revision history. Try revising this statement, then check its history.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-relations',
		type: 'concept',
		status: 'believed',
		title: 'Relations say how thoughts connect',
		statement:
			'Edges are typed: supports, contradicts, depends_on, example_of, supersedes, related_to. This card depends on “A thought is small, typed, and has a status” — the edge between them is a depends_on relation you can see on the canvas right now. Add relations yourself in the Inspector, or let the agent propose them.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-agent-ops',
		type: 'concept',
		status: 'believed',
		title: 'Four agent operations work on your selection',
		statement:
			'Select one or more cards and invoke an operation: Develop extends an idea, Challenge argues against it, Connect finds related thoughts across the whole graph (including the older ones sitting off to the left of this tour), and Decompose breaks messy text into thoughts. What you select is what the agent sees — context is never hidden from you.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-ratify',
		type: 'claim',
		status: 'believed',
		title: 'Nothing changes until you accept it',
		statement:
			'Agent results arrive as proposals: dashed cards and edges at the rim of the canvas, listed in the tray. Accept, edit-then-accept, or reject each one — partially accepting a change set is fine, and the last applied change set can be undone. The graph stays yours.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-try-challenge',
		type: 'question',
		status: 'tentative',
		title: 'Try it: what is the strongest objection to ratification?',
		statement:
			'Select this card and press Challenge. The agent will propose an objection and link it here with a contradicts relation. Review the proposal in the tray: accept it, edit it first, or reject it. Then try Develop or Connect on any card that interests you.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-scratch',
		type: 'concept',
		status: 'believed',
		title: 'Scratch turns messy text into thoughts',
		statement:
			'Open Scratch, paste a paragraph of rough notes, and press Decompose. The agent proposes the distinct claims and questions it finds, each traceable back to your text. Capture stays messy; structure arrives later, as proposals you review.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-discuss-prose',
		type: 'concept',
		status: 'believed',
		title: 'Discuss a thought, or read a group as prose',
		statement:
			'Open Discuss in the Inspector to talk through a thought with the agent without changing the graph, then choose “Propose thoughts” to turn the conversation into a reviewable change set. Switch to the Prose view to read a group of thoughts as a continuous overview, paper, blog post, or polemic, with references back into the graph.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-models',
		type: 'concept',
		status: 'believed',
		title: 'Choose who the agent is',
		statement:
			'The model switcher beside the agent operations selects Anthropic API, Claude Code, Codex, or offline fixtures. Fixtures are canned, deterministic responses — good for exploring the review flow in this tour before connecting a real model. When you are oriented, make a fresh graph from the graph menu and start on something of your own.',
		createdAt: NOW
	}),
	seedThought({
		id: 't-prediction-demo',
		type: 'prediction',
		status: 'tentative',
		title: 'You will rearrange these cards',
		statement:
			'Predictions carry calibrated confidence that gets revised as your beliefs update, leaving a record of your calibration. This one says there is a 90% chance you drag at least one of these cards somewhere better within your first session.',
		confidence: { probability: 0.9 },
		createdAt: NOW
	}),
	// Outside the tour: older thoughts for Connect to surface (the offline
	// fixtures reference these ids).
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
		fromThoughtId: 't-relations',
		toThoughtId: 't-anatomy',
		type: 'depends_on',
		createdBy: 'human',
		createdAt: NOW
	},
	{
		id: 'r-seed-2',
		fromThoughtId: 't-ratify',
		toThoughtId: 't-agent-ops',
		type: 'depends_on',
		createdBy: 'human',
		createdAt: NOW
	},
	{
		id: 'r-seed-3',
		fromThoughtId: 't-try-challenge',
		toThoughtId: 't-ratify',
		type: 'related_to',
		createdBy: 'human',
		createdAt: NOW
	},
	{
		id: 'r-seed-4',
		fromThoughtId: 't-prediction-demo',
		toThoughtId: 't-anatomy',
		type: 'example_of',
		createdBy: 'human',
		createdAt: NOW
	},
	{
		id: 'r-seed-5',
		fromThoughtId: 't-outline-example',
		toThoughtId: 't-scratch',
		type: 'supports',
		createdBy: 'human',
		createdAt: NOW
	}
];

// The tour reads in three loose rows around the origin; the prediction hangs
// off to the right, and the two older thoughts live far left, the way an
// older line of thinking drifts to the edge of a desk.
export const seedPositions: CanvasPosition[] = [
	{ thoughtId: 't-welcome', x: 60, y: 40 },
	{ thoughtId: 't-anatomy', x: 390, y: 20 },
	{ thoughtId: 't-relations', x: 720, y: 60 },
	{ thoughtId: 't-agent-ops', x: 100, y: 270 },
	{ thoughtId: 't-ratify', x: 430, y: 250 },
	{ thoughtId: 't-try-challenge', x: 760, y: 300 },
	{ thoughtId: 't-scratch', x: 70, y: 500 },
	{ thoughtId: 't-discuss-prose', x: 400, y: 490 },
	{ thoughtId: 't-models', x: 730, y: 530 },
	{ thoughtId: 't-prediction-demo', x: 1050, y: 120 },
	{ thoughtId: 't-chat-compost', x: -420, y: 160 },
	{ thoughtId: 't-outline-example', x: -380, y: 430 }
];
