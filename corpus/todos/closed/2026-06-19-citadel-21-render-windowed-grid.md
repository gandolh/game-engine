---
title: "Citadel 21 — Render-windowed sparse grid (large-map renderer)"
created: 2026-06-19
status: open
tags: [citadel, engine, render, perf, multiplayer]
---

# Citadel 21 — Render-windowed sparse grid

**Lineage:** tiny-world-builder's "intent-full / render-windowed" model — the logical
`world[][]` may hold a full 512×512 board, but `cellMeshes` only holds the camera-centered
render window; off-window cells come from a virtual `getWorldCell()` default rather than
preallocation.

**Target:** engine + Citadel render.

## Idea

Allocate render objects only for the visible viewport on large maps; everything else is a
virtual default tile materialised on demand.

## ✅ UN-PARKED (2026-06-19) — spine item K

Was parked as premature at 96×96 with no consumer. The **256×256 MP world**
([citadel-29](2026-06-19-citadel-29-world-256-townhall.md)) is now the committed large-map
consumer, so this is **un-parked**. Spine position **K (depends on
[29](2026-06-19-citadel-29-world-256-townhall.md))**. We already do viewport *culling*; this
is the *sparse-allocation* step beyond it.

## Acceptance

- Render objects allocated for the camera window only; off-window cells virtualised; memory flat as the logical grid grows.
- Render-only; no determinism change.

## ✅ INTEGRATION SHIPPED (2026-06-19) — engine sub-region bake + controller wiring; GPU runtime acceptance pending

The integration the prior status said was "NOT done" is now done and
headless-verified.

**Engine (shared, backward-compatible):** `bakeStaticLayer` gained an optional
`region?: StaticRegion` ({originX, originY, width, height}) param on `RendererLike`
and both renderers. New pure helpers `resolveStaticRegion` / `staticBlitRect`
(`engine/core/src/render/static-region.ts`, 9 unit tests) drive both the
Canvas2D blit and the WebGPU `StaticLayerPass` src-UV math. The bake sizes the
offscreen to the region + `translate(-origin)` so sprites/decorate draw in world
coords onto the smaller texture; `draw` clamps the visible rect to the baked
region. **Region omitted ⇒ whole world ⇒ src == dst, no translate ⇒
byte-identical** — Farm Valley + solo Citadel are provably unchanged (asserted by
the "full-world region is the pre-windowing identity" tests).

**Citadel wiring:** `render/window-controller.ts` `RenderWindowController` joins
the two cores — `visibleTileWindow` (21) picks the camera window, `windowRegion`
turns it into a `StaticRegion`, and re-bakes route through the `IncrementalQueue`
(22) drained at `REBAKE_BUDGET=1`/frame (coalesced to the latest window, never a
synchronous re-bake in the pan handler). `makeTerrainDecorate(grid, window?)`
loops only the window's tiles. Small worlds (solo 96² < 2048² texel threshold)
bake whole-world ONCE (no-op `update`); only the 256² MP world windows. Wired
into `createCitadelRenderer` (`bakeInitial`) + the `main.ts` loop (`update` after
`fitCameraToCanvas`). 8 controller tests (windowed vs whole, no-rebake on
unchanged window, ≤1 bake/frame, fast-pan coalescing).

**Verified headless:** engine render 73/73 + static-region 9/9; controller 8/8;
engine + citadel-sim-core + (my) citadel-client typecheck clean.

**Remaining (real-GPU only, this headless host can't):** the runtime memory-flat /
pan-smoothness / no-visible-seam visual acceptance. Watch for a 1-frame trailing
black margin on very fast pans if the re-bake lags the camera past `WINDOW_PAD=8`
tiles (raise the pad/budget if so). Closed → mirrors the other WebGPU render
briefs (code shipped + headless-tested, in-browser eyeball deferred to the user).

**⚠️ Currently DORMANT in the live client (pre-existing, separate gap).** The
controller is terrain-driven (`terrain.width/height`) and windows a 256² grid in
tests, but `main.ts` still does `generateTerrain(SEED)` with no size → the client
renders a **96² local terrain even in `?mp`** (and the camera uses the
compile-time `WORLD_PX_W = 96·16` constant). So today `shouldWindow(1536²)=false`
→ whole-world bake-once → byte-identical to before; windowing is mechanically
ready but never tripped. It activates **automatically** once the MP client is
wired to render the server's large world — i.e. derive the terrain grid + the
camera bounds from the MP snapshot's `worldWidth/worldHeight` (sim-bootstrap
already accepts them; the snapshot/client just don't convey/consume them yet).
That client-render wiring is the next step for actually *seeing* the 256² MP map;
21/22 is the render-perf substrate it will lean on.
