# Trellis: an agent-native thinking workspace

## Status

Canonical design for the first Trellis prototype.

Synthesized from [the framing prompt](brainstorm-prompt.md), [the concise brainstorm](fable-brainstorm.md), [the extended brainstorm](gpt-brainstorm.md), and the earlier design synthesis.

## Product thesis

Current tools preserve the wrong artifact. Chat products preserve a chronological transcript; note-taking products preserve pages. Neither gives a person and an agent an inspectable account of the current state of an idea.

Trellis is a shared cognitive workspace in which a person and an agent develop a persistent graph of thought objects. The graph—not a document or conversation—is primary.

The prototype tests one thesis:

> People can think more effectively with an agent when the agent proposes small, inspectable changes to shared thought state instead of replying with prose in a chronological chat.

The core loop is:

1. A person captures messy material in scratch.
2. The agent proposes a structured diff.
3. The person accepts, edits, or rejects each operation.
4. Accepted changes become durable, attributed state.
5. The person later resumes from that state instead of reconstructing it from a transcript.

Chat may exist as scratch or explanation, but it is never the organizing metaphor or the only record of useful work.

## Product principles

### State over transcript

Agent work produces a diff to persistent state. A transcript may remain as provenance, but it collapses behind the concepts, questions, claims, and relations produced by the work.

### Selection is context

The visible working set defines the agent's reasoning context. People directly include, exclude, or background thoughts rather than managing a hidden prompt.

Discovery is an explicit exception. **Connect** may search the wider graph, but must expose the retrieved candidates and why they were selected before they influence accepted state.

### Stable identity over stable wording

A thought can be revised, summarized, and displayed in different views without changing its identity or breaking references.

### The agent proposes; the person ratifies

Agent changes enter staging. Accepting, editing, or rejecting them is part of the thinking process, not incidental approval UI.

### Authorship is not acceptance

Provenance records both who authored a revision and who accepted it. Acceptance expresses endorsement, not retroactive authorship. Editing an agent proposal creates a human-authored revision derived from the proposal.

### Human-visible memory

Memory appears as inspectable structure—a prior claim, dependency, conflict, or open question—not as private agent context the person cannot see.

### Structure without bureaucracy

Freeform capture remains easy. The agent proposes types and relations afterward so the person is not forced to maintain a database.

### Views are projections

Cards, outlines, argument maps, and documents are presentations of the same objects. Layout is not canonical knowledge.

## What the prototype must learn

The prototype is a research instrument, not a small version of the complete product.

| Hypothesis | Evidence | Failure signal |
|---|---|---|
| Structured state improves comprehension | People explain current claims, questions, and disagreements without rereading history | They repeatedly need raw model output or a transcript |
| Ratification creates ownership | People distinguish accepted beliefs from provisional suggestions | Pending content is mistaken for accepted thought, or acceptance becomes automatic |
| Thought-sized objects are workable | People can challenge, connect, and revise them | Objects feel page-sized or like database fragments |
| Typed relations earn their complexity | Specific types improve understanding or operations | Most become `related_to`, or labels are misunderstood |
| Explicit context is legible | People can predict what an operation will use | They cannot explain why the agent considered something |
| Durable state improves re-entry | People resume accurately with less reconstruction than in chat | The graph is slower or less accurate than the transcript |

Spatial layout, branching, global retrieval, and elaborate semantic zoom are separate bets. They must not obscure whether proposal and ratification work.

## Primary prototype scenario

1. The person opens a workspace around a broad question.
2. They paste a rough paragraph into scratch.
3. **Decompose** proposes two thoughts and one question.
4. The person accepts one operation, edits one, and rejects one.
5. They select an accepted claim and invoke **Challenge**.
6. The agent proposes an objection and a typed relation to the claim.
7. The person revises the claim and can inspect its earlier wording and provenance.
8. They close the workspace and later resume from its claims and unresolved questions rather than a transcript.

This exercises the complete thesis without requiring a general graph editor or open-ended chat.

## Prototype scope

### Must have

- One durable workspace with a small working set.
- Thoughts with stable IDs, types, epistemic statuses, and revision history.
- Typed relations.
- Compact cards and a focused inspector.
- Scratch capture.
- Structured **Decompose** and **Challenge** actions.
- Proposal preview with accept, edit, reject, partial acceptance, and dependency validation.
- Non-color-only distinction between proposed and accepted state.
- Separate authorship and acceptance provenance.
- Local persistence and structural re-entry.
- Deterministic fixtures for the full scenario.
- Basic keyboard navigation.

### Add only after the core loop works

