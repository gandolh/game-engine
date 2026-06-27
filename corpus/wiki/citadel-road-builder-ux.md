# Citadel — road-builder UX (research + recommendation)

Research note for [todos/2026-06-27-citadel-road-builder-ux-research.md](../todos/2026-06-27-citadel-road-builder-ux-research.md).
What good builders do for road/wall drawing, mapped onto Citadel's constraints,
with a **ranked recommendation** and a scoped follow-up implementation todo.

## Where Citadel is today

The drag-build already works and is better than most first passes:

- **Two-endpoint drag.** Press = first endpoint, release = second; the painted
  run is the *path between them*, recomputed on cursor move — not an accumulation
  of every tile the mouse crossed ([placement-state.ts](../../games/citadel/client/src/ui/placement-state.ts) `startRoadDrag`/`continueRoadDrag`/`endRoadDrag`).
- **Obstacle-aware auto-route.** A bounded A* (turn-penalty tie-break) keeps the
  straight L when clear and detours around building footprints / un-roadable
  terrain; water stays passable (decks into a bridge). Falls back to the straight
  L + a `_routeBlocked` flag → "no clear road route" toast when fully walled
  (`routeRoadPath`).
- **Live ghost preview.** The candidate tiles render as a translucent drag preview
  (`roadTiles` → `pushGhost`).
- **Sim authority.** `placeRoad` / `placeWall` are deterministic commands over
  tiles; the client is purely a preview + command-builder on top.

### The gaps (what's missing vs. the reference titles)

1. **No connectivity feedback.** Every `BuildingSnapshot` carries `connected`, but
   it's never shown. A player can lay a road, leave a building unhooked, and get
   no signal — yet road connectivity is the spine the whole economy rides on
   (founders only staff `connected` buildings — see
   [systems/immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts)).
   This is the single biggest UX hole; live testing (2026-06-27) hit it directly.
2. **No length/cost readout** during the drag.
3. **No undo** of a just-placed run (or cancel of an in-progress one beyond
   releasing on the start tile).
4. **No snapping affordance** — no visual "this end will hook onto that existing
   road / building entrance".
5. **The "is it actually a road tool" affordance is thin** — mode lives only in
   the `lbl-mode` text + the highlighted toolbar button.

## What the reference titles do

### OpenTTD / Transport Tycoon
- **Drag-build with a live cost tooltip** that follows the cursor and updates as
  the run lengthens; you commit on release. The cost is shown *before* you pay.
- **Ctrl modifies routing** (e.g. autorail diagonal vs orthogonal); modifier keys
  switch the *kind* of segment without leaving the tool.
- **Removal is the same drag in reverse** (a remove-mode drag), so editing a bad
  run is symmetric with building it.
- **Strong "not connected" signal** lives in the consumer: an un-serviced station
  flashes its lack of supply. The lesson: surface the *consequence* at the
  building, not just abstractly.

### Cities: Skylines
- **Continuous preview with cost + length** while dragging; the road tints **red
  where the placement is illegal** (collision/slope) and green where legal — the
  player never commits a doomed segment blind.
- **Snapping** to existing nodes/roads, with toggles (straight / curved / freeform
  / grid). Holding a modifier locks to straight.
- **Node-and-segment model** lets you grab and move a built segment — heavier than
  Citadel needs, but the *snap-to-existing-endpoint* idea is the borrowable.

### Factorio
- **Drag to lay a continuous belt/rail; drag back over what you just laid to
  remove it** — instant, in-tool undo of the current run.
- **Ghost everything**: the whole planned run is a translucent ghost before it's
  real, and a blocked tile shows a red highlight.
- **Auto-extend**: starting a drag on the end of an existing line continues it.

### Manor Lords / Foundation / Banished (organic builders)
- Roads are **freeform splines snapped to terrain**, drawn start→end with a live
  curve preview; cost/material shown live. Less relevant to our **4-connected tile
  grid**, but they reinforce: *always show the full planned path + its price
  before commit, and make the start/end handles obvious.*

### Anno / Settlers
- **Connectivity is taught by making disconnection loud**: a building with no road
  access shows a **floating "no road" icon** over it. Anno tints unconnected
  production red in the overlay. This is exactly the gap Citadel has.

## Cross-cutting patterns worth adopting

