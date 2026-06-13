# Wave 1d — 2D Overlay (shadows / particles / weather / wash)

**Agents:** 1 (parallel, worktree-isolated). **Depends on:** Wave 0.

## Goal

Implement `Overlay2D` (`render/webgpu/overlay-2d.ts`): a transparent 2D `<canvas>` stacked
exactly over the WebGPU canvas, giving a `Ctx2D` for shadows, particles, weather, and the
day/night wash — so `ParticleSystem`, `RainField`, and the existing shadow/wash code run
**unmodified** in v1. This de-risks the migration; Wave 4 may later port these to GPU.

## Files you own

- `packages/engine/src/render/webgpu/overlay-2d.ts` (fill stub).

## Files you must NOT touch

Other `webgpu/*` modules, `particles.ts`, `rain-field.ts` (leave them as-is — that's the
point), interface, factory, index.

## Contract (from `01-architecture.md §3.4`)

`Overlay2D`: `constructor(gpuCanvas)`, `beginFrame()`, `applyWorldTransform(view)`,
`ctx`, `resetTransform()`.

## Implementation steps

1. **Create & position the overlay canvas.** In the constructor, create a new
   `<canvas>` and insert it as a sibling of `gpuCanvas` with identical CSS box: same
   `position`, `left/top`, `width/height` (CSS px), and `pointer-events: none` so it never
   eats input. Set `z-index` one above the GPU canvas. If `gpuCanvas.parentElement` is
   null (detached/test), degrade gracefully (still create the canvas, just don't attach).
   Acquire `ctx = canvas.getContext("2d")` with `imageSmoothingEnabled = false`.
2. **`beginFrame()`:** match device-pixel size to the base canvas using the same DPR rule
   as `Canvas2dRenderer.beginFrame` (`dpr = min(devicePixelRatio||1, 2)`, floor of client
   size × dpr). Set `canvas.width/height` only when changed. Then `ctx.setTransform(1,0,0,
   1,0,0)` and `ctx.clearRect(0,0,w,h)` — clear to **transparent** (NOT a solid color; the
   GPU canvas underneath provides the background).
3. **`applyWorldTransform(view)`:** set the 2D transform to the same world→screen mapping
   the GPU pass uses, so particles/weather (which are authored in world px) line up exactly:
   `ctx.setTransform(sx, 0, 0, sy, ox, oy)` using the same `sx,sy,ox,oy` the orchestrator
   computed (accept them via `view`). `imageSmoothingEnabled = false`.
4. **`resetTransform()`:** `ctx.setTransform(1,0,0,1,0,0)` for the screen-space wash.

## Shadows decision (important)

In Canvas2D, shadows are drawn with `globalCompositeOperation = "multiply"` directly onto
the baked world. On a **transparent** overlay, "multiply" multiplies against transparent
pixels and will NOT darken the world beneath (different canvas). Two options — pick and
document:
- **(Preferred) Move shadows to the GPU sprite pass.** Emit each shadow as a dark,
  translucent ellipse/quad in the sprite batch BEFORE the sprites (low layer). Provide a
  helper on `Overlay2D`? No — shadows on GPU belong to Wave 2's orchestration. So: this
  brief should expose the overlay only for particles/weather/wash, and **leave a clear
  note** that shadows are handled GPU-side by Wave 2. Do NOT implement shadow drawing here.
- (Fallback) If Wave 2 finds GPU shadows too costly, shadows can be drawn on the overlay
  with `source-over` using a pre-darkened translucent black — visually close enough. Note
  this as an option but do not implement.

Your deliverable: the overlay + transform plumbing for **particles, weather, wash**. Add a
doc-comment stating shadows are NOT drawn here (Wave 2 owns that call).

## Notes / pitfalls

- `OffscreenCanvas` is not needed here — this is an on-DOM stacked canvas.
- Respect `EDG`-only colors: you draw nothing colored yourself (callers pass colors).
- Handle the case where the base canvas resizes (window resize / DPR change) every frame
  via `beginFrame`.
- No `any`.

## Acceptance & verify

- `npm run typecheck -w @engine/core` clean.
- Self-review: overlay tracks base-canvas size/DPR; transparent clear; transform matches
  the documented world→screen math.

Commit: `webgpu(wave-1d): Overlay2D stacked canvas for particles/weather/wash`.
