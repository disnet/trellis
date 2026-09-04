# Trellis: Design Doc

*A synthesis of `fable-brainstorm.md` and `gpt-brainstorm.md`, responding to `brainstorm-prompt.md`, plus a plan for a first prototype.*

## The problem

Current interfaces for "thinking with agents" are stuck in the chatbot paradigm: even when the agent acts, the result is presented as a chat log. The transcript grows, the human loses track, and the burden of keeping the right things in the agent's context falls on the person. Existing PKB tools (Obsidian, Notion, Roam) were designed pre-agents, and their agent integrations feel bolted on.

The prompt's core requirements:

- Support non-linear thinking by the human
- Don't drown the human in walls of text
- Present and allow manipulation of chunks — something like Obsidian pages, but better

## Where the two brainstorms agree

Both docs independently arrive at the same design break, stated most sharply in the Fable doc: **the transcript is history, but thinking needs state.** Choosing the transcript (chat) or the document (Obsidian/Notion) as the primary artifact is the root mistake; everything else follows from fixing it.

The shared conclusions:

1. **The primary artifact is a persistent graph of thought objects.** Not documents, not conversations. Both the human and the agent operate on this graph.

2. **The agent's output is a change to the graph, not prose.** "Found 7 related notes, proposed 3 connections and one merge" — you inspect a diff, you don't read an essay. Language is produced *inside* the structure, it isn't the structure.

3. **The agent proposes; the human ratifies.** Agent contributions sit in a staging state (like tracked changes / PRs for thought) until deliberately accepted. This friction is the point: ratification is where the thinking happens. A PKB you skim but didn't author isn't yours.

4. **The unit is smaller and more typed than a page.** A claim, question, concept, or example — with stable identity independent of its current wording, so it can be rewritten without breaking references.

5. **Links are typed and meaningful** — supports, contradicts, depends-on, instance-of, supersedes — because typed links are what let the agent do real work: find contradictions written months apart, flag that a load-bearing claim is still marked tentative, notice you've reinvented a concept under a new name. The agent as *librarian*, not oracle.

6. **Every node carries provenance and status.** Who wrote it, when, from what; whether it's tentative, developing, believed, contested, or retired. Agent-generated material stays visibly distinct until adopted. Concepts age visibly.

7. **Chat still exists, but as compost.** An ephemeral scratch surface attached to the work, distilled into the graph when it ends. The transcript survives only as provenance; you never need to read it again.

8. **Views are projections, not containers.** The same objects render as outline, canvas, argument map, board, or document on demand. "Show me everything downstream of this assumption" produces a view, not an essay. Structure is not encoded in presentation.

## What each doc uniquely contributes

**From the Fable doc:**

- **Selection is context.** You point at a node, cluster, or view, and that region *is* what the agent works within. This inverts the chat-era context problem and makes non-linear jumping cheap — you jump, the agent follows, no re-explaining. Long-running agent tasks post results back to the graph instead of blocking a turn-taking loop.
- **The division of labor that makes typed links viable:** the human mostly just writes; the agent maintains the types. Typed ontologies historically collapse into "related" when humans must maintain them — this is the bet that avoids that.

**From the GPT doc:**

- **The working set as the central UI.** Two graphs: the huge durable one (everything you've ever thought) and a small explicit one (what we're attending to right now). Both human and agent manipulate it — drag things in, fade subtrees out ("don't consider implementation yet"). Context becomes a visible, manipulable UI object rather than hidden prompt engineering. This is the concrete mechanism behind "selection is context."
- **Semantic zoom.** Every thought has multiple resolutions — a title, a sentence, full detail with evidence and history — and the agent maintains these renderings. Chat has exactly one zoom level (everything, chronologically), which is maximally wrong for thought. Zoom is the strongest answer to "don't drown me in text."
- **Operations as the interaction vocabulary.** Develop, challenge, connect, decompose, merge, research, compress, reframe — invoked on a selection, replacing the open-ended prompt box for most interactions.
- **Threads with branch/merge.** "Wait, this reminds me of X" spawns a branch that inherits relevant context; insights get promoted back to the main graph. Solves non-linear thinking without derailing or losing context.
- **Agent memory as human-visible structure.** Returning to a topic after six months, the agent doesn't say "we discussed this" — it surfaces the relevant objects at the edge of your workspace. Memory the human can see, rather than a richer agent context alongside an impoverished human one.

## The synthesized model

**Product metaphor: a shared cognitive workspace.** Human and agent jointly manipulate a persistent world of concepts; documents, chats, canvases, and outlines are temporary lenses over it.

Primitives (GPT doc's six, refined by the Fable doc's constraints):

| Primitive | What it is |
|---|---|
| **Thought** | Durable unit (claim / question / concept / example / evidence) with stable identity, status, and multiple resolutions |
| **Relation** | Typed edge: supports, contradicts, depends-on, instance-of, supersedes, refines, related |
| **Working set** | The explicit, manipulable "what we're attending to now" — the agent's context window made visible |
| **Operation** | What human or agent does to the graph (create, connect, split, merge, challenge, develop…) |
| **Proposal** | An agent-authored change awaiting ratification (accept / edit / reject) |
| **View** | A disposable projection of some subset (canvas, outline, argument map, board) |

