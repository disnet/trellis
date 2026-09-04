# Trellis: an agent-native thinking workspace

## Status

Draft design for a focused prototype.

Synthesized from [the framing prompt](brainstorm-prompt.md), [the concise brainstorm](fable-brainstorm.md), and [the extended brainstorm](gpt-brainstorm.md).

## Summary

Trellis is a shared cognitive workspace in which a person and an agent develop a persistent graph of thought objects. The graph—not a document and not a conversation transcript—is the primary artifact.

The prototype should test a single product thesis:

> People can think more effectively with an agent when the agent proposes small, inspectable changes to shared thought state instead of replying with prose in a chronological chat.

The core loop is:

1. A person adds messy material to a temporary working set.
2. The agent proposes a structured diff: thoughts to create or revise, relations to add, and questions or contradictions to surface.
3. The person accepts, edits, or rejects each proposal.
4. Accepted changes become durable, attributed thought objects that can be revisited through different views.

Chat may exist as scratch space or as an explanation surface, but it is not the product's organizing metaphor and is never the only record of useful work.

## Problem

Current tools make the wrong artifact durable:

- Chat products preserve the transcript. Chronology records what happened, but poorly represents the current state of an idea.
- Note-taking products preserve pages. Pages are useful reading and writing surfaces, but agent features are usually bolted onto documents and do not create shared, manipulable thought state.
- Agent memory is commonly invisible to the person. The agent gains context while the person still has to reconstruct prior thinking.

These models break down during long-running, nonlinear work. A person must repeatedly recover context, extract conclusions from prose, remember side threads, and distinguish their own beliefs from plausible-sounding agent output.

## Product principles

### State over transcript

The principal result of agent work is a diff to persistent state. A transcript can remain as provenance, but should collapse behind the concepts, decisions, questions, and relationships produced by the work.

### Selection is context

The visible working set defines the agent's default context. People should be able to include, exclude, or background thoughts directly, instead of managing a hidden prompt or trusting opaque retrieval.

### Stable identity over stable wording

A thought has an identity independent of its current phrasing. It can be revised, summarized, expanded, or displayed in several views without breaking references to it.

### The agent proposes; the person ratifies

Agent changes enter a staging area. The person can accept, edit, or reject them individually or in a small batch. Deliberate ratification protects understanding and ownership; it is part of the thinking process, not incidental approval UI.

### Human-visible memory

Long-term memory should appear as inspectable structure: a relevant prior claim, a dependency, a conflict, or a neglected question. The agent should not hold a richer private account of the person's thinking than the person can see.

### Structure without premature bureaucracy

Typed objects and relationships should help the agent maintain order without making the person fill out a database. Freeform capture stays easy; the system proposes structure afterward.

### Views are projections

A canvas, outline, argument map, and document are views of the same underlying objects. Layout and presentation are not the canonical knowledge model.

## Conceptual model

### Durable primitives

#### Thought

A durable unit of meaning with stable identity.

For the prototype, a thought has:

- a short title;
- a current statement;
- a type: `claim`, `question`, `concept`, `example`, or `source`;
- a status: `tentative`, `believed`, `contested`, or `retired`;
- authorship and revision provenance;
- created and updated timestamps;
- zero or more typed relations.

Thoughts should usually express one idea that can be independently challenged, connected, or revised. The type system is intentionally small; the prototype should learn whether these distinctions are useful before expanding them.

#### Relation

A directional, typed connection between two thoughts.

The prototype supports:

- `supports`
- `contradicts`
- `depends_on`
- `example_of`
- `supersedes`
- `related_to` as an explicit escape hatch

The agent may propose relation types, but the interface should not require the person to classify every connection during capture.

#### Thread

A named line of inquiry with a root question, a current working set, unresolved items, and history. Threads let people leave, branch, and resume work independently of a conversation session.

For the first prototype, branching can be modeled as creating a new thread that references selected thoughts. Automated merge semantics are out of scope.

#### Working set

The small, explicit set of thoughts receiving attention now. Membership is temporary and does not change the durable graph. Each item may be marked:

- `focus`: central to the current operation;
- `context`: available as background;
- `parked`: visible but excluded from agent context.

#### Change set

An ordered set of proposed graph operations with a shared rationale and provenance. Supported operations are:

- create, revise, or retire a thought;
- add, change, or remove a relation;
- add or remove a thought from the working set.

Change sets are immutable records. Accepting a proposal applies a new revision; rejecting it records the decision without mutating the graph.

