---
title: "Citadel — road drag path should follow the mouse, not be computed between first and last tile"
created: 2026-06-27
status: done
resolved: 2026-06-27
tags: [citadel, ux, input, roads, pathfinding, override]
---

> **Done 2026-06-27.** Roads are now FREEHAND: new pure `extendTrail`
> ([placement-state.ts](../../../games/citadel/client/src/ui/placement-state.ts))
> accumulates the tiles the cursor actually travels through during a drag —
> appends one tile per cursor step, gap-fills a fast drag with a short L
> connector so the trail stays 4-connected, and trims on drag-back (re-entering a
> trail tile pops back to it). `startRoadDrag`/`continueRoadDrag` drive the trail
> for roads; WALLS keep the deliberate two-endpoint straight L (`_recomputePath`).
> The endpoint A* (`routeRoadPath`) + its turn-penalty heap were RETIRED — this
> supersedes [road-routing-around-buildings](2026-06-22-citadel-road-routing-around-buildings.md)
> (now in `superseded/`). Blocked-interior tiles still drive the red/green tint +
> "no clear road route" toast; the length readout is unchanged. 16 placement-state
> tests (8 new `extendTrail` cases) + full @citadel/client suite green. Client/
> input-only — sim placement untouched, determinism unaffected. See [log.md](../../log.md).

> **Overrides a previous decision.** The road-drag path is currently *computed*
> between the drag's first and last tile — first an L-shaped Manhattan path
> ([road-routing-around-buildings](2026-06-22-citadel-road-routing-around-buildings.md),
> done 2026-06-22) and then an obstacle-aware A* detour (`routeRoadPath` in
> [placement-state.ts](../../../games/citadel/client/src/ui/placement-state.ts)).
> That endpoint-to-endpoint model is **superseded by this todo**: the path should
> instead **track the actual mouse motion** during the drag. Update / supersede the
> auto-routing behaviour rather than layering on top of it.

# Citadel — road path should follow the mouse

## Problem

When you drag a road, the route the client lays down is **derived from only two
points** — where you pressed and where the cursor is *now* — and the system picks
its own path between them (straight L, then an A* detour around obstacles). The
player has no control over the *shape* of the run: you can't curve it, can't steer
it down a particular corridor, can't avoid a tile you'd rather keep clear. The
path "snaps" to whatever the router decided, which can jump far from where the
mouse actually travelled.

## Wanted

The road should **follow the mouse**. As the player drags, the painted path traces
the route the cursor actually took across the tiles, so the player draws the road
freehand instead of declaring two endpoints and letting the system route between
them. Dragging back over the trail should trim it (Factorio-style drag-back-to-
remove), so the player can correct a stroke without releasing.

## Approach (sketch — client/input only)

- Accumulate the **sequence of tiles the cursor enters** over the course of the
  drag (sample on pointermove → `screenToTile`, append when the tile changes),
  rather than recomputing a fresh endpoint-to-endpoint route each move.
- Keep the run **contiguous**: when the mouse jumps more than one tile between
  samples (fast drag, low frame rate), fill the gap with a short connector between
  the last recorded tile and the new one so the trail stays 4-connected — but this
  is a *gap-fill between consecutive samples*, not a global re-route between the
  two endpoints.
- **Drag-back trims**: if the cursor re-enters an already-recorded tile, pop the
  trail back to it instead of branching.
- Retire / gate the endpoint A* (`routeRoadPath`) for the follow-the-mouse path —
  it was built for the old model. Decide whether walls keep the deliberate
  straight L (walls are placed *on* a perimeter, so freehand may not suit them —
  carry forward the existing roads-only flag).
- Keep the existing release-time feedback: drag length readout, red/green legality
  tint, and the "no clear road route" / blocked-tile toast still apply to the
  freehand trail.

## Notes / constraints

- **Client / input only.** `placeOne`/`checkPlacement` on the sim stay the source
  of truth for legality; the sim is untouched and stays deterministic, so no
  determinism re-proof. Keep the trail-builder pure and unit-tested (extend
  [placement-state.test.ts](../../../games/citadel/client/src/ui/placement-state.test.ts)).
- This **supersedes** the auto-route-between-endpoints behaviour from
  [road-routing-around-buildings](2026-06-22-citadel-road-routing-around-buildings.md).
  When this ships, mark that todo superseded (per the corpus brief lifecycle) and
  note the override in [log.md](../../log.md) and
  [wiki/citadel-road-builder-ux.md](../../wiki/citadel-road-builder-ux.md).
- Watch the sample rate vs. tile size so a slow drag still records every tile and
  a fast drag doesn't skip a corner.

## Acceptance

- Dragging a road lays a trail that **follows the cursor's actual path** across
  tiles (curve it, steer it), not a system-chosen L/A* between press and release —
  verified in `npm run citadel`.
- Dragging back over the trail trims it.
- The trail stays contiguous (4-connected) even on a fast drag.
- Length readout, legality tint, and blocked-route toast still work on the
  freehand trail; the superseded endpoint-routing todo is moved to superseded.