Meta-property on everything: **provenance** (author, time, source, revision history).

A canonical session: you drop a messy paragraph into scratch. The agent responds: "this contains two claims and a question; the second claim contradicts a node from March — reify?" You accept one, edit one, reject one. Later you pull three clusters into the working set and invoke *Challenge* on the region. A proposed node linked as `contradicts` appears at the edge, visually marked as unratified. You decide whether it earns a place.

## Open problems (to be tested by the prototype)

1. **Granularity.** Too small and it's a database; too big and it's Obsidian again. What causes one thought to become two? The GPT doc calls this the "what is a file?" question for the whole design — the prototype should treat it as the primary research question.
2. **Do typed links survive contact with messy real thought,** or collapse into "related"? The bet: they survive *if the agent maintains them*.
3. **Crowding.** How do we keep agent-generated structure from drowning out the human's own? (Ratification friction + visible provenance are the proposed answers; the prototype tests whether they're enough or just annoying.)
4. **Ratification fatigue.** If every agent action needs approval, does the staging area become an inbox you resent? What's auto-acceptable (link-type maintenance?) vs. what must be deliberate (new claims)?

---

# Prototype plan

## Goal

The smallest system that tests the core loop: **messy input → agent-proposed structure → human ratification → durable graph → agent operating on selections of that graph.** Explicitly *not* a product; it's an instrument for answering the open problems above.

## In scope (v0)

1. **Thought objects** — kinds: claim, question, concept, example. Fields: id, kind, title (one-line resolution), body (full resolution), status (tentative / developing / believed / contested / retired), provenance (human vs. agent, timestamps, revision history).
2. **Typed relations** — supports, contradicts, depends-on, instance-of, supersedes, related.
3. **Scratchpad → distill.** Paste/write messy text; the agent proposes thoughts + relations extracted from it, including links to existing nodes and flagged contradictions.
4. **Proposal queue with ratification.** Every agent change is a proposal; UI affords accept / edit-then-accept / reject per item. Nothing agent-authored enters the graph silently.
5. **Working set canvas.** A spatial surface holding a subset of thoughts (cards). Drag thoughts in/out; cards show title-level resolution, expand to body (two-level semantic zoom). Agent proposals appear at the edge, visually distinct.
6. **Selection-scoped operations.** Select one or more cards, invoke: **Develop · Challenge · Connect · Find contradictions**. The working set (plus 1-hop neighbors) is exactly the agent's context — no hidden retrieval.
7. **One secondary view: outline.** A generated, read-only projection of the working set's neighborhood, to prove views-as-projections.

## Out of scope (v0)

Threads/branch-merge, argument-map and board views, full semantic zoom (>2 levels), multi-agent, background/long-running tasks, sync/multi-device, editing-in-outline, auto-splitting of thoughts. All deferred until the core loop proves out.

## Architecture

Local-first, single user, boring stack:

- **App:** TypeScript + React + Vite. Canvas via absolutely-positioned cards + SVG edges (no heavy graph library until needed; positions are per-working-set, not global knowledge).
- **Storage:** SQLite via a thin Node (Hono or Express) server. Tables: `thoughts`, `relations`, `proposals`, `revisions`, `working_set_items` (with x/y), `scratch_notes`.
- **Agent:** Claude via the Anthropic SDK (default to the latest model, e.g. `claude-sonnet-5` for cost during iteration), server-side. Structured outputs: every agent call returns a list of proposed operations (`create_thought`, `create_relation`, `update_status`, `flag_contradiction`) as JSON — never prose-first. Context assembly is deterministic: serialize the working set + 1-hop neighborhood + the invoked operation.
- **No auth, no deploy** — runs on localhost.

### Key design decision embodied in code

The agent endpoint's response type is `Proposal[]`, not `string`. There is no chat completion surfaced anywhere in the UI in v0 — if the loop feels dead without free-form conversation, that itself is a finding (the docs predict scratch-chat is needed as compost; v0 tests how far structure-only interaction goes, and attaching ephemeral chat to a thought is the first v0.1 candidate).

## Milestones

1. **Graph skeleton (no agent).** Schema, CRUD for thoughts/relations, working-set canvas with drag + expand/collapse, outline projection. *Exit: you can build a small graph by hand and it's pleasant to manipulate.*
2. **Distill loop.** Scratchpad → agent proposals → ratification queue → graph. *Exit: paste a real messy paragraph of your own; the proposed decomposition is worth ratifying more often than not.*
3. **Selection-scoped operations.** Develop / Challenge / Connect / Find-contradictions on selections; proposals land at the canvas edge. *Exit: "Challenge this region" produces a contradicts-linked proposal you actually consider.*
4. **Dogfood + judge.** Use it for a real thinking project (e.g. this design itself) for 1–2 weeks. Log: ratification accept/edit/reject rates, which relation types actually get used, median thought size, how often the working set is rebuilt.

## What the prototype must answer

- Does ratification feel like thinking or like clearing an inbox? (accept-without-reading rate is the smell)
- What granularity do thoughts settle into when a real person uses it?
- Which link types earn their keep; which collapse into `related`?
- Is working-set-as-context enough, or does the agent need retrieval over the full graph to be useful?
