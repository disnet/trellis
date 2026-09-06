# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Tim (the creator), dogfooding Trellis for real thinking projects. Confirmed horizon: a small number of early testers — thoughtful people who think with agents — trying the desktop app soon. First-run experience and legibility to someone without the author's context now matter; mass-market onboarding does not.

## Product Purpose

Trellis is an agent-native thinking workspace: a person and an agent develop a persistent graph of thought objects, where the agent proposes small, inspectable changes and the human ratifies them. The graph — not a document, not a chat transcript — is the primary artifact.

Success for this phase: the core loop (messy input → agent-proposed structure → human ratification → durable graph → agent operating on selections of that graph) proves that people think more effectively this way than in chronological chat, and the app is legible enough for early testers to reach that loop on their own.

## Positioning

Graph-editing agent operations return structured, validated change sets that stage for review, and model output can never write directly to accepted thought state. There is no chat surface. Prose is a derived reading view of a group, saved separately from that state. Neighboring products preserve the transcript (chat tools) or the document (Notion/Obsidian); Trellis preserves ratified thought state with full provenance — who authored each revision, and who accepted it.

## Operating Context

- Local-first, single-user. Browser development (`npm run dev`) plus a Tauri 2 desktop app for macOS 13.5+ that bundles the SvelteKit server, Node runtime, and SQLite. The desktop app is a delivery mechanism, not a design commitment: one web design language across browser and desktop (confirmed).
- Agent operations run through model adapters: Anthropic API, local Claude Code CLI, local Codex CLI, or deterministic offline fixtures. Fixtures keep the full review flow demoable and testable without network access; they are the initial desktop default.
- Storage is SQLite (browser dev: `data/trellis.db`; desktop: `~/Library/Application Support/com.trellis.desktop/`). The desktop backend binds to localhost only with per-launch session auth.
- Usage is real thinking work: pasting messy paragraphs into Scratch, decomposing them, reviewing proposals, revisiting a graph after days away (re-entry summary), and alternating between isolated graphs on different topics.

## Capabilities and Constraints

Shipped surfaces: whole-graph infinite pan/zoom canvas of draggable thought cards with typed rendered relations (one canonical layout per graph, two zoom levels), working sets as optional lenses over that canvas (members highlighted, the rest dimmed; base state is "All thoughts", no lens), Scratch composer, Inspector (statement, relations, revision history, provenance, human revision), proposal tray (accept / edit-then-accept / reject, partial acceptance, dependency blocking with cascade rejection, undo of last applied change set, disclosed "consulted" list), Outline projection, Browse and Library views, re-entry panel, pins with pinned rail, multiple isolated graphs with a switcher, model switcher, local-agent setup flow, appearance menu with font switching, JSON export, and web fetch/search for agent operations.

Agent operations: Decompose, Develop, Challenge, Connect — invoked on a selection; context assembly is deterministic (selection + active working set + 1-hop neighborhood; Connect/Challenge additionally run a deterministic graph-wide relevance search whose results are disclosed in the tray and recorded on the change set as `consulted` — retrieval is never invisible). Output is validated server-side (allowed operations, referential integrity, dependency refs, text limits) with one corrective retry; every attempt is logged to `agent_calls` for evaluation.

Prose view: choose an explicit group and generate an Overview, Paper, Blog, or Polemic with the selected model. Treatments and their optional writing guidance are persisted per group and style, with a browsable history of drafts. A Saved drafts picker reopens treatments across the active graph. Optional descriptive inline references open thoughts in the Inspector; prose should read naturally without mechanically discussing or citing notes. Context consists of the group's thoughts and internal relations; prose does not retrieve outside material. Treatments are visibly agent-authored, carry source provenance, and indicate when their sources change. They are derived reading artifacts and never become accepted thoughts through generation alone.

Hard constraints future work must preserve:
- Model output never mutates canonical graph state; applying a change set is an explicit user action.
- Pending agent content must always be visibly distinguishable from accepted thought.
- Card coordinates, collapsed state, and view layout belong to projections (the per-graph canvas layout, working-set membership), never to thoughts or relations.
- Any graph-wide retrieval feeding an agent operation must be disclosed to the person (marked in context, recorded on the change set) — no invisible retrieval.
- Working-set membership, pins, and other attention state are direct human actions — instant, never routed through the proposal tray.
- The desktop app exposes no general-purpose shell commands to the page; CLI credentials stay managed by the CLIs.

Terminology (bound): thought (claim / question / concept / example / prediction / evidence), relation (`supports`, `contradicts`, `depends_on`, `example_of`, `supersedes`, `related_to`), change set, working set, scratch, ratification, provenance, pin, graph, re-entry.

Documentation status (confirmed): **code is truth; docs lag.** `docs/design.md`'s thesis, principles, and conceptual model still bind, but its phase plan and v0 out-of-scope list are historical — the shipped app (Browse, Library, pins, tabs, desktop, web fetch/search) defines current scope. `docs/post-prototype-direction.md` is exploratory, not commitment.

## Brand Commitments

The name Trellis. No other confirmed voice, identity, or visual commitments were made during init; the incumbent implementation carries the current design language.

## Evidence on Hand

- `docs/design.md` — canonical thesis, principles, conceptual model, evaluation plan (phase plan historical per above).
- `docs/post-prototype-direction.md` — exploratory "thinking and commitment system" direction.
- Deterministic proposal fixtures and a seeded graph (`src/lib/seed.ts` area) — the full review flow is demoable offline.
- `agent_calls` logging (inputs, raw output, validation errors, latency) for evaluating operations.
- No testimonials, case studies, benchmarks, or external users yet — do not fabricate any.

## Product Principles

1. **State over transcript.** The durable result of agent work is an inspectable diff to shared thought state, never prose in a timeline.
2. **The agent proposes; the human ratifies.** Ratification friction is where thinking happens; it may be tuned but never silently removed for agent-authored knowledge.
3. **Selection is context.** What the agent will consider is visible and human-steered; no hidden retrieval, no opaque memory.
4. **Structure without premature bureaucracy.** Capture stays freeform; the system proposes structure afterward and never requires classification up front.
5. **Legible to a newcomer.** With early testers on the horizon, every surface should be understandable without the author's context — especially what is pending versus accepted.

## Accessibility & Inclusion

Proposal and status indicators must not rely on color alone (established in design.md and binding on all surfaces). No other product-specific requirement established yet.
