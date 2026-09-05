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
