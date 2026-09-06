# Trellis: an overview

Trellis is an agent-native thinking workspace. A person and an agent develop a
persistent graph of thought objects together: the agent proposes small,
inspectable changes to shared thought state, and the person ratifies them. The
graph — not a document, not a conversation — is the primary artifact.

This document describes the thesis and principles behind Trellis. For the full
design, including the conceptual model and technical contract, see
[design.md](design.md).

## The problem

Current tools for thinking with agents make the wrong artifact durable:

- **Chat products preserve the transcript.** Chronology records what happened,
  but poorly represents the current state of an idea. The transcript grows, the
  human loses track, and the burden of keeping the right things in the agent's
  context falls on the person.
- **Note-taking products preserve pages.** Pages are fine reading and writing
  surfaces, but they were designed pre-agents; agent features are bolted onto
  documents and do not create shared, manipulable thought state.
- **Agent memory is invisible.** The agent accumulates context while the person
  still has to reconstruct prior thinking, and can't distinguish their own
  beliefs from plausible-sounding agent output.

The root mistake is choosing the transcript (chat) or the document
(Obsidian/Notion) as the primary artifact. **The transcript is history, but
thinking needs state.**

## Thesis

> People think more effectively with an agent when the agent proposes small,
> inspectable changes to shared thought state instead of replying with prose in
> a chronological chat.

The core loop: messy input → agent-proposed structure → human ratification →
durable graph → agent operating on selections of that graph.

Concretely: you paste a rough paragraph, and instead of an essay in reply you
get a pending change set — "this contains two claims and a question; the second
claim contradicts a thought from March." You accept one operation, edit
another, reject a third. What survives is a graph of thoughts you actually
endorse, each with typed relations to the rest of your thinking, each carrying
a record of who wrote it and who accepted it. When you return days later, you
re-enter through the current state of your thinking — the central claims, the
open questions, what changed — not by rereading a conversation.

## Principles

1. **State over transcript.** The principal result of agent work is a diff to
   persistent state — "found 7 related notes, proposed 3 connections and one
   merge" — which you inspect, not read. Language is produced *inside* the
   structure; it isn't the structure.

2. **Selection is context — and retrieval is never invisible.** The selection
   plus the active working set defines the agent's context; you include or
   exclude thoughts directly instead of managing a hidden prompt. This makes
   non-linear jumping cheap: you jump, the agent follows, no re-explaining.
   Discovery operations, whose whole point is finding what you did *not*
   select, may consult a graph-wide relevance search — but everything consulted
   is disclosed and recorded. The system never holds an opaque memory.

3. **The agent proposes; the human ratifies.** Agent changes enter a staging
   area until deliberately accepted. This friction is the point: ratification
   is where the thinking happens. A knowledge base you skim but didn't author
   isn't yours. Nothing agent-authored enters the graph silently.

4. **Authorship is not acceptance.** Provenance records both who authored a
   revision and who accepted it. Accepting an agent proposal expresses
   endorsement, not retroactive authorship; editing one creates a
   human-authored revision derived from the proposal, with the original
   preserved.

5. **Stable identity over stable wording.** A thought can be revised,
   summarized, or displayed in several views without breaking references to it.

6. **Typed links, agent-maintained.** Typed relations — supports, contradicts,
   depends on, example of — are what let the agent do real work: find
   contradictions written months apart, flag that a load-bearing claim is still
   tentative, notice a concept reinvented under a new name. Typed ontologies
   historically collapse into "related" when humans must maintain them; they
   survive when the human mostly just writes and the agent maintains the types.

7. **Human-visible memory.** Long-term memory appears as inspectable
   structure — a relevant prior claim surfaced at the edge of the workspace,
   not "we discussed this." The agent never holds a richer private account of
   your thinking than you can see.

8. **Structure without premature bureaucracy.** Freeform capture stays easy;
   the system proposes structure afterward. You are never required to classify
   anything while capturing it.

9. **Views are projections.** Canvas, outline, and prose are lenses over the
   same objects. Layout and presentation are not the knowledge model; a
   thought's position on a canvas is attention state, not knowledge.

10. **Chat is compost.** Useful conversation results get reified into the
    graph; the transcript survives only as provenance. Trellis has no chat
    surface at all — the agent's response type is a change set, not a string —
    and structure-only interaction carries the workflow.

## The model, briefly

Three durable primitives carry the knowledge:

- A **thought** is the unit of the graph: a claim, question, concept, example,
  prediction, or piece of evidence, with a stable identity, a status
  (tentative through believed, contested, retired), and a revision history.
  A thought expresses one idea that can be independently challenged, connected,
  or revised. Predictions carry structured confidence, leaving a calibration
  trail as beliefs update; evidence carries its source.
- A **relation** is a typed, directional edge between thoughts.
- A **change set** is an agent-authored bundle of proposed operations with
  rationale, awaiting ratification. Accepting applies new revisions; rejecting
  records the decision without touching the graph.

Everything carries **provenance**: who authored it, who accepted it, and where
it came from.

Around the durable graph sit transient structures — a **working set** that
lenses attention onto part of the graph (the agent's context window made
visible), a **scratch** surface for unstructured capture, and disposable
**views** that project the same objects as a canvas, an outline, or generated
prose.

The agent works through a small set of operations invoked on a selection:
**Decompose** messy input into atomic thoughts, **Develop** extensions and
implications, **Challenge** with objections and missing assumptions, and
**Connect** a thought to relevant existing ones. Every operation returns a
structured, validated change set — never a freeform answer — and applying one
is always an explicit human action.

## What this buys

- **Comprehension.** The current state of your thinking — what you believe,
  what's contested, what's open — is legible from the graph without rereading
  history.
- **Ownership.** Ratification keeps the graph yours. Accepted beliefs are
  always distinguishable from provisional suggestions, and agent-generated
  structure cannot drown out your own.
- **Re-entry.** Returning after days away means reading a summary of
  structural state — central claims, unresolved questions, what changed — not
  reconstructing context from a transcript.
- **Leverage.** Because the agent operates on explicit, typed structure, it
  can do work that is impossible over prose: surface a contradiction between
  thoughts written months apart, trace what a claim depends on, notice when a
  load-bearing assumption is still tentative.

## What Trellis is not

Trellis is not a chat product with persistence, and not a note-taking app with
an agent bolted on. It is not an autonomous agent that restructures your
knowledge in the background: the agent acts only when invoked, and only through
proposals you review. And the graph is not a filing system — structure exists
to serve thinking, never as an obligation during capture.

## Where it points

The same idea — thinking needs durable, inspectable state — extends beyond
intellectual work toward decisions and commitments: recording why you chose
something, what predictions the choice rested on, and whether those reasons
still hold. That direction is explored in
[post-prototype-direction.md](post-prototype-direction.md).
