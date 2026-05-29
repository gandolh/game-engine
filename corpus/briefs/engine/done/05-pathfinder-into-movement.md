# Engine Task 05 — Route the WASM Pathfinder into Real Movement

> **Resolved 2026-05-29 (audit outcome: already wired).** The audit found the
> pathfinder is *already* load-bearing — `TravelSystem.findPath()` computes real
> routes on the walkable grid and farmers walk them waypoint-by-waypoint. So the
> "wire it" work in this brief was unnecessary; only two of its sub-goals applied:
> (1) added a game-grid around-obstacle test (`travel.test.ts` "routes around the
> void") proving farmers route through the road corridor without crossing void
> tiles, and (2) corrected the stale "loaded but not yet routed into agent
> movement" claim in `architecture.md` + `open-questions.md`. No `travel.ts` /
> pathfinder source changes were needed.

## Context

[architecture.md](../../../wiki/architecture.md) states: *"The Pathfinder is **loaded at boot but not yet routed into agent movement**."* The engine ships one WASM kernel — `Pathfinder` (4-connected grid shortest-path) in `packages/engine/src/wasm/pathfinder.ts`, with tests. The game's `TravelSystem` consumes a pathfinder *conditionally* (`if (opts.pathfinder)` in `sim-bootstrap.ts`), and the walkable grid exists (`world/walkable-grid.ts`). But it's unclear whether agents actually path *around* obstacles or just walk A-to-B; the WASM kernel may be effectively idle.

This brief makes the showcase kernel load-bearing (or, if travel is intentionally straight-line, documents that and removes the dead plumbing). The engine must stay game-agnostic — the engine owns the `Pathfinder` capability; the game owns the walkable grid + travel intents.

## Goal

1. **Audit**: determine whether `TravelSystem` currently calls the WASM `Pathfinder` to produce real paths, or whether farmers move in straight lines. Confirm by reading `systems/travel.ts`, `wasm/pathfinder.ts`, and the boot wiring in `main.ts` / `sim-bootstrap.ts`.
2. **If not wired**: route travel through the pathfinder — given a start tile, a target tile, and the walkable grid, compute a tile path and have `TravelSystem` follow it step-by-step (the existing `STEP_TICKS` cadence). Farmers should visibly route around farm fences / non-walkable tiles via the roads.
3. **If intentionally straight-line**: update [architecture.md](../../../wiki/architecture.md) and [open-questions.md](../../../wiki/open-questions.md) to say so explicitly and remove the misleading "loaded but unused" claim and any dead conditional plumbing.
4. **Engine boundary**: keep `Pathfinder` generic (grid in, path out). Game-specific grid construction stays in `farm-valley/src/world/`.

## Files in scope

- `packages/engine/src/wasm/pathfinder.ts` — ALLOWED if the API needs a small ergonomic addition (e.g. returning a tile path array in a game-friendly shape). Read first; prefer no change.
- `packages/engine/src/wasm/pathfinder.test.ts` — extend if the API changes.
- `packages/farm-valley/src/systems/travel.ts` — make it consume real pathfinder output and follow the path tile-by-tile.
- `packages/farm-valley/src/systems/travel.test.ts` — assert farmers follow a multi-tile path that respects walkability (routes around a blocked tile), deterministically.
- `packages/farm-valley/src/world/walkable-grid.ts` — ALLOWED only if the grid shape the pathfinder needs differs from what's produced. Read first.
- `corpus/wiki/architecture.md` + `corpus/wiki/open-questions.md` — update the pathfinder status to match reality (whichever outcome).

## Files you must NOT touch

- `agents/**` — agents already emit `travel` intents with a `targetRegionId`; don't change how they decide to travel.
- Other engine subsystems (`ecs`, `render`, `input`, `runtime`, `sim`, `animation`, `spatial`, `persistence`).
- `world/regions.ts` (layout is fixed), `protocols/**`, `ui/**`, `render-systems.ts`.

## Determinism note

Pathfinding must be deterministic — for a fixed grid + start + goal it must return the identical path every run (stable tie-breaking in the WASM kernel). No wall-clock, no host-side randomness in path selection. This is load-bearing for the seed→replay guarantee.

## Acceptance criteria

- `npm run typecheck` (all workspaces) passes
- `npm run test` passes; engine pathfinder tests + farm-valley travel tests green
- Either: `npm run dev` shows farmers routing around fences via roads (pathfinder load-bearing), **or** the docs are corrected to state straight-line travel and the dead conditional is removed — not both half-done
- Engine package does not import anything game-specific
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Start by auditing (read `travel.ts`, `wasm/pathfinder.ts`, `walkable-grid.ts`, and the boot wiring) and report which case is true *before* large changes — the orchestrator may want to confirm direction. Then implement. Run typecheck + tests before reporting done. Report files changed, test counts, the audit finding, and anything surprising. Do not commit — orchestrator handles that.
