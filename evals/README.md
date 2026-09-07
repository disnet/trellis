# Evals

Decompose-quality evals: run the same input through a matrix of models and
efforts, export each resulting graph, and compare shape/size metrics.

## Run the matrix

```sh
node evals/run.mjs                          # fable, sonnet, astra, sol × low, high
node evals/run.mjs --cases fable --efforts low,high
node evals/run.mjs --input "https://example.com/some-essay"
node evals/run.mjs --cases fixture          # offline smoke test of the harness
```

By default the harness spawns its own dev server on port 5199 with a throwaway
database, so runs never touch `data/trellis.db`. Pass
`--server http://localhost:5173` to reuse a running server instead (graphs get
a timestamp suffix there to avoid name collisions).

Cases run sequentially — invoke and export operate on the server's active
graph, so parallel runs would race.

Results land in `evals/runs/<timestamp>/`:

- `trellis-<case>-<effort>.json` — the standard per-graph export
- `summary.json` — selection, wall time, adapter latency, usage, attempts, and
  any validation errors per run

## Compare runs

```sh
node evals/report.mjs evals/runs/<stamp>/          # one run
node evals/report.mjs evals/*.json                 # the original manual exports
node evals/report.mjs evals/runs/A/ evals/runs/B/  # before/after a prompt change
```

Reports thought/relation counts by type, statement and title lengths, and
duration. Length metrics are the ones to watch after concision-oriented prompt
changes; coverage (thought count and types) should hold steady.

The loose `trellis-*.json` files at the top level are the original manually
exported runs from 2026-09-07 (pre-concision prompt), kept as the baseline.
