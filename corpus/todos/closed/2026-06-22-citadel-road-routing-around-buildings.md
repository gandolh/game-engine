---
title: "Citadel — road drag must route around buildings, not stamp through (and gap) them"
created: 2026-06-22
status: done
resolved: 2026-06-22
tags: [citadel, sim, ux, pathfinding, roads]
---

> **Done 2026-06-22.** Added pure `routeRoadPath` (bounded A* with a turn-penalty
> tie-break) in [placement-state.ts](../../games/citadel/client/src/ui/placement-state.ts):
> keeps the straight L when its interior is clear, detours around building
> footprints / un-roadable terrain when blocked, treats water as passable (it
> decks into a bridge), and returns `null` (→ fall back to L + a "no clear road
> route" toast) when fully walled. Wall drags keep the deliberate straight L.
> Unit-covered in [placement-state.test.ts](../../games/citadel/client/src/ui/placement-state.test.ts)
> (clear-L unchanged / single-building detour / water pass-through / no-route
> fallback / blocked endpoint). Client-only; sim placement rules untouched.
> Still worth a live real-GPU pass for drag feel.
>
> **SUPERSEDED 2026-06-27.** The road path now **follows the actual mouse motion**
> (freehand `extendTrail`) instead of being computed between the first and last
> tile, so the endpoint-to-endpoint `routeRoadPath` this todo shipped was retired.
> See [road-path-follows-mouse](../2026-06-27-citadel-road-path-follows-mouse.md)
> and [log.md](../log.md). This file is kept for history; its A* approach is no
> longer in the code.

# Citadel — road drag must route *around* buildings

## Problem

Dragging a road between two points lays a fixed **L-shaped Manhattan path**
(larger axis first, then turn — `shortestRoadPath` in
[placement-state.ts:25-54](../../games/citadel/client/src/ui/placement-state.ts#L25)).
That path is computed with **no awareness of obstacles**. When the L crosses an
existing building (or water, or a rival claim), the client still sends every tile;
on the sim side `placeOne("road", …)` silently **rejects** the occupied tiles
(`checkPlacement` fails → `return false`,
[sim-bootstrap.ts:330-332](../../games/citadel/sim-core/src/sim-bootstrap.ts#L331))
while placing the rest. Result: the road has a **gap where the building is**, so
the two endpoints aren't actually road-connected — which silently breaks the
road-connectivity the whole economy depends on. The player sees a broken road and
no explanation.

(Water is the one intended exception: a road tile on water auto-becomes a bridge,
[sim-bootstrap.ts:276](../../games/citadel/sim-core/src/sim-bootstrap.ts#L276) —
so routing should treat water as *traversable-via-bridge*, not as a wall.)

## Wanted

The drag should produce a path that **goes around** building footprints (and
other un-roadable obstacles), staying connected end-to-end, instead of an L that
clips through them and gaps out.

## Approach

This is a **client-side path-preview change** (sim placement rules stay as they
are — they're the source of truth for what's legal). Replace the naive L in
`shortestRoadPath` with an obstacle-aware grid search between the two endpoints:

- A* / BFS on the tile grid, 4-connected (roads are 4-connected today).
- **Blocked cells** = occupied building footprints + non-buildable terrain that
  isn't water. Treat **water as passable** (it will deck into a bridge), and
  treat existing road/bridge/gate tiles as passable (re-stamping is harmless).
  The client already has `terrain` and `currentBuildings` in `updateCursor`
  ([placement-state.ts:137](../../games/citadel/client/src/ui/placement-state.ts#L137),
  [main.ts:190](../../games/citadel/client/src/main.ts#L190)) — derive an
  occupancy predicate from those.
- Prefer the route that hugs the old L when unobstructed (tie-break toward fewer
  turns) so simple drags look identical to today.
- If **no** route exists (fully walled off), fall back to the straight L and let
  the sim reject — but surface a toast ("no clear road route") rather than
  silently gapping.
- The engine already ships a pathfinder (`PathfinderLike` / the JS fallback
  [js-pathfinder.ts](../../games/farm/sim-core/src/world/js-pathfinder.ts)) and a
  WASM kernel — reuse an existing grid search rather than hand-rolling if one is
  reachable from the client without crossing the engine→game dependency rule.

## Notes / constraints

- **Render/input only if done client-side** — `shortestRoadPath` feeds the
  drag preview and the command payload; the sim stays deterministic and
  untouched, so no determinism re-proof is needed. Keep `shortestRoadPath` pure
  and unit-tested (it already is — extend
  [placement-state.test.ts](../../games/citadel/client/src/ui/placement-state.test.ts)
  if present).
- Wall drag uses the same `shortestRoadPath`; decide whether walls should also
  route around (probably **not** — walls are deliberately placed *on* a perimeter
  — so consider a `routeAroundObstacles` flag, on for roads, off for walls).
- Keep it cheap: the longest realistic drag spans the windowed map, so cap the
  search (bounded BFS / weighted A*) to avoid a hitch on a huge drag.

## Acceptance

- Dragging a road whose straight L would cross a building produces a connected
  detour around the footprint (no gap), verified in `npm run citadel`.
- A road dragged across water still becomes a bridge span.
- Fully-blocked drag surfaces a message instead of a silent gap.
- `shortestRoadPath` (or its successor) has unit coverage for: clear L (unchanged
  output), single-building detour, water pass-through, no-route fallback.
