# Trellis

An agent-native thinking workspace: a person and an agent develop a persistent
graph of thought objects, where the agent proposes small, inspectable changes
and the human ratifies them. See [docs/design.md](docs/design.md) for the full
design.

## Status: Phase 0 — interaction skeleton

Fixtures play the model's role; nothing is persisted. The complete
capture-to-ratification scenario is clickable:

- **Canvas** of draggable thought cards with typed, rendered relations
  (overview and reading zoom levels).
- **Scratch composer** — paste messy text and *Decompose* it into proposed
  thoughts.
- **Agent operations** (Decompose, Develop, Challenge, Connect) invoked on the
  selection, each returning a deterministic change-set fixture.
- **Proposal tray** — accept / edit-then-accept / reject each operation,
  partial acceptance, dependency blocking with cascade rejection, and undo of
  the last applied change set. Proposed content is visibly provisional
  (dashed cards at the canvas edge) until ratified.
- **Inspector** — statement, relations, revision history, provenance
  (agent-authored vs. human, edited-from-proposal), and human revision.

## Run

```sh
npm install
npm run dev
```

Then walk the primary scenario from the design doc: paste a paragraph into
Scratch → Decompose → accept one / edit one / reject one → Apply → select a
card → Connect → Challenge → revise the claim in the inspector → check its
history.

`npm run check` type-checks the project.
