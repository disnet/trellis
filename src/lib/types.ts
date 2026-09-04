// Core domain types for the Trellis Phase 0 skeleton.
// Mirrors docs/design.md "Data model" and "Agent contract", kept in-memory for now.

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
	appliedAt?: number;
}

/** What the effective payload of an operation is (human edit wins, original preserved). */
export function effectivePayload(op: ProposedOperation): OperationPayload {
	return op.editedPayload ?? op.payload;
}