### Transient primitives

#### Scratch

Unstructured text used to capture an observation, paste notes, or ask for help. Scratch content may produce proposals but does not automatically become durable knowledge.

#### View

A query plus presentation configuration over the graph. Views can be temporary. The prototype only needs a spatial working-set view and a focused detail view; other projections can be simulated later.

#### Conversation

An optional exchange attached to a thought, thread, or change set. Its useful results should be reified into the graph. Conversation is retained for provenance but visually subordinate to current state.

## Interaction design

### Main workspace

The main screen is a bounded working set, not an infinite global graph. It contains:

- a top bar with the current thread, search, and working-set scope;
- a central canvas of compact thought cards and relations;
- a scratch composer for freeform capture;
- an inspector for the selected thought;
- a proposal tray showing pending agent changes.

Cards show only enough information to scan: type, title or compressed statement, status, and provenance marker. Selecting or zooming a card reveals its full statement, relations, history, and attached sources.

Agent-authored proposals are visually distinct until accepted. New material should enter at the edge of the current arrangement so it is noticeable without interrupting the person's flow.

### Semantic zoom

The prototype should support three information-density levels even if spatial zoom is initially implemented as a control rather than a polished gesture:

1. **Overview:** title, type, status, and connections.
2. **Reading:** current statement and immediately relevant relations.
3. **Inspection:** evidence, provenance, revision history, and proposal rationale.

This tests whether changing abstraction level reduces the need to read long agent responses.

### Agent actions

The agent operates on the selected thoughts plus the explicit working set. The initial actions are deliberately narrow:

- **Decompose:** propose atomic claims, concepts, and questions from scratch or a selected thought.
- **Challenge:** propose objections, contradictions, or missing assumptions.
- **Connect:** find relevant thoughts already in the local graph and propose typed relations.
- **Synthesize:** propose a revised thought that compresses a selected cluster without deleting its members.

Every action returns a structured change set, not a freeform answer. A short rationale may explain why an operation was proposed, and “Why?” can reveal more detail on demand.

### Proposal review

The proposal tray is the critical prototype interaction. It should:

- summarize impact first, such as “3 thoughts and 2 relations proposed”;
- preview additions and before/after revisions in place on the canvas;
- support accept, edit, or reject per operation;
- prevent acceptance of a relation whose endpoint is rejected;
- allow accepting a valid subset;
- keep agent content visibly provisional until acceptance;
- make undo available for the last applied change set.

Batch acceptance can exist, but the interface should optimize for comprehension over speed.

### Re-entry

When a person reopens a thread, Trellis should restore the last working set and summarize structural state rather than replay activity:

- the current central claim or question;
- contested or unresolved thoughts;
- material changes since the last visit;
- one or two relevant older thoughts the agent proposes adding to context.

This is the first test of shared, human-visible memory.

## Primary prototype scenario

The demo and usability test should use one scenario from beginning to end:

1. The person creates a thread from a broad question.
2. They paste a rough paragraph into scratch.
3. **Decompose** returns two claims and one question as a pending change set.
4. The person accepts one, edits one, and rejects one.
5. **Connect** surfaces an older thought and proposes a typed relation.
6. **Challenge** proposes an objection connected to the central claim.
7. The person changes the central claim in response and sees the earlier wording in history.
8. They leave the thread and later reopen it to current state rather than a transcript.

This scenario exercises capture, agent operation, ratification, explicit context, provenance, revision, and re-entry without requiring the entire envisioned product.

## Prototype scope

### Must have

- Create and edit thoughts with stable IDs, types, and statuses.
- Create typed relations.
- Create a thread and manage its working set.
- Spatial card view with selection, dragging, and basic relation rendering.
- Scratch capture.
- The four structured agent actions.
- Staged proposal review with partial acceptance and rejection.
- Provenance and thought revision history.
- Local persistence across sessions.
- A seeded graph that makes connection and contradiction flows testable.
- Basic keyboard navigation and non-color-only proposal/status indicators.

### Useful if inexpensive

- Three semantic-density modes.
- Undo for the most recently applied change set.
- Side-thread creation from selected thoughts.
- A simple outline projection of the working set.
- Export of thoughts and relations as JSON.

### Explicitly out of scope

- Collaborative multi-user editing.
- Autonomous background agents.
- Web research, citation verification, or source ingestion pipelines.
- A general-purpose document editor.
- A global force-directed graph of the entire knowledge base.
- Automatic branch merging.
- Rich media, mobile clients, sync, permissions, and production security.
- A large ontology or user-configurable schema.
- Fully automated restructuring of accepted knowledge.