| Pattern | In Citadel today | Worth adding? |
|---|---|---|
| Live full-path ghost on drag | ✅ have it | — |
| Obstacle-aware auto-route | ✅ have it (A*) | — |
| Red/green legality tint on the preview | partial (ghost is one colour) | **yes — cheap** |
| Length (+ later cost) readout on drag | ❌ | **yes — cheap** |
| **Disconnected-building indicator** | ❌ (flag exists, unused) | **yes — highest value** |
| Snap / auto-extend at an existing road end | ❌ | maybe (medium) |
| In-tool undo (drag-back / Ctrl-Z last run) | ❌ | maybe (medium) |
| Remove-drag symmetric with build-drag | partial (demolish is per-tile click) | maybe (medium) |
| Modifier to force straight L | ❌ (auto-route always on) | low (auto-route mostly covers it) |

## Recommendation (ranked)

Do the cheap, high-leverage feedback first; defer the heavier editing model.

1. **Disconnected-building indicator (do first, highest value).** Surface the
   existing `connected` flag: stamp a small floating "⚠ no road" marker (EDG gold)
   over any production/housing building that is `connected === false`, the way
   Anno/Settlers do. This directly closes the "I laid a road and nothing happened"
   trap and teaches the connectivity rule with zero words. Render-only; reads the
   snapshot flag already in hand. Pairs naturally with the just-merged coverage
   overlay ([render/coverage.ts](../../games/citadel/client/src/render/coverage.ts)),
   which teaches *service* reach but not *road* connectivity.

2. **Drag readout: length now, cost later (cheap).** While dragging, show the
   planned run's tile count (and, once roads have a cost, the price) in a small
   cursor-anchored label or the mode line — OpenTTD/Skylines style. The path tiles
   are already computed (`roadTiles`); this is a formatting + DOM/overlay change.

3. **Red/green legality tint on the drag preview (cheap).** The preview is already
   a translucent run; tint it **red on the segments the sim will reject** (the
   `_routeBlocked` straight-L-fallback case, and any tile that fails the buildable
   rule) and green otherwise, so a doomed drag reads as doomed before release.
   `_blockedForRoad` already computes per-tile passability — reuse it for tint.

4. **Snap / auto-extend (medium, defer).** When a drag *starts or ends* adjacent
   to an existing road tile or a building edge, snap that endpoint and show a snap
   marker. Useful but more involved; carve into its own todo after 1–3 land.

5. **In-tool undo (medium, defer).** Either Factorio-style drag-back-to-remove, or
   a "Ctrl-Z removes the last placed run" (the command log already exists for
   save/load — an undo could pop the last `placeRoad`/`placeWall` and re-derive).
   Determinism-sensitive (it mutates the command stream) — design carefully.

**Explicitly NOT recommended:** curved/freeform roads and a node-drag segment
editor (Skylines-style). They fight the 4-connected tile grid that the sim, the
autotile renderer, and `routeRoadPath` all assume; the cost far exceeds the payoff.
Keep roads tile-grid + auto-routed.

## Constraints any implementation must respect

- **Sim stays authoritative.** All of the above is a client preview/feedback layer
  over the existing `placeRoad`/`placeWall` commands. No new sim state for 1–3.
- **EDG32 palette** for every tint/marker (`EDG.*`).
- **Per-frame budget** — the disconnected-indicator + tint iterate the visible
  building/road set, already done each frame; keep it allocation-light.
- Reuse `routeRoadPath` / `_blockedForRoad` / the `connected` flag — this is about
  the *interaction shell*, not re-pathing.

## Follow-up implementation todo

Carved from items 1–3 (the cheap, high-value tier):
[todos/2026-06-27-citadel-road-feedback-connectivity-indicator.md](../todos/2026-06-27-citadel-road-feedback-connectivity-indicator.md).
Items 4–5 (snap/auto-extend, undo) are noted there as deferred follow-ups.

## Sources

- OpenTTD wiki — building/drag tools, cost tooltips, Ctrl modifiers
  (https://wiki.openttd.org/). Ties into [openttd-art-and-gameplay-influence](../todos/2026-06-22-openttd-art-and-gameplay-influence.md).
- Cities: Skylines road tool — drag preview, red/green legality, snapping/straight
  modes (Paradox/Colossal Order official manual + community wiki).
- Factorio — drag-build, drag-back-to-remove, ghost planning (wiki.factorio.com).
- Anno / The Settlers — "no road access" building indicators (series UX).
- Manor Lords / Foundation / Banished — freeform road drawing with live
  path/cost preview (noted for contrast; not adopted on our tile grid).
