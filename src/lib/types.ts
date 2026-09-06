// Core domain types for Trellis. Mirrors docs/design.md "Data model" and
// "Agent contract". Shared between the client store and the server, which
// persists everything in SQLite (Phase 1).

export type ThoughtType = 'claim' | 'question' | 'concept' | 'example' | 'prediction' | 'evidence';

/** Calibrated confidence attached to a prediction: a probability for a binary
 *  outcome, or a low/high interval (in `unit`) for a quantitative one. */
export interface Confidence {
	/** Probability the prediction resolves true, 0–1. */
	probability?: number;
	/** Interval bounds for a quantitative prediction, in `unit`. */
	low?: number;
	high?: number;
	unit?: string;
	/** ISO date (YYYY-MM-DD) when the prediction should be resolvable. */
	resolveBy?: string;
}

/** Shape-check a confidence value (client edits arrive as arbitrary JSON). */
export function validateConfidence(c: unknown): string | null {
	if (typeof c !== 'object' || c === null || Array.isArray(c)) return 'Invalid confidence.';
	const o = c as Record<string, unknown>;
	for (const k of Object.keys(o)) {
		if (!['probability', 'low', 'high', 'unit', 'resolveBy'].includes(k))
			return `Unknown confidence field "${k}".`;
	}
	if (
		o.probability !== undefined &&
		(typeof o.probability !== 'number' ||
			!Number.isFinite(o.probability) ||
			o.probability < 0 ||
			o.probability > 1)
	)
		return 'Confidence probability must be a number between 0 and 1.';
	for (const k of ['low', 'high'] as const) {
		if (o[k] !== undefined && (typeof o[k] !== 'number' || !Number.isFinite(o[k])))
			return `Confidence ${k} must be a number.`;
	}
	if ((o.low === undefined) !== (o.high === undefined))
		return 'A confidence interval needs both low and high.';
	if (typeof o.low === 'number' && typeof o.high === 'number' && o.low > o.high)
		return 'Confidence low must not exceed high.';
	if (o.unit !== undefined && typeof o.unit !== 'string') return 'Confidence unit must be a string.';
	if (o.resolveBy !== undefined && typeof o.resolveBy !== 'string')
		return 'Confidence resolveBy must be a string.';
	if (o.probability === undefined && o.low === undefined)
		return 'Confidence needs a probability or a low/high interval.';
	return null;
}

/** "70%" / "40–80 ms" / "70%, by 2027-01-01" — for cards, the outline, and prompts. */
export function formatConfidence(c: Confidence): string {
	const parts: string[] = [];
	if (c.probability !== undefined) parts.push(`${Math.round(c.probability * 100)}%`);
	if (c.low !== undefined && c.high !== undefined)
		parts.push(`${c.low}–${c.high}${c.unit ? ` ${c.unit}` : ''}`);
	if (c.resolveBy) parts.push(`by ${c.resolveBy}`);
	return parts.join(', ');
}

export type ThoughtStatus = 'tentative' | 'developing' | 'believed' | 'contested' | 'retired';

export type RelationType =
	| 'supports'
	| 'contradicts'
	| 'depends_on'
	| 'example_of'
	| 'supersedes'
	| 'related_to';

export type ActorType = 'human' | 'agent';

export interface ThoughtRevision {
	id: string;
	title: string;
	statement: string;
	status: ThoughtStatus;
	/** Predictions only — revised as beliefs update, so history shows calibration. */
	confidence?: Confidence;
	/** Evidence: where it comes from — citation, URL, or dataset. */
	source?: string;
	actorType: ActorType;
	/** Change set that produced this revision, if agent-proposed. */
	sourceChangeSetId?: string;
	/** Set when the revision text was human-edited from an agent proposal. */
	editedFromProposal?: boolean;
	createdAt: number;
}

