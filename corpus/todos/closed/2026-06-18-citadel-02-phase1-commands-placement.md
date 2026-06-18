---
title: "Citadel Phase 1 — command queue + footprint placement"
created: 2026-06-18
status: done
tags: [citadel, phase1, engine-substrate, placement]
---

> **DONE 2026-06-18** (merged to main). Engine substrate `@engine/core/commands`
> (`CommandQueue<C>` FIFO + `CommandSystem<C>` drain/dispatch per tick — ordered log =
> save/replay/MP) and `@engine/core/placement` (`OccupancyGrid`, `checkPlacement` w/
> injected terrain predicate + unused adjacency hook, `rebuildWalkable`). Game: House 2×2
> ECS building, `placeBuilding`/`demolish` handlers, `BuildingSnapshot[]`, client toolbar +
> tile-snapped valid/invalid ghost, click→command→worker→applied-next-tick. Gate:
> sim-core 16/16 (incl. replay-determinism + walkable rebuild), engine 156/156 incl.
> palette guard, typecheck clean, vite build OK, headless exits 0. See log.md.

# Phase 1 — Command queue + placement

The first playable interaction: pick a building, ghost-preview follows the cursor, click
to place it. Introduces the two pieces of new **engine** substrate. Gates Phase 2.

## Scope

### Engine substrate (promote to `@engine/*`)
- **Command-queue protocol.** Generic main→worker command channel. Main thread posts `{type, payload}` (e.g. `placeBuilding`, `demolish`). Worker drains the queue at a fixed point each tick and applies deterministically. The ordered command log is the canonical save/replay/MP-sync artifact — design it as such. No-op if empty.
- **Footprint placement system.** Multi-tile footprint occupancy on the grid; placement-validity check (fits in bounds? all tiles clear? no overlap? **terrain rule** — no building on water/rough; resource buildings require the right node under them; adjacency hook for "road-adjacent" later); apply placement/removal; **rebuild the walkable grid** on change.

### Game (citadel)
- One placeable building type (e.g. House) with a footprint (e.g. 2×2), as an ECS entity + occupancy.
- **Placement UX:** toolbar pick → translucent footprint **ghost** follows cursor, tinted **valid/invalid** per the validity check → click emits a `placeBuilding` command. **Demolish mode** emits `demolish`. (Drag-painting deferred to Phase 2 for roads/walls.)
- Snapshot carries placed buildings so they render (as placeholder rects).

## Decisions (grilled 2026-06-18)
- Command queue into the worker; log = save/replay/MP-sync (APR #4, #13).
- Multi-tile footprints, validity-checked, walkable rebuild on change (APR #5).
- **Terrain-aware validity** — placement respects the Phase-0 terrain (no water/rough builds; resource buildings need their node) (APR #22).
- Ghost preview + click-to-place; demolish mode; drag is Phase 2 (APR #21).
- Substrate is generic → lives in `@engine/*`, not citadel-sim-core.

## Done when
- Player places + demolishes the building type via ghost/click; invalid placements are visibly rejected.
- All placement flows through the command queue (no direct world mutation from main thread).
- Walkable grid reflects placed footprints (verify via a path query around a building).
- Deterministic: same command log replays to identical state (fast multi-seed/replay check). Typecheck + palette guard pass.
