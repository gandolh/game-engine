# audit-02 — Citadel minimap submits 36,864 fillRects per frame

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`) — the single largest render-side win found. Citadel/Hollow/MateQuest have no entry in [wiki/performance.md](../../wiki/performance.md), which is Farm-only; this is the first.

## The defect

[games/citadel/client/src/ui/minimap.ts:196](../../../games/citadel/client/src/ui/minimap.ts#L196)
re-emits one `surface.rect` **per world tile, every frame**:

```ts
// Terrain — cached face-local quads, just offset by the origin.
for (const q of this.terrainQuads) {
  surface.rect(ox + q.x, oy + q.y, q.w, q.h, q.color);
}
```

`terrainQuads` is built once (good) at
[minimap.ts:137-149](../../../games/citadel/client/src/ui/minimap.ts#L137-L149) — one quad per cell of
the **192×192** world ([terrain.ts:20](../../../games/citadel/sim-core/src/world/terrain.ts#L20)), so
**36,864 quads**. The *build* is cached; the *submission* is not.

Each quad becomes a `ctx.fillStyle =` + `ctx.fillRect` at
[engine/core/src/render/ui-draw.ts:70-73](../../../engine/core/src/render/ui-draw.ts#L70-L73).

The minimap is laid out and rendered every frame from
[main/render-loop.ts:505-515](../../../games/citadel/client/src/main/render-loop.ts#L505-L515).

## Failure scenario

Solo Citadel (`npm run citadel`) on the live 192×192 world. Every rAF frame pushes 36,864 `UIQuad`
object literals into the UI queue and performs 36,864 state-set + `fillRect` pairs — **before** the
rest of the HUD draws. At `MINIMAP_FACE` ≈ 168 px the fitted tile is
`ISO_TILE_W * fitScale ≈ 0.9 px` wide, so the overwhelming majority is sub-pixel overdraw repainting
the same pixels. The cost is paid whether or not anything on the minimap changed, and terrain
**never** changes after boot.

## Fix sketch

Rasterize the terrain face **once** into an `OffscreenCanvas` at `faceSize` and blit it as a single
quad; keep per-frame quads only for the things that actually move (building/villager/raider specks
and the camera viewport rect). The engine already has the CPU rasterizer and offscreen helper
(`engine/core/src/render/raster2d.ts`) used for texture baking — prefer it over a bespoke path.

Note the existing constraint recorded in the file: `UISurface` can't fill diamonds, which is why
tiles are approximated as axis-aligned squares. Baking does not change that — bake the same
approximation, or improve it for free since the bake is one-time.

## Files you OWN
- [games/citadel/client/src/ui/minimap.ts](../../../games/citadel/client/src/ui/minimap.ts)
- its colocated test, if one exists

## Files you must NOT touch
- `engine/core/src/render/ui-draw.ts` and the `UISurface` contract — this is a Citadel-side fix
- `games/citadel/sim-core/**` — render-only change, the sim is not involved
- the Apollo palette modules (`terrainColor` must keep returning `CITADEL_PAL` roles)

## Acceptance
- The per-frame quad count for the minimap drops from 36,864 to a small constant (terrain blit +
  specks + viewport rect). State the measured before/after count.
- Verified **in a real browser** (`npm run citadel`), not just by test: the minimap looks the same —
  terrain reads as solid with no gaps, specks and the camera rect still track, and click-to-recenter
  (`minimap.trySeek`, routed from `input.ts` with the same origin) still works.
- Report the frame-time change from `?profile` if Citadel exposes it; if it does not, say so rather
  than inventing a number.
- Palette guard test still green (no raw hex introduced by the bake).
