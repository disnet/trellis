# Trellis: an agent-native thinking workspace

## Status

Canonical design for the first Trellis prototype.

## The problem

Current tools for "thinking with agents" make the wrong artifact durable:

- **Chat products preserve the transcript.** Chronology records what happened, but poorly represents the current state of an idea. The transcript grows, the human loses track, and the burden of keeping the right things in the agent's context falls on the person.
- **Note-taking products preserve pages.** Pages are fine reading and writing surfaces, but they were designed pre-agents; agent features are bolted onto documents and do not create shared, manipulable thought state.
- **Agent memory is invisible.** The agent accumulates context while the person still has to reconstruct prior thinking, and can't distinguish their own beliefs from plausible-sounding agent output.

The root mistake is choosing the transcript (chat) or the document (Obsidian/Notion) as the primary artifact. **The transcript is history, but thinking needs state.**

## Thesis

Trellis is a shared cognitive workspace in which a person and an agent develop a persistent graph of thought objects. The graph — not a document, not a conversation — is the primary artifact.

The prototype tests a single product thesis:

> People can think more effectively with an agent when the agent proposes small, inspectable changes to shared thought state instead of replying with prose in a chronological chat.

The core loop: messy input → agent-proposed structure → human ratification → durable graph → agent operating on selections of that graph.

## Design principles

1. **State over transcript.** The principal result of agent work is a diff to persistent state — "found 7 related notes, proposed 3 connections and one merge" — which you inspect, not read. Language is produced *inside* the structure; it isn't the structure.
2. **Selection is context.** The visible working set defines the agent's context. You include or exclude thoughts directly instead of managing a hidden prompt or trusting opaque retrieval. This makes non-linear jumping cheap: you jump, the agent follows, no re-explaining.
3. **The agent proposes; the human ratifies.** Agent changes enter a staging area until deliberately accepted. This friction is the point: ratification is where the thinking happens. A PKB you skim but didn't author isn't yours.
4. **Authorship is not acceptance.** Provenance records both who authored a revision and who accepted it. Accepting an agent proposal expresses endorsement, not retroactive authorship; editing one creates a human-authored revision derived from the proposal, with the original preserved.
5. **Stable identity over stable wording.** A thought can be revised, summarized, or displayed in several views without breaking references to it.
6. **Typed links, agent-maintained.** Typed relations are what let the agent do real work — find contradictions written months apart, flag that a load-bearing claim is still tentative, notice a concept reinvented under a new name. Typed ontologies historically collapse into "related" when humans must maintain them; the bet is they survive if the human mostly just writes and the agent maintains the types.
7. **Human-visible memory.** Long-term memory appears as inspectable structure — a relevant prior claim surfaced at the edge of the workspace, not "we discussed this." The agent never holds a richer private account of your thinking than you can see.
8. **Structure without premature bureaucracy.** Freeform capture stays easy; the system proposes structure afterward. The person is never required to classify anything during capture.
9. **Views are projections.** Canvas, outline, argument map, and document are lenses over the same objects. Layout and presentation are not the knowledge model.
10. **Chat is compost — and absent from v0.** Useful conversation results get reified into the graph; the transcript survives only as provenance. v0 goes further: there is no chat surface at all (see "Key design decision" below).

## Conceptual model

### Durable primitives

| Primitive | What it is |
|---|---|
| **Thought** | Durable unit (claim / question / concept / example / prediction / evidence) with stable identity, status, and two resolutions (title, statement) |
| **Relation** | Typed directional edge: `supports`, `contradicts`, `depends_on`, `example_of`, `supersedes`, `related_to` (explicit escape hatch) |
| **Change set** | An agent-authored set of proposed operations with shared rationale, awaiting ratification |

Meta-property on everything: **provenance** (author, time, source change set, revision history).

**Thought** fields: id, type (`claim` / `question` / `concept` / `example` / `prediction` / `evidence`), status (`tentative` / `developing` / `believed` / `contested` / `retired`), title (one-line resolution), statement (full resolution), timestamps, revision history. A thought should usually express one idea that can be independently challenged, connected, or revised. The type system is intentionally small; the prototype should learn whether these distinctions earn their keep before expanding them.

Two types carry structured, revisioned fields. A **prediction** is a falsifiable expectation about a future or not-yet-observed outcome, with a **confidence**: a probability (0–1) for a binary outcome, or a low/high interval (with a unit) for a quantitative one, plus an optional resolve-by date. Confidence is part of the revision history, so updating a belief leaves a calibration trail. **Evidence** is a concrete observation, measurement, or sourced fact that bears on other thoughts (via `supports` / `contradicts`), with an optional **source** (citation, URL, or dataset) — the epistemic role stays a thought type; provenance stays a field, so the ontology doesn't grow a bookmark type.