## Technical design for the prototype

The repository currently contains only design inputs, so the stack should optimize for rapid interaction testing rather than architectural longevity.

### Suggested stack

- TypeScript web application.
- React for the interface.
- A canvas/graph UI library for draggable cards and edges.
- A small local application server for model calls and persistence.
- SQLite for thoughts, relations, threads, working sets, revisions, and change sets.
- A model adapter that can use either a live structured-output model or deterministic fixtures.

Deterministic fixtures are important: the full review flow should remain demoable and testable without network access or model variance.

### Minimal data model

```text
Thought
  id, type, status, title, statement
  created_at, updated_at

ThoughtRevision
  id, thought_id, title, statement, status
  actor_type, actor_id, source_change_set_id, created_at

Relation
  id, from_thought_id, to_thought_id, type
  created_by, source_change_set_id, created_at

Thread
  id, title, root_thought_id, created_at, updated_at

WorkingSetItem
  thread_id, thought_id, attention_role, x, y

ChangeSet
  id, thread_id, action, status, rationale
  actor_id, created_at, applied_at

ProposedOperation
  id, change_set_id, sequence, operation_type
  payload, status, decision_note
```

For a prototype, snapshots in `ThoughtRevision` are simpler and safer than reconstructing state from a fully event-sourced model. `ProposedOperation.payload` can remain validated JSON until the operation vocabulary stabilizes.

### Agent contract

The application sends:

- the invoked action;
- selected thought IDs;
- the working set divided into focus and context;
- relevant relations among those thoughts;
- optional scratch content;
- concise operation and schema instructions.

The model returns validated structured output:

```json
{
  "summary": "Proposed two claims and one open question.",
  "operations": [
    {
      "op": "create_thought",
      "client_ref": "new-1",
      "thought": {
        "type": "claim",
        "status": "tentative",
        "title": "State should outlive conversation",
        "statement": "The durable result of agent collaboration should be shared thought state rather than its transcript."
      },
      "rationale": "This is independently challengeable and central to the input."
    },
    {
      "op": "add_relation",
      "from": "new-1",
      "to": "existing-thought-id",
      "relation_type": "supports",
      "rationale": "The new claim supplies a reason for the existing design direction."
    }
  ]
}
```

The server validates allowed operations, referential integrity, text limits, and permissions before showing a preview. Model output never writes directly to accepted graph tables. Applying a change set is a transaction initiated by explicit user action.

### Important implementation constraint

Keep the canonical graph separate from view state. Card coordinates, collapsed state, and density belong to the working-set projection, not to thoughts or relations. This preserves the ability to add other views without migrating the knowledge model.

## Prototype plan

### Phase 0: interaction skeleton

Goal: make the complete scenario clickable before integrating a model or durable storage.

- Build the main workspace, thought cards, inspector, scratch surface, and proposal tray.
- Seed a small graph based on the agent-native PKB topic.
- Implement the scenario with deterministic change-set fixtures.
- Exercise accept, edit, reject, partial acceptance, and proposal dependencies.

Exit criterion: a person can complete the primary scenario and always distinguish accepted state from proposed state.

### Phase 1: durable graph core

Goal: prove that state survives and remains intelligible without a transcript.

- Add SQLite persistence and the minimal schema.
- Implement thought revisions, provenance, typed relations, and thread working sets.
- Add re-entry state and the most-recent-change-set undo path.
- Add JSON import/export for recovery and debugging.

Exit criterion: after closing and reopening the prototype, a person can explain the current state of the thread and how a selected thought changed.

### Phase 2: live agent proposals

Goal: replace fixtures without weakening the safety or clarity of the review loop.

- Implement the structured agent contract and schema validation.
- Integrate Decompose and Challenge first; add Connect once local retrieval is reliable, then Synthesize.
- Limit retrieval to the explicit working set plus a small local candidate set.
- Record inputs, raw outputs, validation errors, latency, and review decisions for evaluation.
- Fall back to fixtures or a recoverable error state when generation fails.

Exit criterion: live outputs can complete the scenario repeatedly, invalid output cannot mutate canonical state, and the person can understand each proposed operation without opening raw model text.

### Phase 3: test the thesis

Goal: learn whether this interaction is better than a transcript for the target work.

