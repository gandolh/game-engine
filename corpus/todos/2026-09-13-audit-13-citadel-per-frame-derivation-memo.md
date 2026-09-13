# audit-13 — Citadel re-derives autotiling, clustering and the appear-map every frame, with no viewport culling

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). The code's own "cheap at this world size" comment predates the 96→192 world growth.

## The defect

Per **frame** (60 Hz), for data that changes only when the player builds or demolishes (≤20 Hz, and
usually far less):

- [citadel-renderer.ts:584-604](../../games/citadel/client/src/render/citadel-renderer.ts#L584-L604)
  `pushNetworks` rebuilds two membership `Set`s and allocates one `IsoNetworkTile` object per road/wall
  tile ([autotile.ts:289](../../games/citadel/client/src/render/autotile.ts#L289)). Its comment still
  reads *"Recomputes per frame — cheap at this world size."*
- [clustering.ts:45-90](../../games/citadel/client/src/render/clustering.ts#L45-L90) `clusterBuildings`
  re-runs a BFS with a fresh `Map` plus a 4-element neighbour array per footprint tile.
- [citadel-fx.ts:79-87](../../games/citadel/client/src/render/citadel-fx.ts#L79-L87) `syncAppearMap`
  builds a fresh `Set` of `` `${x},${y},${type}` `` template strings over **all** buildings.

And nothing culls to the visible tile window — `render-window.ts:9-14` exists but gates only the *static
terrain* bake, so off-screen buildings still have quads submitted.

## Failure scenario

A mature 192×192 solo town with ~600 road tiles and ~60 houses. Per frame: ~1,200 `Set.add`, ~600 object
literals, ~2,400 neighbour-mask lookups, a BFS allocating per footprint tile, and ~800 template-string
allocations in `syncAppearMap` plus ~800 more in the `pushScene` fx hook
([render-loop.ts:238](../../games/citadel/client/src/main/render-loop.ts#L238)). At 60 fps that is on the
order of **100k object/string allocations per second** for data that did not change — the classic GC
sawtooth in a rAF loop. Batch size also tracks town size rather than screen area.

## Fix sketch

1. **Memoize on a building-set revision.** Bump a counter when the snapshot's building set identity
   changes (≤20 Hz) and recompute the network-tile list, clusters and appear-map only then.
2. **Key by packed integer**, `ty * WORLD_WIDTH + tx`, instead of template strings, for `appearAt` /
   `burningSince`.
3. **Cull** `scene.buildings` through the existing visible-tile rect before pushing quads.

The file already has this memo idiom (`groundKey` invalidation, `citadel-renderer.ts` ~646-699) — follow it.

## Files you OWN
- [citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts),
  [autotile.ts](../../games/citadel/client/src/render/autotile.ts),
  [clustering.ts](../../games/citadel/client/src/render/clustering.ts),
  [citadel-fx.ts](../../games/citadel/client/src/render/citadel-fx.ts),
  [main/render-loop.ts](../../games/citadel/client/src/main/render-loop.ts)
- the stale comment at `citadel-renderer.ts:584` — update it to say what is actually true now

## Files you must NOT touch
- `games/citadel/sim-core/**` — render-only
- the tint-alpha handling described in [wiki/citadel-rendering.md](../wiki/citadel-rendering.md); that
  trap already cost one bug (translucent ground quads rendered opaque). Do not touch alpha while here.

## Acceptance
- Autotiling, clustering and the appear-map each recompute at most once per snapshot, not once per frame.
  Report the before/after per-second recompute counts.
- Off-screen buildings no longer submit quads; report the quad-count reduction at default zoom in a
  mature town.
- Verified **in a real browser** (`npm run citadel`): roads autotile identically, house clusters look
  identical, appear/burn animations still trigger at the right moment, and building *then* panning away
  and back behaves correctly (the memo must invalidate on build, and culling must not drop a building
  that scrolls back into view).
- `npm run test -w @citadel/client` green.
