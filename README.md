# Trellis

> **⚠️ Pre-alpha.** Trellis is an early experiment under active development.
> Expect rough edges, breaking changes, and data-format churn. Don't trust it
> with anything you can't afford to lose.

Trellis is an agent-native thinking workspace. You and an AI agent develop a
persistent graph of small "thought" cards together: the agent proposes
inspectable changes, and you accept, edit, or reject each one. Nothing the
agent does touches your graph until you ratify it.

## Download

Every green build of `main` publishes a release, so these links always point at
the newest one:

- **macOS (Apple silicon)** —
  [Trellis-macos-arm64.dmg](https://github.com/disnet/trellis/releases/latest/download/Trellis-macos-arm64.dmg)
- **Windows (x64)** —
  [Trellis-windows-x64-setup.exe](https://github.com/disnet/trellis/releases/latest/download/Trellis-windows-x64-setup.exe)
- [All releases](https://github.com/disnet/trellis/releases), with the commit
  each build came from.

The builds are unsigned: macOS blocks the first launch, so open the app from
the right-click menu, and Windows SmartScreen needs *More info*, then *Run
anyway*. To build from source instead, see [Run it](#run-it).

If Trellis fails to start it says why, and writes the details to
`trellis.log` in its data folder — `%APPDATA%\com.trellis.desktop` on Windows,
`~/Library/Application Support/com.trellis.desktop` on macOS.

## What it does

- **Canvas** — a spatial graph of draggable thought cards connected by typed,
  rendered relations.
- **Agent operations** — paste messy text and *Decompose* it into thoughts, or
  invoke *Develop*, *Challenge*, and *Connect* on a selection. Results arrive
  as structured proposals in a review tray, never as direct edits.
- **Discussion** — chat with the agent about any thought without changing the
  graph, then turn the conversation into proposals when you're ready.
- **Prose view** — render a group of thoughts as an overview, paper, blog
  post, or polemic, with inline references back to the underlying thoughts.
- **Provenance** — every thought tracks its revision history and whether it
  was human- or agent-authored; every model call is logged and inspectable in
  the Activity view.
- **Publishing** — put a reviewed selection of the graph into your own atproto
  repository and render it as a public garden site
  ([docs/garden-publishing.md](docs/garden-publishing.md)).

Model providers: Anthropic API, the local Claude Code CLI, the local Codex
CLI, or deterministic offline fixtures (no network, useful for trying the app
and for tests).

## Run it

```sh
npm install
npm run dev
```

A desktop app (Tauri 2, macOS and Windows) bundles everything so end users
don't need Node or a running server:

```sh
npm run desktop:dev      # Open the desktop app
npm run desktop:build    # Package for this machine
```

`npm run check` type-checks; `npm test` runs the test suite.

## Learn more

- [docs/design.md](docs/design.md) — the full design
- [docs/overview.md](docs/overview.md) — project overview
- [docs/garden-publishing.md](docs/garden-publishing.md) — publishing a garden