- Run five to eight moderated sessions with people who maintain notes or do sustained conceptual work.
- Give each participant the same source material and thinking task.
- Observe the initial session and a re-entry task after a delay.
- Compare against a lightweight chat baseline using the same model and material.
- Capture both behavior and interview feedback; avoid optimizing only for speed.

Exit criterion: evidence is strong enough to choose whether to deepen the graph-diff interaction, revise it, or stop.

## Evaluation

### Core hypotheses

1. **Structural comprehension:** after a session, people can describe the current claims, questions, and disagreements without rereading a transcript.
2. **Ownership:** people can reliably distinguish their accepted thinking from unratified agent suggestions.
3. **Re-entry:** after time away, people resume from the graph faster and with fewer context-restoring prompts than from chat.
4. **Proposal utility:** a meaningful portion of agent proposals are accepted or edited into accepted state rather than ignored wholesale.
5. **Manageable granularity:** people can manipulate the proposed thoughts without feeling that they are maintaining a database.
6. **Useful relation types:** the typed relations improve understanding often enough to justify their complexity.

### Measures

- Time to correctly summarize current state on re-entry.
- Accuracy of identifying central, contested, and unresolved thoughts.
- Accepted, edited, and rejected operations per action.
- Frequency of opening expanded rationale or raw transcript.
- Number of manual split, merge, or rewrite corrections caused by poor granularity.
- Use of `related_to` compared with specific relation types.
- Confidence about authorship and status, reported after the task.
- Qualitative evidence of cognitive interruption, clutter, loss of trust, or useful surprise.

### Prototype success criteria

The prototype is promising if:

- most participants complete the primary scenario without instruction after a short introduction;
- participants do not mistake pending agent content for accepted thought;
- re-entry summaries are at least as accurate as the chat baseline and require less transcript reading;
- participants find at least two structured agent operations meaningfully useful;
- proposal review feels like thinking or editing, not clerical cleanup;
- no single granularity or ontology problem repeatedly blocks the workflow.

These criteria are directional for a small qualitative study, not claims of statistical significance.

## Risks and design responses

### The graph becomes agent-generated slop

Keep proposals staged, small, and attributable. Default to a modest operation count, prefer revising or connecting existing thoughts where appropriate, and make rejection cheap.

### Thoughts become too granular

Give every thought a readable statement, not just a label. Measure split/merge corrections and allow the person to edit agent-created boundaries during review.

### Thoughts remain page-sized

Tune Decompose toward independently challengeable ideas, and test whether Challenge and Connect work on each result. If an item cannot participate meaningfully in either operation, it may be too broad or too vague.

### Typed links collapse into “related”

Keep the vocabulary small, show relation labels in context, and measure escape-hatch usage. Remove types that people cannot understand or the agent cannot apply consistently.

### Ratification becomes exhausting

Keep change sets intentionally small, group dependent operations, support keyboard review, and allow trust to grow per action later. Do not remove review friction before learning which decisions create understanding.

### The canvas becomes spatial clutter

Limit the main view to the working set, keep layout state view-specific, and support a simple reset/arrange action. Do not attempt to render the entire knowledge base.

### Agent context feels opaque despite the working set

Before an action, show a compact “using” summary of focus and context. Afterward, attach each rationale to the thoughts and relations it used.

## Open questions

The prototype is intended to answer, rather than prematurely settle, these questions:

- What makes a thought independently useful, and when should it split or merge?
- Does deliberate ratification increase understanding enough to justify its cost?
- Which relation types survive real, messy thought?
- Should accepted agent wording become “human-owned,” or retain mixed authorship forever?
- How much explanation belongs inline versus behind “Why?”
- Can semantic zoom be driven reliably by stored representations, agent-generated summaries, or both?
- When should the agent surface an older thought without being asked?
- Is a spatial working set genuinely useful, or would an outline provide a better default?
- Does the thread concept add value beyond a saved working set during the prototype?

## Decisions to defer

Do not decide the following from the brainstorm alone:

- the final ontology;
- the long-term storage or event model;
- whether the product is local-first or cloud-first;
- whether the canvas or another projection is the default mature interface;
- autonomous agent permissions;
- collaboration and sharing semantics;
- pricing, distribution, and migration from existing PKBs.

## Recommended first build

Start with Phase 0 as a polished, deterministic vertical slice. The first artifact should not be a generic graph editor or an agent chat wired to a database. It should be the proposal-review loop, demonstrated with a small seeded graph and the full capture-to-re-entry scenario. That is the smallest prototype capable of testing what is actually new about Trellis.