export interface Thought {
	id: string;
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	/** Predictions only. */
	confidence?: Confidence;
	/** Evidence: where it comes from — citation, URL, or dataset. */
	source?: string;
	createdAt: number;
	updatedAt: number;
	/** Oldest first; the last entry always matches the current fields. */
	revisions: ThoughtRevision[];
}

export interface Relation {
	id: string;
	fromThoughtId: string;
	toThoughtId: string;
	type: RelationType;
	createdBy: ActorType;
	sourceChangeSetId?: string;
	createdAt: number;
}

/** One thought's place on the graph's canvas. The canvas shows the whole
 *  graph, so there is exactly one position per thought per graph — spatial
 *  memory ("the pricing argument lives upper-left") is durable. Still a
 *  projection: coordinates live beside the graph, never on thoughts. */
export interface CanvasPosition {
	thoughtId: string;
	x: number;
	y: number;
}

/** A named, fully isolated knowledge base (Phase 5). Thoughts, relations,
 *  working sets, scratch, and change sets never cross a graph boundary. */
export interface GraphInfo {
	id: string;
	name: string;
	createdAt: number;
}

/** A named working set (shown in the UI as a "group"): a lens over the
 *  whole-graph canvas. Only membership — never knowledge, and never layout
 *  (positions belong to the graph canvas). */
export interface WorkingSetInfo {
	id: string;
	name: string;
	createdAt: number;
	/** Number of thoughts in the set, for tab display. */
	size: number;
	/** Member thought ids — lets the canvas color grouped thoughts without
	 *  switching lenses. */
	members: string[];
}

/** A free-text box living directly on the graph's canvas: the default thing
 *  you create there. Not knowledge — an annotation that can later be converted
 *  into a thought or decomposed into proposals. */
export interface CanvasNote {
	id: string;
	body: string;
	x: number;
	y: number;
	/** User-set width; absent means the default. */
	w?: number;
	/** User-set height — held exactly, overflowing text scrolls inside; absent
	 *  fits the content. */
	h?: number;
	createdAt: number;
}

export interface ScratchNote {
	id: string;
	body: string;
	createdAt: number;
	distilledChangeSetId?: string;
}

// --- Agent contract (fixture-driven in Phase 0) ---

export type AgentAction = 'decompose' | 'develop' | 'challenge' | 'connect';

/** Display names for the agent operations — the tray and the canvas name them
 *  identically, so a change set reads the same wherever it is reviewed. */
export const ACTION_NAMES: Record<AgentAction, string> = {
	decompose: 'Decompose',
	develop: 'Develop',
	challenge: 'Challenge',
	connect: 'Connect'
};

export interface ProposedThoughtFields {
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
	/** Predictions only. */
	confidence?: Confidence;
	/** Evidence only: citation, URL, or dataset. */
	source?: string;
}

export interface CreateThoughtPayload {
	op: 'create_thought';
	thought: ProposedThoughtFields;
}

export interface ReviseThoughtPayload {
	op: 'revise_thought';
	thoughtId: string;
	thought: Partial<ProposedThoughtFields>;
}

export interface AddRelationPayload {
	op: 'add_relation';
	/** Either a client_ref of a create_thought op in the same change set, or an existing thought id. */
	from: string;
	to: string;
	relationType: RelationType;
}

export type OperationPayload = CreateThoughtPayload | ReviseThoughtPayload | AddRelationPayload;

export type OperationDecision = 'pending' | 'accepted' | 'rejected';

export interface ProposedOperation {
	id: string;
	clientRef: string;
	sequence: number;
	/** clientRefs of operations this one cannot be accepted without. */
	dependsOn: string[];
	/** Thought ids / scratch ids / clientRefs the agent drew on. */
	evidenceRefs: string[];
	payload: OperationPayload;
	/** Human edit of the payload; the original payload is preserved untouched. */
	editedPayload?: OperationPayload;
	rationale: string;
	decision: OperationDecision;
	decidedAt?: number;
}

export type ChangeSetStatus = 'pending' | 'applied' | 'partially_applied' | 'rejected';

