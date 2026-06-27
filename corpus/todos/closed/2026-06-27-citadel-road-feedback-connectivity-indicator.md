---
title: "Citadel — road builder feedback: disconnected-building indicator + drag length + legality tint"
created: 2026-06-27
status: done
resolved: 2026-06-27
tags: [citadel, ux, roads, render, feedback, connectivity]
source: "carved from wiki/citadel-road-builder-ux.md (research, 2026-06-27)"
---

> **Done 2026-06-27.** Shipped all three items. (1) New pure
> [road-feedback.ts](../../games/citadel/client/src/render/road-feedback.ts)
> (`needsRoadConnection`/`disconnectedBuildings`) + renderer `pushDisconnectedMarkers`
> floats a pulsing EDG-gold pip over each production/housing/storage building that
> is `connected:false` (infrastructure excluded). (2) Mode label shows
> "Mode: Road (drag) — N tiles" (· blocked) live via `dragLengthSuffix` +
> `roadTiles.length`. (3) `pushGhost` takes per-tile validity;
> `PlacementStateManager.roadTilesWithValidity` tags interior tiles via
> `_blockedForRoad` (endpoints stay green) → red/green drag preview. All client
> render/UI over the existing deterministic commands — no sim change. 7 road-feedback
> unit tests + 222 @citadel/client suite green; live-verified all three. Commit
> `9b1d702`. See [log.md](../log.md). **Deferred follow-ups stand:** snap/auto-extend
> + in-tool undo (noted below).
# Citadel — road-builder feedback (the cheap, high-value tier)

Scoped implementation todo carved from the research in
[wiki/citadel-road-builder-ux.md](../wiki/citadel-road-builder-ux.md) (items 1–3,
the highest-leverage / lowest-cost changes). Snap/auto-extend and in-tool undo
(items 4–5) are deferred follow-ups noted at the bottom.

All three are a **client-side preview/feedback layer** over the existing
deterministic `placeRoad`/`placeWall` commands — no sim change, no new sim state,
EDG32 palette, allocation-light per frame.

## 1. Disconnected-building indicator (highest value — do first)

**Problem.** Every `BuildingSnapshot` carries `connected`, but it's never shown.
A player lays a road, leaves a building unhooked, and gets no signal — yet road
connectivity is the spine of the economy (founders only staff `connected`
buildings, [systems/immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts)).
Live testing (2026-06-27) hit this trap directly.

**Do.** Stamp a small floating marker (EDG gold "⚠ no road" glyph or a flat iso
warning chip) over any **production/housing** building with `connected === false`
(skip roads/walls/gates/bridges, which don't need connecting). Anno/Settlers do
exactly this. Render-only — reads the flag already in the snapshot each frame.
Consider only showing it after a short settle (so a just-placed building mid-drag
doesn't flash) and/or fading it in.

**Acceptance.** A disconnected farm/house shows the marker; connecting it with a
road clears the marker within a frame or two; roads/walls never show it; verified
live in `npm run citadel`.

## 2. Drag length readout (cheap)

**Do.** While dragging a road/wall, show the planned run's **tile count** (and,
once roads carry a cost, the price) in a cursor-anchored label or the `lbl-mode`
line — OpenTTD/Skylines style. The path tiles are already computed
(`PlacementStateManager.roadTiles`); this is a formatting + DOM/overlay change in
[main.ts](../../games/citadel/client/src/main.ts).

**Acceptance.** Dragging shows a live length that updates as the run grows; clears
on release/cancel.

## 3. Red/green legality tint on the drag preview (cheap)

**Problem.** The drag preview is one colour, so a doomed run (one that hits the
`_routeBlocked` straight-L fallback, or crosses un-buildable tiles the sim will
reject) reads the same as a good one until release.

**Do.** Tint the preview per tile: **green** where the sim will accept, **red**
where it will reject. `PlacementStateManager._blockedForRoad` already computes
per-tile passability and `_routeBlocked` flags the no-clear-route fallback — reuse
both for the tint rather than recomputing. Walls use the straight L, so tint their
rejected tiles too.

**Acceptance.** A drag whose route is blocked shows red on the offending tiles
(and still toasts "no clear road route" on release as today); a clean drag is all
green. Pure/preview only — the sim rules are unchanged (it's still the authority).

## Constraints

- **Sim stays authoritative.** Preview/feedback only; no new sim state, no
  determinism impact (1–3 read the snapshot + existing client predicates).
- **EDG32** for every tint/marker (`EDG.*`); keep per-frame work allocation-light
  (the disconnected scan iterates the already-in-hand building set).
- Reuse `routeRoadPath` / `_blockedForRoad` / the `connected` flag — interaction
  shell, not re-pathing.
- Pairs with, doesn't duplicate, the coverage overlay
  ([render/coverage.ts](../../games/citadel/client/src/render/coverage.ts)), which
  teaches *service* reach, not *road* connectivity.

## Deferred follow-ups (separate todos when reached)

- **Snap / auto-extend** at an existing road end or building edge (medium).
- **In-tool undo** of the last placed run — Factorio drag-back-to-remove or a
  Ctrl-Z that pops the last `placeRoad`/`placeWall` from the command log
  (determinism-sensitive: it mutates the command stream).
- Explicitly **NOT** doing curved/freeform roads or a node-drag segment editor —
  they fight the 4-connected tile grid the sim + autotile + `routeRoadPath` assume
  (see the research note).
