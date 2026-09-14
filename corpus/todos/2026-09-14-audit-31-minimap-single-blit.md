# audit-31 — Finish the minimap bake: one blit instead of 422 rects

status: todo
created: 2026-09-14
context: follow-up from [audit-02](2026-09-13-audit-02-citadel-minimap-bake.md) (landed `a2b9931`). Not a defect — the remaining step needs an API change audit-02 correctly declined to make.

## Where this stands

audit-02 cut the Citadel minimap from **36,864 `fillRect`s per frame to 422** by rasterizing terrain once and greedy-scanline-merging it into same-colour rects. That is a 98.9% reduction and it shipped.

It did **not** do the single baked blit the original sketch called for, and the reason is sound:
`UISurface` has no blit primitive (its own docstring says so), and the only way to show a baked
bitmap through it is `surface.sprite(atlasId, frame)`, which needs the bitmap registered via
`renderer.addAtlas(...)`. `CitadelMinimap` holds no renderer reference, so threading one in means
changing its public constructor and its call site in `minimap-wiring.ts` — a cross-module contract
change, outside that spec's ownership.

## Is this worth doing?

**Possibly not, and that is the first question to answer.** 422 `fillRect`s per frame is already
cheap. Do not start by writing code — start by measuring whether the remaining 422 are visible in a
real-browser frame profile on a mature 192×192 town. If they are not, close this spec as
*not worth doing* and record the number. That is a perfectly good outcome and saves a public-API
change for nothing.

Note the measurement trap: this sandbox renders WebGL2 through SwiftShader (CPU raster), and the
corpus records an entire false "FPS regression" chased down to exactly that artifact
([open-questions.md](../wiki/open-questions.md), brief 84). Measure on real hardware or do not
quote a number.

## If it IS worth doing

Give `CitadelMinimap` access to a renderer so the baked face can be registered as an atlas and drawn
with one `surface.sprite`. That means:
- a constructor/parameter change on `CitadelMinimap`
- updating `minimap-wiring.ts`
- deciding where the bake is registered (boot, like `boot.ts`/`main.ts` do, vs lazily on first draw)

The bake itself already exists — `rasterTerrainColors` / `rowSegments` / `mergeRowsToRects` are
private to `minimap.ts` and can be replaced or reused.

## Files you OWN
- [games/citadel/client/src/ui/minimap.ts](../../games/citadel/client/src/ui/minimap.ts) + its test
- the minimap wiring call site

## Files you must NOT touch
- `engine/core/src/render/ui-draw.ts` and the `UISurface` contract — if this genuinely needs a blit
  primitive on the engine surface, that is a separate decision, not a drive-by addition
- `games/citadel/sim-core/**`

## Acceptance
- Either: a measured verdict that 422 quads/frame is not worth further work, recorded here and in
  [performance.md](../wiki/performance.md) — **or** one blit, with the quad count reported.
- `trySeek` click-to-recenter still works with the same top-right origin (it was byte-identical
  through audit-02; keep it that way).
- Verified in a real browser, not only by test.
