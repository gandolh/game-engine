# Brief 110 — Citadel client must adopt the server's world size (and window in iso space)

status: todo
source: the [brief 108](../done/108-citadel-live-mp-verification.md) live-MP pass. Root cause behind
[2026-07-02 review findings item 35](../../../todos/2026-07-02-full-repo-review-findings.md) (MP render
window mixes iso and axis-aligned space) and the unresolved
[2026-06-18 BUILD-ORDER](../../../todos/2026-06-18-citadel-00-BUILD-ORDER.md) items 21/22
(windowed-bake GPU-runtime verification). Completes the half of
[citadel 29](../../../todos/closed/2026-06-19-citadel-29-world-256-townhall.md)'s acceptance
("world dimensions read from config") that landed in the sim and never in the client.

## The finding

The Citadel **server runs a 256×256 world** ([server/src/index.ts:16-17](../../../../games/citadel/server/src/index.ts)),
but the **client is hardcoded to 96×96**. Verified live, two real browser tabs on `?mp`:

- [main.ts:1120](../../../../games/citadel/client/src/main.ts) — `generateTerrain(SEED)`, no size args →
  the client bakes a **96×96** terrain while attached to a 256×256 sim. Confirmed in-browser:
  `window.__citadel.terrain()` reports `96×96` on an MP tab.
- [iso.ts:45-51](../../../../games/citadel/client/src/render/iso.ts) — `ISO_ORIGIN_X`, `ISO_WORLD_W`,
  `ISO_WORLD_H` are module-level `const`s derived from the **compile-time** `WORLD_WIDTH/HEIGHT`
  imported from `@citadel/sim-core`. They cannot track a runtime world.
- Tile-key packing and bounds checks use the same compile-time `96`:
  [autotile.ts:68](../../../../games/citadel/client/src/render/autotile.ts),
  [placement-state.ts:33,88,108](../../../../games/citadel/client/src/ui/placement-state.ts),
  [coverage.ts:76-103](../../../../games/citadel/client/src/render/coverage.ts), `clustering.ts`.

### Live consequences (all reproduced)

1. **Players are silently confined to the top-left 96×96 corner.** `placement-state.ts`'s bounds check
   rejects any tile ≥96, and the camera only ever frames the 96×96 iso world. 86% of the MP map is
   unreachable through the UI.
2. **Anything outside the corner renders into void.** A town-hall placed at the world's own centre
   (128,128) — where `coreBoxCenter` puts settlements — projects to screen y≈712 on a 640px-tall
   canvas. Off-canvas, over un-textured background. Repro: `window.__citadel.send({type:"placeBuilding",
   payload:{buildingType:"town-hall",x:128,y:128}})`, then `tileToScreenCss(128,128)`.
3. **Raiders spawn in that void.** `pickEdgeSpawn` uses `state.width/height` (256), so raiders enter at
   the true map edges and cross untextured space before becoming visible.
4. **Tile-key collisions** for `tx ≥ 96` (`ty*96 + tx` is not injective over a 256-wide grid). Masked
   today only because the UI bounds check keeps the player inside the corner.
5. **Briefs 21/22 are unreachable in production.** `shouldWindow(96·16, 96·16) = 1536² = 2.36M ≤
   2048² = 4.19M` → `windowed` is **always false**, so the windowed bake never runs and
   `IncrementalQueue` never drains. citadel-38 item 8's "one-line fix" (call
   `windowController.update(camera)` each frame) **was applied** — it sits at
   [main.ts:1221](../../../../games/citadel/client/src/main.ts) — and is inert for exactly this reason.
6. **Findings item 35 is real but latent.** `windowRegion()` returns an axis-aligned
   `tile × TILE_SIZE` sub-region, while the whole-world bake paints iso diamonds into an
   `ISO_WORLD_W × ISO_WORLD_H` texture. The two disagree — but only once `windowed` is true, which
   requires this brief first. Fix it *here*, as part of the windowing work, not before.

## Scope

1. **Thread the world size from the server to the client.** The server already knows it
   (`CitadelSimHostOptions.worldWidth/Height`); the client learns it before its first bake. Either
   extend the `ready`/first-`snapshot` message with `worldWidth/worldHeight` (client then calls
   `generateTerrain(seed, w, h)` with the server's seed), or ship the terrain grid itself once.
   ⚠️ If the client regenerates, the **seed must be the server's** — today `init` carries the client's
   `SEED` and only the *first* peer's seed starts the sim, so a late joiner regenerating from its own
   constant would desync its terrain from the sim's.
2. **Make the iso constants runtime values.** `ISO_ORIGIN_X`/`ISO_WORLD_W`/`ISO_WORLD_H` become
   functions of, or are derived once from, the live world dims. Ripples into
   [transform.ts](../../../../games/citadel/client/src/render/transform.ts) (`WORLD_PX_W/H`),
   [minimap.ts:110-112](../../../../games/citadel/client/src/ui/minimap.ts) (`fitScale`), and
   [window-controller.ts](../../../../games/citadel/client/src/render/window-controller.ts).
3. **Replace compile-time `WORLD_WIDTH` tile-key packing + bounds checks** with the runtime width in
   `autotile.ts`, `placement-state.ts`, `coverage.ts`, `clustering.ts`.
4. **Make the windowed bake iso-correct** (findings item 35). `visibleTileWindow` currently converts
   world-px→tile by dividing each axis by `tileSize`, which is only valid in axis-aligned space. The
   camera pans **iso** world-px, so the visible tile set of an iso viewport is a rotated rect: invert
   through `isoToTileContinuous` at the four viewport corners and take the tile-space bounding box
   (plus `WINDOW_PAD`). `windowRegion` must then describe the **iso** sub-region the bake writes.
5. **Then re-run brief 108's blocked checklist items** on a correct MP world — they are this brief's
   acceptance, not a follow-up.

## Acceptance

- An MP client attached to a 256×256 server reports `terrain() → 256×256`, bakes terrain across the
  whole world, and frames it correctly. A hall at (128,128) is on-screen and sits on painted terrain.
- Placement, hover, coverage overlays, and the minimap are correct at `tx,ty ≥ 96` (no key collisions).
- `windowed` is **true** on the MP world; panning re-bakes through `IncrementalQueue` at ≤`REBAKE_BUDGET`
  bakes/frame; the baked window registers with the iso entity layer (no drift between terrain and sprites).
- Solo (96×96) is visually **unchanged** — still a single whole-world bake, `update()` a no-op.
- **Brief 108's carried items, verified live:** rival buildings/villagers/raiders render on both clients
  (108 item 2); pan far from centre on both tabs with no iso-vs-axis drift (108 item 4 / findings 35);
  heavy building spam hitches neither client (108 item 5 / BUILD-ORDER item 22).
- Determinism gate: **render-only, no sim change expected** — but `main.ts` currently derives terrain
  from `SEED`, so if the seed handshake changes, re-prove with a multi-seed `EXPORT=json` diff.
- `npm run typecheck` + `npm run test` green.

## Notes

- Consider whether `WORLD_WIDTH`/`WORLD_HEIGHT` should stop being *exported constants* at all, since
  they are now only defaults — an exported constant is what let the client silently disagree with the
  sim for this long. A `WorldDims` value threaded from bootstrap would make the drift unrepresentable.
- Solo is 96×96 and correct today; every symptom here is MP-only. That is precisely why it survived to
  now: MP had never been driven live. See [108](../done/108-citadel-live-mp-verification.md).
