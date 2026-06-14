---
title: Island ports + boat travel across water
created: 2026-06-12
status: done
tags: [world, render, interaction, navigation]
---

# Island ports + boat travel across water

> **✅ DONE 2026-06-13** (commit `3650075`). `world/ports.ts` `PORTS` (3 ports:
> fishing-isle / fishing-isle-2 / casino) on the one verified-clear south ocean
> channel (trunk x=105). Reframed from 4-spoke hub → 2-3 ports after probing showed
> bridge columns slice every channel (a 4-spoke hub would reopen pathfinder parity).
> Reuses `aboard`/boatGrid/TravelSystem; `deliberatePortHop` (opportunist) + Pip
> board/disembark + aboard-steering. Render: dock-floor + moored/under-farmer boat.
> Module-load guard asserts lanes stay ocean. Tests green (sim-core 773); real-run
> diff skipped per user (constrained hw). See log.md.

Add ports on islands; from a port a farmer can board a boat and travel across
water to another port — a port-to-port network over the ocean.

## Decisions (grilled 2026-06-12)

**The boat substrate already exists** (shipped brief 48): a `farmer.aboard` flag
([farmer.ts:34](../../packages/sim-core/src/components/farmer.ts)), a separate
**`boatGrid`** (water lanes) that `TravelSystem` swaps to while aboard
([sim-bootstrap.ts](../../packages/sim-core/src/sim-bootstrap.ts) `buildBoatGrid`),
board-boat / return-to-shore actions, and the coral-fishing dock→reef→dock flow.
Today it's scoped to **two fixed coral-reef lanes** — this todo generalizes it.

- **(A) Port network on LANES — reuse the existing boat grid.** Add `port`
  features on several islands; carve **water lanes between ports** into `boatGrid`;
  a farmer at a port boards and travels port→port via the existing `TravelSystem`
  grid-swap. **NOT free open-water traversal** — bounded lanes keep determinism +
  WASM/JS pathfinder parity clean (open-ocean traversal would reopen
  [project_pathfinder_js_wasm_diverge]).
- **AI-usable:** add a `deliberate*` boat-travel intention so AI farmers port-hop
  (world feels alive). **Minimum acceptance: Pip can port-hop.**
- **Render:** port structure + boat sprite/animation over the ocean gradient,
  EDG32-only. Ports are features on islands (consider placing on the grown islands
  if sequenced after [grow-grid](2026-06-12-00-foundation-grow-grid-to-240.md)).
- **Boat travel costs comparable AP/time to walking the bridges** (grilled
  2026-06-12) — a scenic *alternative* route, NOT a shortcut. Keeps bridges relevant
  and avoids a pathing/balance upheaval. Deterministic (lanes are fixed geometry).

## Acceptance

- Ports exist on multiple islands; a farmer at a port can board and travel along a
  water lane to another port (reusing `aboard`/`boatGrid`/`TravelSystem`).
- AI farmers use ports (a boat-travel intention); Pip can port-hop.
- Port + boat render correctly over the ocean (EDG32 palette guard green);
  determinism preserved; pathfinder parity holds (lanes only, no open-water).
