# Brief 115 — Farm client `worker/` → `net/` rename, `Worker*` protocol renames, run-sim probe hygiene

status: todo
source: 2026-07-15 wide structure survey. Three mechanical hygiene items, batched because each is
a pure rename/move with zero behavior change.

## Context

1. **The Farm client's transport dir is a fossil.** Brief 58 moved the sim out of the in-browser
   Web Worker to the Node WebSocket server, but the client still keeps its WebSocket client under
   [games/farm/client/src/worker/sim-client/](../../../../games/farm/client/src/worker/sim-client/),
   and [architecture.md](../../../wiki/architecture.md) has to explain the name away.
2. **The protocol types still say `Worker`.** [@farm/sim-core/protocol](../../../../games/farm/sim-core/src/protocol/index.ts)
   exports `WorkerInbound` / `WorkerOutbound` / `WorkerInitMsg` (+ any siblings in `messages.ts`) —
   architecture.md itself flags these as "the historical `Worker*` names". They describe a
   transport-neutral sim↔client contract carried over WebSocket (and, in tests, in-process).
3. **`tools/run-sim/src/` carries 12 fossilized one-off diagnostics** (`probe-42.ts` …
   `probe-travel-nopath.ts`, `probe-perf.ts`, `probe-snapshot-size.ts`). No npm script references
   any of them (verified 2026-07-15). They bury the real runner modules (`env`, `format`,
   `report`, `run-core`, `determinism*`).

## Scope

1. Rename `games/farm/client/src/worker/` → `games/farm/client/src/net/` (keep the `sim-client/`
   module-directory + barrel inside it). Update all importers.
2. Rename the protocol types: `WorkerInbound` → `SimInbound`, `WorkerOutbound` → `SimOutbound`,
   `WorkerInitMsg` → `SimInitMsg` (mirror the pattern for any other `Worker*` in
   `protocol/messages.ts`). Rename consistently across `@farm/sim-core`, `@farm/client`,
   `@farm/server`, `@tool/run-sim`. No deprecated aliases — nothing external consumes these.
3. Move the 12 `probe-*.ts` files to `tools/run-sim/src/probes/` (they are historical per-brief
   diagnostics; keeping them costs nothing once they stop cluttering the runner). If any fails
   typecheck against current sim-core APIs, delete it instead of fixing it — git history is the
   archive.

## Constraints

- **Grep-complete renames** (`grep -rnw` per symbol / path fragment, zero hits after), not
  code-graph-driven — the graph is explicitly not the authority for rename completeness.
- Renames only — zero runtime logic change. `git mv` for the directory moves, and remember the
  [git-mv-after-edit trap](../../../wiki/architecture.md): re-`git add` the new path if a file is
  edited after being moved.
- Farm determinism is untouched by construction (no sim logic edits), but run the gate anyway —
  it's cheap and proves nothing leaked.

## Acceptance

- Zero `src/worker/` references and zero `Worker(Inbound|Outbound|InitMsg)` hits outside git
  history; `npm run typecheck` 0; full suite green; `CHECK_DETERMINISM=1` MATCH on one seed.
- `npm run dev` smoke: Farm client connects to the server and renders (transport rename proven
  live, not just by types).
- `tools/run-sim/src/` top level contains only runner modules; probes (if kept) live under
  `probes/`.
- [architecture.md](../../../wiki/architecture.md)'s "historical Worker* names" caveat and the
  `WorkerInitMsg.pathfinderWasm` mention updated at closeout.
