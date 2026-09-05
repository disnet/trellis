# Trellis

An agent-native thinking workspace: a person and an agent develop a persistent
graph of thought objects, where the agent proposes small, inspectable changes
and the human ratifies them. See [docs/design.md](docs/design.md) for the full
design.

## Status: Phase 2 — live agent proposals

The graph persists in SQLite (`data/trellis.db`), and agent operations call
Claude or Codex live through model adapters that can also serve the deterministic
Phase-0 fixtures. The complete capture-to-ratification scenario works
end-to-end:

- **Canvas** of draggable thought cards with typed, rendered relations
  (overview and reading zoom levels).
- **Scratch composer** — paste messy text and *Decompose* it into proposed
  thoughts.
- **Agent operations** (Decompose, Develop, Challenge, Connect) invoked on the
  selection. Context is assembled deterministically — the selection, the
  working set, and its 1-hop neighborhood, nothing else — and the model
  returns a structured change set, never prose. Output is validated
  server-side (allowed operations, referential integrity, dependency refs,
  text limits) before it appears in the tray; invalid output gets one
  corrective retry and can never touch canonical state. Every attempt is
  logged to the `agent_calls` table (inputs, raw output, validation errors,
  latency) for evaluation.
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

Use the model switcher beside the agent operations to choose Anthropic API,
Claude Code, Codex, or offline fixtures. Choose a preset or enter a model ID;
the selection applies to all operations and survives reloads in this browser.
Environment settings supply the initial selection until you make a choice.

Codex requires the `codex` CLI on PATH and a login (`codex login`). It runs
ephemerally in a temporary directory with a read-only sandbox, shell tools
and web search disabled, and user config excluded. Authentication still uses
your Codex login; choose an explicit model to override the CLI default.
Uses [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive/).

Anthropic API generation needs Anthropic credentials (`ANTHROPIC_API_KEY`, or an
`ant auth login` profile). Environment knobs:

- `TRELLIS_AGENT` — which adapter serves proposals:
  - unset / `live` — Anthropic API (pay-as-you-go; needs credentials).
  - `claude-cli` — shell out to the local Claude Code CLI (`claude -p`),
    billed to whatever `claude` is logged in as — for a Pro/Max login, the
    subscription. Personal-use convenience only: it needs the CLI on PATH,
    shares your interactive rate limits, may break with CLI updates, and must
    not be used for anything shared or deployed (Anthropic does not allow
    products to ride claude.ai logins).
  - `fixture` — deterministic fixtures (full review flow, no network, no
    variance).
  - `codex-cli` — local Codex CLI (`codex exec`), using its existing login.
- `TRELLIS_MODEL` — model for generation (live default `claude-sonnet-5`;
  claude-cli default `sonnet`, aliases accepted; Codex uses its CLI default).
- `TRELLIS_CLAUDE_BIN` — path to the `claude` binary if not on PATH.
- `TRELLIS_CODEX_BIN` — path to the `codex` binary if not on PATH.
- `TRELLIS_DB` — SQLite path (default `data/trellis.db`; `:memory:` works).

If a live call fails (no credentials, network, invalid output after retry),
the error is surfaced as a toast, nothing is staged, and the scratch note is
preserved — invoke the operation again.

Then walk the primary scenario from the design doc: paste a paragraph into
Scratch → Decompose → accept one / edit one / reject one → Apply → select a
card → Connect → Challenge → revise the claim in the inspector → check its
history.

`npm run check` type-checks the project.