**Relation:** the agent may propose relation types, but the interface never requires the person to classify a connection during capture. `related_to` exists explicitly so we can measure how often the specific types fail.

**Change set:** an immutable record of proposed operations (create/revise/retire a thought, add/change/remove a relation). Accepting applies a new revision; rejecting records the decision without mutating the graph.

### Transient primitives

| Primitive | What it is |
|---|---|
| **Working set** | The small, explicit set of thoughts receiving attention now — the agent's context window made visible. Membership is binary (in or out) and does not change the durable graph. Persisted across sessions for re-entry. |
| **Scratch** | Unstructured capture surface. May produce proposals; never automatically becomes durable knowledge. |
| **View** | A disposable projection of some subset. v0: the working-set canvas plus one read-only outline projection. |

**No Threads in v0.** Earlier drafts floated Threads as a durable primitive while also listing "does the thread concept add value?" as an open question. Resolution: cut them. A persisted working set covers re-entry — the part of Threads worth keeping. Branch/merge of lines of inquiry is deferred until the core loop proves out.

## Interaction design

### Main workspace

The main screen is a bounded working set, not an infinite global graph:

- a central **canvas** of compact thought cards with rendered relations;
- a **scratch composer** for freeform capture;
- an **inspector** for the selected thought (statement, relations, history, provenance);
- a **proposal tray** showing pending change sets.

Cards show only enough to scan: type, title, status, provenance marker. Two zoom levels in v0: **overview** (title/type/status) and **reading** (full statement + relations); inspection detail lives in the inspector. Proposal and status indicators must not rely on color alone.

Agent proposals appear **at the edge** of the current arrangement, visually distinct until accepted — noticeable without interrupting flow.

### Agent operations

Invoked on a selection (one or more cards, or scratch content). The selection plus the working set is *exactly* the agent's context — no hidden retrieval. Four operations in v0:

- **Decompose:** propose atomic claims, concepts, and questions from scratch text or a too-big thought. This is the distill loop: paste a messy paragraph, get back "this contains two claims and a question; the second claim contradicts a node from March — reify?"
- **Develop:** propose extensions, implications, or refinements of the selection.
- **Challenge:** propose objections, contradictions, or missing assumptions, linked as `contradicts` / `depends_on`.
- **Connect:** find relevant existing thoughts (working set + 1-hop neighborhood) and propose typed relations, flagging contradictions found.

Every operation returns a structured change set with a short rationale per operation, never a freeform answer. *Synthesize* (compress a cluster into a revised thought) is the first v0.1 candidate.

### Proposal review

The proposal tray is the critical interaction. It must:

- summarize impact first ("3 thoughts and 2 relations proposed");
- preview additions and before/after revisions in place on the canvas;
- support **accept / edit-then-accept / reject** per operation, and accepting a valid subset;
- prevent accepting a relation whose endpoint was rejected;
- preserve the original proposal payload alongside any human edit;
- keep agent content visibly provisional until acceptance;
- offer undo for the last applied change set.

Batch acceptance can exist, but the interface optimizes for comprehension over speed. Nothing agent-authored enters the graph silently.

### Re-entry

Reopening Trellis restores the last working set and summarizes structural state rather than replaying activity: the current central claims/questions, contested or unresolved thoughts, and what changed since the last visit. This is the first test of human-visible memory.

## Key design decision embodied in code

The agent endpoint's response type is `ChangeSet`, not `string`. **There is no chat completion surfaced anywhere in the UI in v0.** If the loop feels dead without free-form conversation, that itself is a finding — the brainstorms predict scratch-chat is needed as compost; v0 tests how far structure-only interaction goes. Attaching ephemeral chat to a thought is a v0.1 candidate, not a v0 hedge.

## Technical design

Local-first, single user, boring stack:

- **App:** TypeScript + SvelteKit + Vite. Canvas via absolutely-positioned cards + SVG edges — no heavy graph library until needed (positions are per-working-set, not global knowledge).
- **Server:** thin Node server (Hono or Express) for persistence and model calls. No auth, no deploy; runs on localhost.
- **Storage:** SQLite.
- **Agent:** Claude via the Anthropic SDK (e.g. `claude-sonnet-5` for cost during iteration), server-side, behind a **model adapter** that can also serve deterministic fixtures. Fixtures matter: the full review flow stays demoable and testable without network access or model variance.

