---
title: "Citadel 31 — Pathfinder perf at 256² (persistent buffer / WASM)"
created: 2026-06-19
status: open
tags: [citadel, sim, perf, pathfinder, determinism, multiplayer]
---

# Citadel 31 — Pathfinder perf at 256²

**Spine position: D (needs [29](2026-06-19-citadel-29-world-256-townhall.md)).**
Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).
**Load-bearing** — it gates the two heaviest pathing consumers
([32 pvp-armies](2026-06-19-citadel-32-pvp-armies.md), [33 per-player-pve](2026-06-19-citadel-33-per-player-pve.md)).

**NEW requirement surfaced by the grilling.** At 96×96 the current pathfinder is fine; at
256² with **per-player PvE raiders + armies + haulers**, the allocation profile breaks.

## The problem (verified 2026-06-19)

`bfsPath` in [pathfinder.ts:39](../../packages/citadel-sim-core/src/world/pathfinder.ts)
allocates a `new Uint32Array(width*height)` **per call**. At 256² that is ~256KB per
pathfind, churned ×N players × (raiders + armies + haulers) every tick — a GC storm.

## Idea / Scope

Cut per-call allocation and pick **one** authoritative pathfinder.

- **Reuse a persistent scratch buffer** for the BFS `prev`/visited arrays (allocate once,
  reset between calls) instead of `new Uint32Array(...)` per pathfind.
- **And/or adopt the engine WASM pathfinder** (the worker already instantiates it from
  transferred bytes; both satisfy `PathfinderLike`).
- **Sim-side, determinism is load-bearing:** the chosen pathfinder's routes are part of
  the deterministic sim output. **Route equivalence** must be preserved across the change.

## Decisions (grilled 2026-06-19)

- **Cause:** `bfsPath` allocating `Uint32Array(width*height)` per call (~256KB/pathfind ×N
  players) churns at 256² under per-player PvE raiders + armies + haulers.
- **Fix:** reuse a persistent buffer and/or adopt the engine WASM pathfinder.
- **Pick ONE pathfinder for the authoritative sim.** Cite the **JS↔WASM-routes-diverge
  gotcha** (wiki/memory: *JS vs WASM pathfinder diverge* — pathfinders are NOT
  route-equivalent; the split server uses WASM, baselines must match). Mixing JS and WASM
  across peers/replay would break determinism. One sim, one pathfinder.
- **Determinism stays load-bearing** — prove route equivalence with multi-seed
  `EXPORT=json` diffs, not just a determinism check.

## Acceptance

- No per-call `Uint32Array(width*height)` allocation in the hot path; a persistent buffer
  (or WASM) is used.
- Exactly one pathfinder backs the authoritative sim; no JS↔WASM mixing across peers/replay.
- **Determinism gate (route equivalence):** multi-seed `EXPORT=json` diffs prove identical
  routes before/after, at default `TICKS_PER_DAY=20` — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [29](2026-06-19-citadel-29-world-256-townhall.md) (B — needs the 256² extents).
- **Unblocks:** [32 pvp-armies](2026-06-19-citadel-32-pvp-armies.md) (E),
  [33 per-player-pve](2026-06-19-citadel-33-per-player-pve.md) (F).
