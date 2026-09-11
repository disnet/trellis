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
  working set, its 1-hop neighborhood, and their side discussions. Connect and
  Challenge also disclose thoughts retrieved by graph-wide relevance search.
  These operations return structured change sets. Output is validated
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
- **Prose view** — turn a group into an Overview, Paper, Blog, or Polemic using
  the selected agent. Inline thought references open the Inspector while you
  read. Treatments are saved separately from the graph, with a history of
  drafts kept for each group and style.
- **Activity view** — the agent log, surfaced. Every model call (operations and
  prose, across all graphs) with its adapter, model, outcome, latency, token
  usage, and any error — rate limits (with retry-after when the API sends it),
  missing credentials, invalid output. Filter to problems,
  and expand a row for the full error, request, and raw model output.

## Discuss a thought

Open **Discuss** in the Inspector, or on a proposed thought in the proposal tray.
Go back and forth using the selected model without creating proposals or changing
the graph. Messages persist, failed replies can be retried, and proposed-thought
discussions follow acceptance and undo. Reviewed proposals retain access to their
discussions under **Reviewed → Thought discussions**.

Choose **Propose thoughts** when ready to turn a discussion into a change set for
review, or use the existing revision / proposal edit controls to write changes
yourself. Decompose, Develop, Challenge, and Connect automatically receive recent
discussion excerpts attached to thoughts in their context, including discussions
on pending proposals originating from those thoughts. Each excerpt contains the
newest 24 messages within 24,000 characters; omitted history is labeled, and the
full thread remains readable. The proposal tray discloses the exact excerpts used.
Unrelated graph conversations are excluded. Chat calls appear in Activity and
work with all four model providers; offline replies are deterministic fixtures.

## Read a group as prose

Choose **Prose** in the view switcher, choose a group, select a style, optionally
add **Writing guidance** (such as “focus on the practical implications”), and click
**Generate**. Use **Saved drafts** to reopen a treatment from any group in the
current graph. Prose remembers your group and style when you switch views. The active group is preselected; from All thoughts, choose a group
explicitly. Generation uses that group's thoughts and internal relations.
Overview is the default; Paper gives a formal treatment, Blog a conversational
one, and Polemic a pointed argument that still preserves uncertainty in its
sources.

References are optional and appear only where useful. Descriptive links use
`[[description|thought-id]]` or `[description](<thought-id>)`; existing
`[[thought-id]]` links still work. Click a reference to inspect its statement, relations, and
history without leaving the prose. Switching styles opens the newest saved
draft for that style. **Generate new draft** adds to that group and style's
history; browse earlier drafts with the Newer/Older controls above the title,
and delete the ones you no longer need.
Drafts and their writing guidance survive reloads and show a notice when their source material changes.
They are agent-authored reading artifacts; generating one does not create or
revise thoughts, relations, or proposals. Offline fixtures also support this
flow for testing without a model call.

## Publish a garden

Open **Publish garden…** in the graph menu to put a reviewed selection of the
graph into your own atproto repository and render it as a public website at
`/garden/<handle>`: an essay backed by thought permalinks with visible status,
sources, provenance, and public revision history. Sign in with OAuth through
your own PDS (an app password remains the fallback). Publication is a separate,
deliberate act on a reviewed diff — conversations, notes, proposals, writing
guidance, and unpublished history stay local. See
[docs/garden-publishing.md](docs/garden-publishing.md).

## Run

```sh
npm install
npm run dev
```

Use the model switcher beside the agent operations to choose Anthropic API,
Claude Code, Codex, or offline fixtures. Choose a preset or enter a model ID,
and set the reasoning effort (`low` … `max`) the model should spend before
answering; the selection applies to all operations and survives reloads in this
browser. Environment settings supply the initial selection until you make a
choice.

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
- `TRELLIS_EFFORT` — reasoning effort: `low`, `medium`, `high`, `xhigh` or
  `max`. Unset leaves each provider's own default. Sent as
  `output_config.effort` (live), `--effort` (claude-cli) and
  `model_reasoning_effort` (codex-cli); dropped for Anthropic API models that
  predate the parameter, such as Haiku 4.5.
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

## Desktop (Tauri 2, macOS 13.5+)

The desktop app bundles the SvelteKit server, Node runtime, and native SQLite
addon. End users do not need Node, npm, Rust, or a separately running server.
Claude Code and Codex remain optional, separately installed CLIs.

To develop or package on a Mac, install Rust and Xcode Command Line Tools, then:

```sh
npm install
npm run desktop:dev      # Build the frontend and open the desktop app
npm run desktop:build    # Create the .app and .dmg for this Mac's architecture
npm run desktop:build -- --bundles app  # App bundle only
```

Artifacts land in `src-tauri/target/release/bundle/`. Desktop development uses
a production frontend build; restart `desktop:dev` to pick up frontend changes.
Use `npm run dev` for browser development with hot reload.

On first launch, the model menu opens local agent setup. You can reopen it at
**model menu → Set up local Claude / Codex**:

1. Install either CLI using its linked official instructions.
2. Sign in from Terminal (`claude auth login` or `codex login`).
3. Choose **Check again**, then **Use Claude Code** or **Use Codex**.
4. Choose a model in the same menu, or keep the provider default.

Setup discovers CLIs on PATH and in common local, Homebrew, Volta, npm-global,
and nvm locations, including when launched from Finder. On macOS, it also
loads the login shell’s CLI paths and authentication settings (including
`CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CONFIG_DIR`). These values stay in memory,
are shared by status checks and generation, and are never written to Trellis
settings or returned to the UI. **Check again** refreshes the shell settings. Expand **Executable
path** to save an absolute path (paths containing spaces are supported).
Checks only run version and authentication-status commands; they do not make
model calls. Login credentials stay managed by the CLI. Offline fixtures are
the initial desktop default, so you can explore the app before connecting.
A successful sign-in check confirms local credentials; model access and expired
credentials can still cause an actual operation to fail.

Desktop data lives in `~/Library/Application Support/com.trellis.desktop/`:
`trellis.db` holds the graph and `settings.json` holds executable paths and the
selected provider/model. These survive app upgrades and changing local ports.
Browser development continues to use `data/`. To bring an existing development
graph into desktop, stop both apps and use SQLite's backup command to copy it
to the desktop data directory before launching; preserve any existing desktop
database first. Never copy a live database without its WAL or a SQLite backup.
Appearance and panel sizes currently use webview local storage, so they can
reset when the desktop server receives a different port.

The backend binds only to `127.0.0.1` on an OS-assigned port and requires a
random per-launch HttpOnly session cookie. It rejects foreign origins and
stops when the desktop process exits. External links open in the default
browser. No general-purpose Tauri shell commands are exposed to the page.

```sh
npm run check
npm test
npm run test:desktop     # Build + localhost boot/auth/persistence/shutdown check
```

The packaging script copies the current Node executable and installed native
addons, so build on the target architecture using a self-contained Node
installation (the official Node distribution is suitable). Its LICENSE file
is included; set `TRELLIS_NODE_LICENSE` if it lives outside the Node installation.
Cross-compilation
and Windows/Linux installers are not configured. The default macOS artifacts
are for local use; distribution requires Apple signing and notarization,
including the bundled Node executable and native addons.

References: [Tauri Node sidecars](https://v2.tauri.app/learn/sidecar-nodejs/),
[SvelteKit Node adapter](https://svelte.dev/docs/kit/adapter-node),
[Codex login](https://developers.openai.com/codex/cli/reference/#codex-login),
[Claude CLI authentication](https://code.claude.com/docs/en/cli-reference).
