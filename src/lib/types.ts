// Core domain types for Trellis. Mirrors docs/design.md "Data model" and
// "Agent contract". Shared between the client store and the server, which
// persists everything in SQLite (Phase 1).

export type ThoughtType = 'claim' | 'question' | 'concept' | 'example';

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

export interface WorkingSetItem {
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

/** A named working set (tab). Only membership + layout — never knowledge. */
export interface WorkingSetInfo {
	id: string;
	name: string;
	createdAt: number;
	/** Number of thoughts in the set, for tab display. */
	size: number;
}

export interface ScratchNote {
	id: string;
	body: string;
	createdAt: number;
	distilledChangeSetId?: string;
}

// --- Agent contract (fixture-driven in Phase 0) ---

export type AgentAction = 'decompose' | 'develop' | 'challenge' | 'connect';

export interface ProposedThoughtFields {
	type: ThoughtType;
	status: ThoughtStatus;
	title: string;
	statement: string;
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
	/** Scratch note id, when invoked from scratch. */
	scratchId?: string;
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
	/** All working sets, oldest first. */
	workingSets: WorkingSetInfo[];
	activeWorkingSetId: string;
	/** Items of the active working set. */
	workingSet: WorkingSetItem[];
	scratchNotes: ScratchNote[];
	pendingChangeSets: ChangeSet[];
	decidedChangeSets: ChangeSet[];
	/** Summary of the last applied change set, when it can still be undone. */
	undoLabel: string | null;
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
	/** Most-connected claims and questions in the working set. */
	central: (ReentryThoughtRef & { degree: number })[];
	/** Contested or still-tentative thoughts in the working set. */
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
