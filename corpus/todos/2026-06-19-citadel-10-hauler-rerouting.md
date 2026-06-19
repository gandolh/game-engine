---
title: "Citadel 10 — Dynamic hauler rerouting (logistics resilience)"
created: 2026-06-19
status: open
tags: [citadel, sim, pathfinding, depth]
---

# Citadel 10 — Haulers reroute when the road breaks

**Sequence: independent** — can run in parallel with [citadel-09](2026-06-19-citadel-09-interlocking-decrees.md)
after 07→08 (no hard dependency).

**Lineage:** tiny-world-builder's **vehicle runtime** — AI delivery bots navigating a
seeded road network with **dynamic rerouting + collision avoidance** (36+ vehicles).
Recast for Citadel haulers.

## The gap (verified 2026-06-19)

A villager caches a full BFS path (`pathX[]`/`pathY[]`/`pathStep` on
[villager.ts:27-29](../../packages/citadel-sim-core/src/entities/villager.ts)) and walks
it **one tile/tick blindly** ([villager-system.ts](../../packages/citadel-sim-core/src/systems/villager-system.ts)).
If a road in that path is **demolished or burned mid-haul** (fire-system / player demolish /
raider), or the target building is destroyed, the hauler keeps walking the stale path
(or teleport-snaps, since no-route was the plan-time fallback). The planks economy
stalls with **no visible cause**.

## Scope — lazy detection + bounded replan

- **Detection (cheap):** each tick, before advancing, validate only the **immediate
  next tile** (`pathX[pathStep]`, `pathY[pathStep]`) is still walkable **and** the FSM
  target still exists. O(1) per hauler per tick. If invalid → mark needs-replan.
- **Replan:** recompute `bfsPath` ([pathfinder.ts](../../packages/citadel-sim-core/src/world/pathfinder.ts))
  from current position to target. **Drain replans through a per-tick budget**
  (K replans/tick) so a siege-time mass-break can't spike a frame; over-budget haulers wait a tick.
- **No-route case:** if replan finds no path (disconnected), the hauler idles / holds cargo;
  the existing road-connectivity disconnected-flag
  ([road-connectivity.ts](../../packages/citadel-sim-core/src/systems/road-connectivity.ts))
  covers the legibility.
- **Optional (depth-first, keep minimal):** a throttled event-feed line for major reroutes
  ("haulers rerouting — road blocked"); not per-reroute spam.

## Determinism (load-bearing)

Replan order **must be deterministic** — drain the replan queue **FIFO by villager id**,
never by ECS iteration order. This is the central risk; the budget exists as much for
determinism ordering as for the frame-cost ceiling. (Echoes the FV WASM-allocator-fault
lesson: build the resilience ceiling before scaling. Citadel uses pure-JS `bfsPath`, so
no allocator risk here — the risk is ordering.)

## Decisions (grilled 2026-06-19)

- **Lazy next-step check + deterministic replan budget** (chosen over event-driven dirty-flags
  and full per-tick whole-path scan — the code shape makes lazy-next-step O(1), cheaper than the
  synthesizer's default scan).

## Acceptance

- Demolishing/burning a road tile under a mid-haul villager makes it re-path next tick (visibly scrambles), not walk through air.
- A simultaneous mass-break (siege) replans within the per-tick budget without a frame spike.
- Disconnected haulers idle gracefully; the building's disconnected-flag fires.
- **Determinism gate:** sim-touching. Replan order proven deterministic via multi-seed
  `EXPORT=json` re-proof at ticksPerDay=20 (Citadel's rate). **Ask before running.**
- `npm run typecheck` + targeted vitest green.

## Open tuning (resolve in-brief)

K replans/tick budget value (measure at Town tier); whether a perishable-carrying hauler gets a priority replan lane.