- **Connect**, with visible wider-graph discovery.
- **Synthesize**, without deleting its source thoughts.
- Draggable spatial layout and saved positions.
- Richer semantic zoom.
- Undo, outline projection, and JSON import/export.
- Multiple workspaces.

### Out of scope

- Thread branching and merging.
- Multi-user collaboration or background agents.
- Web research and source-ingestion pipelines.
- A general-purpose document editor or global graph view.
- Rich media, mobile, sync, permissions, and production security.
- A configurable ontology or automated restructuring of accepted knowledge.

## Conceptual model

### Thought

A durable, independently useful unit of meaning:

- title and current statement;
- type: `claim`, `question`, `concept`, or `example`;
- epistemic status: `tentative`, `believed`, `contested`, or `retired`;
- stable identity, revision history, and provenance.

A thought may be too broad if it cannot be independently challenged, connected, or revised. It may be too small if it cannot be understood without repeatedly opening adjacent fragments.

Epistemic status is distinct from proposal workflow state.

### Relation

A directional, typed connection between two thoughts. The initial vocabulary is:

- `supports`
- `contradicts`
- `depends_on`
- `example_of`
- `related_to` as an escape hatch

The agent may propose types, but capture never requires manual classification. Relation history preserves who created, revised, or retired a relation.

### Workspace and working set

A workspace is the durable container for the prototype. It has a root question and restores its working set on re-entry. Whether the mature concept is called a thread, project, or something else is deferred.

Working-set membership does not alter the durable graph. Each item has an attention role:

- `focus`: central to the operation;
- `context`: available as background;
- `parked`: visible but excluded from agent context.

### Scratch

Unstructured input for observations, pasted notes, or questions. It may be retained as provenance but never becomes durable knowledge automatically.

### Change set

An immutable proposal containing ordered graph operations, rationale, and provenance. V0 operations create, revise, or retire a thought and add or retire a relation.

The original operation payload never changes. Human accept, edit, or reject decisions are stored separately; an edit preserves both the proposal and its replacement.

Operations declare dependencies. A relation to a proposed thought, for example, depends on creating that thought. A valid subset may be accepted, but unresolved dependencies block application.

Application is a human-initiated transaction. Model output never writes canonical state directly.

### View

V0 provides two information densities:

1. **Scan:** title, type, status, provenance marker, and immediate connections.
2. **Inspect:** statement, relations, revisions, and proposal rationale.

This tests readable chunks without coupling the experiment to sophisticated canvas or zoom behavior.

## Interaction design

The main screen contains the workspace question, bounded working set, scratch composer, selected-thought inspector, and proposal tray. A stable card arrangement is sufficient; spatial dragging is not required.

The proposal tray is the critical interaction. It must:

- summarize impact first;
- preview additions and before/after revisions in context;
- identify the accepted thoughts or scratch behind each operation;
- support accept, edit, and reject per operation;
- display and enforce dependencies;
- allow any valid subset;
- preserve original and edited payloads;
- keep provisional content visibly distinct;
- never infer acceptance from scrolling, closing, or navigation.

V0 optimizes for comprehension, not batch throughput.

On re-entry, Trellis restores the root question, working set, central claims, contested thoughts, and unresolved questions. Because v0 has no background actors, it does not need a “changes while away” mechanism.

## Agent boundary and context contract

The application sends the model:

- action and selected thought IDs;
- working-set thoughts divided into `focus` and `context`;
- relations among those thoughts;
- optional scratch;
- allowed operations and schema.

`parked` thoughts are not sent. Ordinary actions do not silently retrieve other graph content.

A future **Connect** action uses an explicit discovery mode: local retrieval produces a small candidate set, the UI discloses that retrieval, and proposals cite the candidates that influenced them.

Model output is validated structured data:

```json
{
  "summary": "Proposed one claim and one relation.",
  "operations": [
    {
      "ref": "new-1",
      "op": "create_thought",
      "payload": {
        "type": "claim",
        "status": "tentative",
        "title": "State should outlive conversation",
        "statement": "Agent collaboration should produce durable shared thought state rather than only a transcript."
      },
      "depends_on": [],
      "evidence_refs": ["scratch-1"],
      "rationale": "This is independently challengeable."
    },
    {
      "ref": "relation-1",
      "op": "add_relation",
      "payload": {
        "from": "new-1",
        "to": "existing-thought-id",
        "type": "supports"
      },
      "depends_on": ["new-1"],
      "evidence_refs": ["new-1", "existing-thought-id"]
    }
  ]
}
```

Before preview, the server validates schema, operations, references, text limits, and dependencies. Before application, it validates the chosen subset again and applies it transactionally.

## Technical design

Use TypeScript, React, a small local server, SQLite, schema validation, and a model adapter supporting both deterministic fixtures and a live structured-output model. Vendor choice is configuration, not a design decision.

