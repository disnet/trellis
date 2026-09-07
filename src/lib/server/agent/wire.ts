// The agent contract's wire format (docs/design.md "Agent contract"): what the
// model — or a deterministic fixture standing in for it — returns. Snake_case
// mirrors the design doc's JSON; the store maps it to internal types only after
// validation. The zod schema doubles as the structured-output format sent to
// the model, so generation is constrained to this shape.

import { z } from 'zod';
import type { Confidence } from '$lib/types';

export const THOUGHT_TYPES = [
	'claim',
	'question',
	'concept',
	'example',
	'prediction',
	'evidence'
] as const;
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
export const SOURCE_LIMIT = 500;
export const MAX_OPERATIONS = 20;

const confidenceSchema = z.object({
	probability: z
		.number()
		.min(0)
		.max(1)
		.nullish()
		.describe('Binary predictions: probability the statement resolves true, 0–1.'),
	low: z
		.number()
		.nullish()
		.describe('Quantitative predictions: lower bound of the confidence interval.'),
	high: z.number().nullish().describe('Upper bound of the confidence interval.'),
	unit: z.string().nullish().describe('Unit for low/high, e.g. "ms" or "users".'),
	resolve_by: z
		.string()
		.nullish()
		.describe('ISO date (YYYY-MM-DD) when the prediction should be resolvable, if one exists.')
});

const thoughtFields = z.object({
	type: z.enum(THOUGHT_TYPES),
	status: z.enum(THOUGHT_STATUSES),
	title: z.string().describe(`One-line resolution, at most ${TITLE_LIMIT} characters.`),
	statement: z.string().describe(
		`Standalone development of one independently challengeable idea: state it, explain the mechanism or reasoning where relevant, and preserve meaningful conditions or qualifications. Include a concrete example when helpful. Substantive claims typically need 3–6 sentences; simple questions may need less. Ground details in supplied context or consulted sources, and label hypotheses or illustrative examples. Do not invent facts or pad to a sentence count. Put the substantive explanation here; the rationale explains why the operation belongs in the graph. At most ${STATEMENT_LIMIT} characters.`
	),
	confidence: confidenceSchema
		.nullish()
		.describe(
			'Only for type "prediction": a probability for a binary outcome, or a low/high interval (with unit) for a quantitative one.'
		),
	source: z
		.string()
		.nullish()
		.describe(
			`Only for type "evidence": where it comes from — citation, URL, or dataset. At most ${SOURCE_LIMIT} characters.`
		)
});

export type WireConfidence = z.infer<typeof confidenceSchema>;

/** Wire confidence → internal camelCase form, dropping nulls; undefined when empty. */
export function wireConfidenceToInternal(
	c: WireConfidence | null | undefined
): Confidence | undefined {
	if (!c) return undefined;
	const out: Confidence = {};
	if (c.probability != null) out.probability = c.probability;
	if (c.low != null) out.low = c.low;
	if (c.high != null) out.high = c.high;
	if (c.unit != null) out.unit = c.unit;
	if (c.resolve_by != null) out.resolveBy = c.resolve_by;
	return Object.keys(out).length > 0 ? out : undefined;
}

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

// OpenAI strict schemas require every property; null means an absent (create)
// or unchanged (revise) field.
const strictConfidence = z.object({
	probability: z.number().min(0).max(1).nullable(),
	low: z.number().nullable(),
	high: z.number().nullable(),
	unit: z.string().nullable(),
	resolve_by: z.string().nullable()
});
const strictExtras = {
	confidence: strictConfidence
		.nullable()
		.describe('Only for type "prediction"; null otherwise.'),
	source: z.string().nullable().describe('Only for type "evidence"; null otherwise.')
};
export const codexProposalSchema = proposalSchema.extend({
	operations: z.array(z.union([
		createThought.extend({ thought: z.object({
			type: thoughtFields.shape.type,
			status: thoughtFields.shape.status,
			title: thoughtFields.shape.title,
			statement: thoughtFields.shape.statement,
			...strictExtras
		}) }),
		reviseThought.extend({ thought: z.object({
			type: thoughtFields.shape.type.nullable(),
			status: thoughtFields.shape.status.nullable(),
			title: thoughtFields.shape.title.nullable(),
			statement: thoughtFields.shape.statement.nullable(),
			...strictExtras
		}) }),
		addRelation
	]))
});
