# WebGL2 01 — relocate the shared 2D vocabulary out of `canvas2d/`

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 1 · blocks: 03, 04, 05, 08

## Why this is first

`canvas2d/` currently holds two *different* kinds of code, and only one of them is a backend:

1. **The Canvas2D backend** — `renderer.ts`, `index.ts`. This gets deleted (brief 08).
2. **Shared engine vocabulary the WebGPU backend also imports** — `types.ts` and `draw.ts`.
   27 files reference `Canvas2dSprite` / `Ctx2D`, and the WebGPU backend imports
   `compareSprite`, `spritesOverlap`, `drawSprite`, `createOffscreen` **from inside `canvas2d/`**.

So the directory cannot simply be deleted. This brief performs the pure-mechanical separation
first, so briefs 03–08 build against stable module paths and the deletion in 08 is a one-liner.

**This is a move + rename brief. Zero behaviour change. No rendering logic is written here.**

## Scope — exactly these moves

Create two new modules in `engine/core/src/render/`:

**`sprite-types.ts`** — from `canvas2d/types.ts`:
- `Canvas2dSprite` → **rename to `Sprite`**. `renderer.ts` already declares
  `export type Sprite = Canvas2dSprite;` — after this brief `Sprite` is the real name and the alias
  disappears. Keep every field exactly as-is (`sortY?`, `z?`, `occludable?`, `flipX?`, `tintRgba?`,
  `swayPhase?`, `swayAmp?`).
- `Ctx2D` — moves unchanged. Still `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`.

**`raster2d.ts`** — from `canvas2d/draw.ts`, unchanged bodies:
- `compareSprite`, `spritesOverlap`, `drawSprite`, `createOffscreen`.
- Name it `raster2d` deliberately: this is the **CPU rasterizer that stays forever**. It is not a
  backend — it bakes textures the GPU then samples (`webgpu/static-layer-pass.ts` ~230/~470), backs
  the `ui-draw.ts` tint cache, and rasterizes `rain-field.ts`. Add a short header comment saying
  exactly that, so a future reader doesn't mistake it for dead Canvas2D leftovers and delete it.

Then **update every importer**. Known call sites (verify with a fresh grep — do not trust this list
as exhaustive):
- `render/renderer.ts` — drop the `Sprite = Canvas2dSprite` alias, import from `./sprite-types`.
- `render/index.ts` — export `Sprite` (keep `Canvas2dSprite` as a deprecated type alias **only if**
  something outside `engine/core` needs it; prefer a clean break, see below).
- `render/ui-draw.ts`, `render/ui-draw.test.ts`, `render/rain-field.ts`
- `render/webgpu/renderer.ts`, `render/webgpu/static-layer-pass.ts`, `render/webgpu/overlay-2d.ts`
- `render/canvas2d/renderer.ts` + `canvas2d/draw.test.ts` — retarget to the new paths. The backend
  still exists and must still compile and pass its tests after this brief; **08** deletes it.
- `engine/ui/src/render/ui-surface.ts` + `ui-surface.test.ts`
- **`games/farm/sim-core/src/render-systems/occluders.ts`** — uses
  `Pick<Canvas2dRenderer, "push">` / `Pick<Canvas2dRenderer, "push" | "pushShadow">` as a purely
  structural type. **Retarget to `Pick<RendererLike, …>`.** A sim-core package must not name a
  backend class at all; that it does today is exactly the kind of coupling this brief removes.
- `games/citadel/client/src/render/quads.ts`, `games/mathquest/client/src/vite-env.d.ts`

**Clean break preferred:** rename `Canvas2dSprite` → `Sprite` everywhere rather than leaving a
compatibility alias. The name is wrong after this migration and nothing outside the repo consumes
these packages. If the rename churns more than ~30 files, keep a one-line
`/** @deprecated use Sprite */ export type Canvas2dSprite = Sprite;` in `sprite-types.ts` and note
it in the tracker for brief 12 to remove.

## Out of scope
- Writing any WebGL2 code (that's 02–07).
- Deleting `canvas2d/renderer.ts` (that's 08). It must still build and its tests must still pass.
- Touching `Ctx2D` *usage* — no `getContext("2d")` call is removed anywhere by this brief.
- Changing `RendererLike`'s shape.

## Acceptance
- `npm run typecheck` clean across the whole workspace (this brief's whole risk is a missed import).
- `npm run test -w @engine/core` green, **including `canvas2d.test.ts` and `webgpu/*.test.ts`** —
  both backends still work; nothing was deleted yet.
- `npm run test -w @engine/ui` green (`ui-surface` imports moved).
- `grep -rn 'canvas2d/types\|canvas2d/draw' engine games tools --include=*.ts` returns **nothing**.
- `grep -rn 'Canvas2dRenderer' games/` returns **nothing** (occluders.ts retargeted).
- A `git diff --stat` the controller can read as "moves and renames only" — if a hunk changes a
  function body, it does not belong in this brief.
