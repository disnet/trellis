// The agent contract's wire format (docs/design.md "Agent contract"): what the
// model — or a deterministic fixture standing in for it — returns. Snake_case
// mirrors the design doc's JSON; the store maps it to internal types only after
// validation. The zod schema doubles as the structured-output format sent to
// the model, so generation is constrained to this shape.

import { z } from 'zod';

export const THOUGHT_TYPES = ['claim', 'question', 'concept', 'example'] as const;
export const THOUGHT_STATUSES = [
	'tentative',
	'developing',
	'believed',
	'contested',
	'retired'
] as const;
export const RELATION_TYPES = [
	'supports',
	'contradicts',
	'depends_on',
	'example_of',
	'supersedes',
	'related_to'
] as const;

export const TITLE_LIMIT = 300;
export const STATEMENT_LIMIT = 4000;
export const SUMMARY_LIMIT = 500;
export const RATIONALE_LIMIT = 1000;
export const MAX_OPERATIONS = 20;

const thoughtFields = z.object({
	type: z.enum(THOUGHT_TYPES),
	status: z.enum(THOUGHT_STATUSES),
	title: z.string().describe(`One-line resolution, at most ${TITLE_LIMIT} characters.`),
	statement: z.string().describe(`Full resolution, at most ${STATEMENT_LIMIT} characters.`)
});

const opBase = {
	client_ref: z
		.string()
		.describe('Short unique ref for this operation within the change set, e.g. "new-1".'),
	depends_on: z
		.array(z.string())
		.describe('client_refs of operations this one cannot be accepted without.'),
	evidence_refs: z
		.array(z.string())
		.describe('Thought ids, the scratch id, or client_refs this operation drew on.'),
	rationale: z.string().describe('One or two sentences: why this operation, tied to its evidence.')
};

const createThought = z.object({
	op: z.literal('create_thought'),
	...opBase,
	thought: thoughtFields
});

const reviseThought = z.object({
	op: z.literal('revise_thought'),
	...opBase,
	thought_id: z.string().describe('Id of the existing thought to revise.'),
	thought: thoughtFields
		.partial()
		.describe('Only the fields that change; omitted fields keep their current value.')
});

const addRelation = z.object({
	op: z.literal('add_relation'),
	...opBase,
	from: z
		.string()
		.describe('Existing thought id, or the client_ref of a create_thought op in this change set.'),
	to: z
		.string()
		.describe('Existing thought id, or the client_ref of a create_thought op in this change set.'),
	relation_type: z.enum(RELATION_TYPES)
});

export const wireOperationSchema = z.discriminatedUnion('op', [
	createThought,
	reviseThought,
	addRelation
]);

export const proposalSchema = z.object({
	summary: z
		.string()
		.describe('Impact first, one sentence, e.g. "Proposed two claims and one open question."'),
	operations: z.array(wireOperationSchema)
});

export type WireCreateThought = z.infer<typeof createThought>;
export type WireReviseThought = z.infer<typeof reviseThought>;
export type WireAddRelation = z.infer<typeof addRelation>;
export type WireOperation = z.infer<typeof wireOperationSchema>;
export type AgentProposal = z.infer<typeof proposalSchema>;