export interface ChangeSet {
	id: string;
	action: AgentAction;
	status: ChangeSetStatus;
	summary: string;
	/** Thought ids the operation was invoked on (the selection). */
	invokedOn: string[];
	/** Thought ids pulled into context by graph-wide relevance search (Connect /
	 *  Challenge). Disclosed so retrieval is never invisible. */
	consulted: string[];
	/** Scratch note id, when invoked from scratch. */
	scratchId?: string;
	/** Canvas note id, when decompose was invoked on a note. Staging anchors
	 *  the proposed cards beside that note. */
	noteId?: string;
	operations: ProposedOperation[];
	createdAt: number;
	/** Who ratified the change set — distinct from who authored the operations. */
	appliedBy?: ActorType;
	appliedAt?: number;
}

// --- Server payloads (Phase 1) ---

/** The canonical persisted state of the *active graph*, as served by
 *  GET /api/state and returned by mutations. Only the graph list itself spans
 *  graphs; everything else is scoped to activeGraphId. */
export interface WorkspaceState {
	/** All graphs, oldest first. */
	graphs: GraphInfo[];
	activeGraphId: string;
	thoughts: Record<string, Thought>;
	relations: Relation[];
	/** Canvas layout of the whole graph: one position per thought. */
	canvas: CanvasPosition[];
	/** Free-text boxes on the canvas, oldest first. */
	notes: CanvasNote[];
	/** All working sets (lenses), oldest first. */
	workingSets: WorkingSetInfo[];
	/** The active lens, or null for the base state: the whole graph, no lens. */
	activeWorkingSetId: string | null;
	/** Member thought ids of the active working set; empty when none is active. */
	workingSet: string[];
	/** Pinned thoughts of the active graph, oldest pin first (Phase 6).
	 *  Attention state, not knowledge — pinning never mutates the durable graph. */
	pinnedThoughtIds: string[];
	scratchNotes: ScratchNote[];
	pendingChangeSets: ChangeSet[];
	decidedChangeSets: ChangeSet[];
	/** Summary of the last applied change set, when it can still be undone. */
	undoLabel: string | null;
}

export const PROSE_GUIDANCE_LIMIT = 2000;
export type ProseDraftSummary = Pick<ProseTreatment, 'id' | 'workingSetId' | 'style' | 'title' | 'generatedAt'>;

export type ProseStyle = 'overview' | 'paper' | 'blog' | 'polemic';
/** A generated, group-scoped reading of a set of thoughts. The body is plain
 * text with [[thought-id]] or [[description|thought-id]] references; it is never trusted HTML. */
export interface ProseTreatment {
	id: string;
	graphId: string;
	workingSetId: string;
	style: ProseStyle;
	title: string;
	body: string;
	model: string;
	guidance: string;
	generatedAt: number;
	sourceFingerprint: string;
	sourceThoughtIds: string[];
	stale: boolean;
}

export interface ReentryThoughtRef {
	id: string;
	title: string;
	type: ThoughtType;
	status: ThoughtStatus;
}

/** Structural summary shown on re-entry instead of a replay of activity. */
export interface ReentrySummary {
	lastVisitAt: number | null;
	/** Pinned thoughts (what *matters*, alongside what changed), each with the
	 *  number of relations it gained since the last visit. */
	pinned: (ReentryThoughtRef & { newRelations: number })[];
	/** Most-connected claims and questions in focus (the active working set,
	 *  or the whole graph when no lens is active). */
	central: (ReentryThoughtRef & { degree: number })[];
	/** Contested or still-tentative thoughts in focus. */
	attention: ReentryThoughtRef[];
	newThoughts: ReentryThoughtRef[];
	revisedThoughts: ReentryThoughtRef[];
	newRelations: number;
	pendingChangeSets: number;
}

/** What the effective payload of an operation is (human edit wins, original preserved). */
export function effectivePayload(op: ProposedOperation): OperationPayload {
	return op.editedPayload ?? op.payload;
}