Minimal logical model:

```text
Workspace
  id, title, root_thought_id, created_at, updated_at

Thought
  id, current_revision_id, created_at, retired_at
ThoughtRevision
  id, thought_id, type, status, title, statement
  authored_by, derived_from_operation_id, source_application_id, created_at

Relation
  id, from_thought_id, to_thought_id, current_revision_id, created_at
RelationRevision
  id, relation_id, type, active
  authored_by, derived_from_operation_id, source_application_id, created_at

WorkingSetItem
  workspace_id, thought_id, attention_role
Scratch
  id, workspace_id, body, authored_by, created_at

ChangeSet
  id, workspace_id, action, summary, rationale, authored_by, source_scratch_id, created_at
ProposedOperation
  id, change_set_id, ref, sequence, operation_type
  payload, dependency_refs, evidence_refs, rationale
OperationDecision
  id, proposed_operation_id, decision, edited_payload, decided_by, decided_at
ChangeApplication
  id, change_set_id, applied_by, applied_at
```

The implementation may combine tables, but must preserve immutable proposals, human decisions, application provenance, and graph revision history.

Canonical graph state and view state remain separate. Future coordinates, collapsed state, and density belong to a working-set view rather than to thoughts or relations.

## Build plan

### Phase 0: interaction skeleton

Build the complete scenario with fixtures and in-memory state: cards, inspector, scratch, proposal review, partial acceptance, dependencies, provenance styling, keyboard navigation, and simulated re-entry.

Exit: a person completes the scenario and always distinguishes pending from accepted content.

### Phase 1: durable graph

Add SQLite, thought and relation revisions, complete provenance, working-set restoration, and structural re-entry.

Exit: after reopening, a person can explain the workspace and how a thought reached its current wording.

### Phase 2: live proposals

Add the model adapter and validation for Decompose and Challenge. Record inputs, raw outputs, errors, latency, and review decisions. Retain fixture fallback.

Exit: live output repeatedly completes the scenario, invalid output cannot mutate state, and proposals are understandable without raw model text.

### Phase 3: evaluate before expanding

Run five to eight moderated sessions with people who maintain notes or do sustained conceptual work. Compare with a lightweight chat baseline using the same model, material, initial task, and delayed re-entry task.

Exit: evidence supports continuing, revising, or stopping before broader features are added.

## Evaluation and decision rules

Measure re-entry accuracy and time, history reading, proposal decisions, granularity corrections, relation-type use, pending/accepted confusion, provenance comprehension, and observed clerical fatigue or useful surprise.

- **Continue** if nearly everyone distinguishes pending from accepted state, a clear majority re-enters at least as accurately with less history reading than chat, and a core action is useful to most participants.
- **Revise** if durable state helps but review, granularity, relation types, or cards create recurring friction.
- **Stop or rethink** if chat matches or beats comprehension and re-entry while Trellis adds clerical work.

Acceptance rate alone is not success. High unexamined acceptance may indicate automation bias; extensive editing may indicate productive thinking or poor proposals.

## Risks and responses

| Risk | Response |
|---|---|
| Agent-generated slop | Keep proposals small, staged, attributable, and easy to reject |
| Ratification fatigue | Observe decisions before removing friction; distinguish comprehension work from clerical work |
| Bad granularity | Use independently challengeable meaning as a heuristic; track splits, merges, and rewrites |
| Ontology collapse | Keep types few, show labels in context, and measure the escape hatch |
| Opaque context | Show a “using” summary and evidence references; make wider retrieval explicit |
| Interface confounds the thesis | Start with stable cards; test canvas, outline, and richer zoom separately |

## Open questions

- What makes a thought independently useful, and when should it split or merge?
- Does ratification increase understanding enough to justify its cost?
- Which relation types survive messy thought?
- How much rationale belongs inline versus behind “Why?”
- When does editing an agent proposal feel like authorship rather than cleanup?
- When should the agent surface older material without being asked?
- Is spatial organization better than a stable list or outline?
- Does a thread add value beyond a saved workspace?
- Can any low-risk operation eventually bypass individual ratification?

## Deferred decisions

- Final ontology and long-term storage model.
- Local-first versus cloud-first product architecture.
- Default mature view and thread semantics.
- Autonomous permissions, collaboration, and sharing.
- Model vendor.
- Pricing, distribution, and PKB migration.

## Recommended first build

Start with Phase 0 as a polished deterministic vertical slice. Build the proposal-review loop—not a generic graph editor or an agent chat wired to a database—and demonstrate the complete path from messy capture to ratified state and later re-entry. That is the smallest prototype capable of testing what is genuinely new about Trellis.