### Data model

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

WorkingSetItem
  thought_id, x, y

ChangeSet
  id, action, status, rationale
  actor_id, created_at, applied_by, applied_at

ProposedOperation
  id, change_set_id, sequence, operation_type
  payload, depends_on, evidence_refs
  edited_payload, status, decision_note, decided_at

ScratchNote
  id, body, created_at, distilled_change_set_id
```

Snapshots in `ThoughtRevision` are simpler and safer than event sourcing at this stage. `ProposedOperation.payload` stays validated JSON until the operation vocabulary stabilizes; it is immutable as proposed, and a human edit lands in `edited_payload` so both survive. Authorship and acceptance are recorded separately: `ThoughtRevision.actor_*` says who wrote the words, `ChangeSet.applied_by` says who ratified them.

**Implementation constraint:** the canonical graph is separate from view state. Card coordinates, collapsed state, and density belong to the working-set projection, never to thoughts or relations.

### Agent contract

The application sends: the invoked operation, selected thought IDs, the working set, relations among those thoughts (plus 1-hop neighbors), optional scratch content, and concise schema instructions. Context assembly is deterministic.

The model returns validated structured output:

```json
{
  "summary": "Proposed two claims and one open question.",
  "operations": [
    {
      "op": "create_thought",
      "client_ref": "new-1",
      "depends_on": [],
      "evidence_refs": ["scratch-1"],
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
      "client_ref": "rel-1",
      "depends_on": ["new-1"],
      "evidence_refs": ["new-1", "existing-thought-id"],
      "from": "new-1",
      "to": "existing-thought-id",
      "relation_type": "supports",
      "rationale": "The new claim supplies a reason for the existing design direction."
    }
  ]
}
```

Every operation carries a `client_ref`, a `depends_on` list of refs, and `evidence_refs` naming the thoughts or scratch it drew on. Dependencies are what make partial acceptance enforceable: the tray blocks accepting an operation whose dependencies were rejected, and the server re-validates the chosen subset before applying it.

The server validates allowed operations, referential integrity, dependency refs, and text limits before showing a preview. **Model output never writes directly to accepted graph tables.** Applying a change set is a transaction initiated by explicit user action. Log inputs, raw outputs, validation errors, latency, and review decisions for evaluation.

## Prototype plan

### Phase 0: interaction skeleton (fixtures, no model, no durable storage)

Make the complete scenario clickable before integrating anything.

- Build the workspace: cards, canvas drag, inspector, scratch, proposal tray.
- Seed a small graph (this design's own topic works).
- Drive the primary scenario with deterministic change-set fixtures.
- Exercise accept, edit, reject, partial acceptance, and dependency handling.

*Exit: a person can complete the primary scenario and always distinguish accepted state from proposed state.*

### Phase 1: durable graph core

- SQLite persistence, minimal schema, revisions, provenance, typed relations.
- Persisted working set + re-entry summary; last-change-set undo.
- JSON export for recovery and debugging.

*Exit: after closing and reopening the prototype, you can explain the current state and how a selected thought changed — without a transcript.*

### Phase 2: live agent proposals

- Implement the structured contract and schema validation.
- Integrate Decompose and Challenge first; add Connect once local retrieval over the working-set neighborhood is reliable; then Develop.
- Fall back to fixtures or a recoverable error state when generation fails.

*Exit: live outputs complete the scenario repeatedly; invalid output cannot mutate canonical state; every proposed operation is understandable without opening raw model text.*

### Phase 3: working set manipulation

Until now the working set is whatever was seeded or last persisted. Make it directly editable, so "selection is context" is something the person actually steers:

- Search the full graph (title + statement) and add results to the working set.
- Remove a thought from the working set without touching the durable graph; an explicit empty-set / start-fresh action.
- Pull in a selected thought's 1-hop neighbors on demand.
- A reset/arrange action for canvas layout (per the spatial-clutter risk).
- Agent operations that surface thoughts from outside the set (Connect) offer "add to working set" as a lightweight direct action — membership is transient and binary, so it applies immediately rather than through the proposal tray.

*Exit: a working set can be assembled from the full graph without reseeding; adding and removing thoughts never mutates durable state; the persisted set survives manipulation and restores faithfully on re-entry.*

### Phase 4: outline projection (non-canvas view)

The "views are projections" principle so far exists only as a claim; the canvas is the sole surface. Add the one non-canvas view promised for v0 — a read-only outline over the same working set — to prove layout and presentation really are separate from the knowledge model:

- An outline projection of the current working set: thoughts grouped (e.g. by type or status), each showing title, status, and provenance marker, with relations rendered inline as typed references.
- A view toggle that switches canvas ↔ outline without changing working-set membership, selection, or any durable state.
- Selecting a thought in the outline drives the same inspector; pending change-set content remains visibly provisional in both views.
- Read-only: no editing, reordering-as-meaning, or capture in the outline (editing-in-outline stays out of scope for v0).

*Exit: the same working set is legible in both projections; switching views mutates nothing; a thought and its pending/accepted status can be located and distinguished in either view.*

### Phase 5: multiple graphs

So far there is exactly one graph — every thought, relation, and working set shares one namespace. That's wrong for dogfooding: a design project and an unrelated research thread shouldn't pollute each other's Connect results or search space. Add multiple graphs as fully isolated knowledge bases:

- Create, rename, and switch between graphs; each graph scopes its own thoughts, relations, working sets, scratch notes, and change sets.
- Isolation is total: search, Connect, and 1-hop retrieval never cross a graph boundary; agent context is assembled from the active graph only. No cross-graph relations in v0.
- Persistence via a `graph_id` scoping column (one SQLite file, simplest migration) rather than a database file per graph.
- Re-entry is per-graph: reopening restores the last active graph and its working set; switching graphs swaps the entire workspace, including the re-entry summary.
- JSON export operates per graph.

*Exit: two graphs on distinct topics can be worked in alternation with nothing leaking between them — no search result, proposed relation, or agent rationale ever references a thought from the inactive graph; each graph restores faithfully on switch and on re-entry.*

### Phase 6: pins + open neighborhood (maps of content)

Dogfooding shows big graphs need landmarks: a way to mark the main thoughts you keep returning to, and a way to orient around them. Rather than a favorites list or a new MOC primitive, let the graph itself be the map:

- **Pin thoughts.** A per-graph `pinned_thoughts` table — not a column on `thoughts`, for the same reason card coordinates live in `working_set_items`: salience-to-you is attention state, not knowledge. Pinning is a direct human action like working-set membership — instant, never through the proposal tray, never agent-proposed in v0.
- Pins surface in three places: a compact pinned rail in the workspace, ranked at the top of search results, and in the re-entry summary ("your pinned thoughts: …, two have new relations since last visit"). Re-entry currently summarizes what *changed*; pins tell it what *matters*.
- **Open neighborhood.** From any thought (pinned or not): one action that spawns a new working set seeded with that thought plus its 1-hop neighbors. Composes Phase 3's neighbor-pull with Phase 5's multiple working sets. A pinned `concept` with typed relations to its key claims thereby *is* a map of content: the hub is durable knowledge, the relations are the table of contents, the pin is just the bookmark.

Deliberately not in scope: a `hub`/`moc` thought type (the existing `concept` type plus outbound relations already expresses it; if hub-concepts prove behaviorally distinct, that's a granularity finding, not a v0 assumption); agent-computed salience ("you keep returning to X — pin it?") — needs usage logging that doesn't exist yet and risks the agent curating your sense of what's central before you've formed one, so it's a v0.1 candidate alongside Synthesize; any global graph overview — pins are what let you *not* need one.

*Exit: in a graph too big to hold in your head, you can re-orient from the pinned rail alone — pin a hub, open its neighborhood into a fresh working set, and reach any main line of thought in a couple of actions; pinning and unpinning never mutate durable knowledge.*

### Phase 7: dogfood + judge

Use it for a real thinking project (e.g. this design itself) for 1–2 weeks, logging against the measures below. A moderated multi-participant study with a chat baseline (per [the archived design-2](archive/design-2.md) Phase 3) is deferred until the loop proves out on ourselves.

*Exit: enough evidence to deepen the graph-diff interaction, revise it, or stop.*

### Primary scenario (demo forcing function)

1. Paste a rough paragraph into scratch.
2. **Decompose** returns two claims and one question as a pending change set.
3. Accept one, edit one, reject one.
4. **Connect** surfaces an older thought and proposes a typed relation.
5. **Challenge** proposes an objection linked to the central claim.
6. Revise the central claim in response; see the earlier wording in history.
7. Close the app; reopen later to current state, not a transcript.

## Evaluation

### Research questions

1. **Granularity.** What causes one thought to become two? Too small and it's a database; too big and it's Obsidian again. This is the "what is a file?" question for the whole design — the primary research question.
2. **Do typed links survive contact with messy real thought,** or collapse into `related_to`? The bet: they survive if the agent maintains them.
3. **Crowding.** Do ratification friction + visible provenance keep agent-generated structure from drowning the human's own — or are they just annoying?
4. **Ratification fatigue.** Does the staging area feel like thinking or like clearing an inbox? What's auto-acceptable (link-type maintenance?) vs. what must stay deliberate (new claims)?
5. **Is working-set-as-context enough,** or does the agent need retrieval over the full graph to be useful?

### Hypotheses and failure signals

| Hypothesis | Evidence it holds | Failure signal |
|---|---|---|
| Structured state improves comprehension | Current claims, questions, and disagreements can be explained without rereading history | Raw model output or a transcript is repeatedly needed |
| Ratification creates ownership | Accepted beliefs are distinguished from provisional suggestions | Pending content is mistaken for accepted thought, or acceptance becomes automatic |
| Thought-sized objects are workable | Thoughts can be challenged, connected, and revised independently | Objects feel page-sized or like database fragments |
| Typed relations earn their complexity | Specific types improve understanding or operations | Most relations become `related_to`, or labels are misunderstood |
| Explicit context is legible | What an operation will use is predictable | Why the agent considered something can't be explained |
| Durable state improves re-entry | Resumption is accurate with less reconstruction than chat | The graph is slower or less accurate than a transcript |

### Measures (logged during dogfood)

- Accepted / edited / rejected operations per operation type (accept-without-reading is the smell for fatigue).
- Use of `related_to` vs. specific relation types; which types never get used.
- Median thought size; manual split/merge/rewrite corrections caused by poor granularity.
- Working-set rebuild frequency; time to re-orient on re-entry.
- Pin usage: how many thoughts get pinned, whether pins go stale or everything ends up pinned (both are granularity signals — thoughts too small to be landmarks), and whether re-entry starts from the pinned rail.
- Whether the absence of chat is felt, and where.

### Success criteria (directional, not statistical)

- Pending agent content is never mistaken for accepted thought.
- Proposal review feels like thinking or editing, not clerical cleanup.
- At least two agent operations are meaningfully useful.
- Re-entry works from the graph alone — no transcript-reading urge.
- No single granularity or ontology problem repeatedly blocks the workflow.

### Decision rules

- **Continue** if the success criteria above hold during dogfood — especially that re-entry works from the graph alone and at least two operations earn their keep.
- **Revise** if durable state helps but review, granularity, relation types, or the card interface create recurring friction.
- **Stop or rethink** if a chat baseline would match comprehension and re-entry while Trellis adds clerical work.

Acceptance rate alone is not success. High unexamined acceptance may indicate automation bias; extensive editing may indicate productive thinking or poor proposals — the logs must distinguish them.

## Risks and design responses

- **The graph becomes agent-generated slop.** Keep change sets staged, small, and attributable; prefer revising/connecting existing thoughts over creating new ones; make rejection cheap.
- **Thoughts too granular / still page-sized.** Every thought gets a readable statement, not just a label; tune Decompose toward independently challengeable ideas — if a result can't participate meaningfully in Challenge or Connect, it's too broad or too vague. Measure split/merge corrections.
- **Typed links collapse into "related."** Keep the vocabulary small, show labels in context, measure escape-hatch usage, remove types that fail.
- **Ratification becomes exhausting.** Keep change sets small, group dependent operations, support keyboard review. Do not remove review friction before learning which decisions create understanding.
- **Spatial clutter.** The canvas only ever shows the working set; layout is view-specific; provide a reset/arrange action. Never render the whole knowledge base.
- **Context feels opaque despite the working set.** Show a compact "using: …" summary before an operation runs; attach each rationale to the thoughts it used.

## Out of scope (v0)

Threads and branch/merge, chat surfaces, Synthesize, argument-map and board views, >2 zoom levels, multi-agent, background/long-running tasks, web research or source ingestion, multi-user collaboration, sync/mobile, auth/deploy, editing-in-outline, automatic restructuring of accepted knowledge, large or user-configurable ontologies.

## Decisions deliberately deferred

The final ontology; the long-term storage/event model; local-first vs. cloud-first; whether canvas or another projection is the mature default; autonomous agent permissions; collaboration semantics; migration from existing PKBs.

## Recommended first build

Start with Phase 0 as a polished, deterministic vertical slice. The first artifact is not a generic graph editor or an agent chat wired to a database — it is the **proposal-review loop**, demonstrated with a seeded graph and the full capture-to-re-entry scenario. That is the smallest prototype capable of testing what is actually new about Trellis.
