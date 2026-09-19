# sweep-06 — the DPR cap is re-derived in seven places, Hollow's 3D omits it, and two `resize()` methods take opposite units

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. Same class as
[sweep-02](2026-09-19-sweep-02-apollo-palette-five-copies.md) (one value, many hand-kept copies) and
[audit-60](2026-09-18-audit-60-tile-constant-fifteen-copies.md) (one `TILE`) — except this copy
set has **already diverged**, and the divergence is in the one game with a 3D layer.

## The gap, in three parts

### 1. One constant, seven derivations, six of them literals

The engine's device-pixel-ratio ceiling is
[`gl-context.ts`](../../../engine/core/src/render/webgl2/gl-context.ts):

```ts
const MAX_DPR = 2;
```

It is `private` to that module — not exported, not on any barrel. So every other site that needs the
same number writes it again:

| # | file | form |
|---|---|---|
| 1 | [`engine/core/src/render/webgl2/gl-context.ts`](../../../engine/core/src/render/webgl2/gl-context.ts) (~126) | uses `MAX_DPR` — **the only one** |
| 2 | [`engine/core/src/render/webgl2/renderer.ts`](../../../engine/core/src/render/webgl2/renderer.ts) (~721) | `Math.min(… , 2)` literal, in the UI flush |
| 3 | [`engine/core/src/render/overlay-2d.ts`](../../../engine/core/src/render/overlay-2d.ts) (~94) | `Math.min(… , 2)` literal, in `beginFrame` |
| 4 | [`games/citadel/client/src/main/screen-mapping.ts`](../../../games/citadel/client/src/main/screen-mapping.ts) (~19) | literal |
| 5 | same file (~38) | literal — **twice in one file** |
| 6 | [`games/citadel/client/src/main/input.ts`](../../../games/citadel/client/src/main/input.ts) (~369) | literal |
| 7 | [`games/citadel/client/src/render/transform.ts`](../../../games/citadel/client/src/render/transform.ts) (~90) | literal |

Four more places restate it in **prose**: `overlay-2d.ts` (~82) and `gl-context.ts` (~116) both
document the formula, `renderer.ts` (~399) says *"GlContext.resize takes CSS pixels and applies
min(devicePixelRatio, 2)"*, and `transform.ts` (~86) says *"store (min(devicePixelRatio, 2))"*.

### 2. Hollow's 3D layer does not cap at all

Three sites use the raw ratio:

| file | code |
|---|---|
| [`games/hollow/client/src/render3d/app.ts`](../../../games/hollow/client/src/render3d/app.ts) (~365) | `const dpr = window.devicePixelRatio \|\| 1;` |
| [`games/hollow/client/src/main.ts`](../../../games/hollow/client/src/main.ts) (~470) | same, for the overlay canvas + `ctx.setTransform(dpr,…)` |
| [`games/hollow/client/src/render3d-demo.ts`](../../../games/hollow/client/src/render3d-demo.ts) (~329) | same |

So on a DPR-3 display Hollow's 3D scene renders **2.25× the fragments** the engine's own 2D path
considers its ceiling, and 9× a DPR-1 render. Hollow is the only game with a **3D** layer — depth test,
cull, per-fragment shading — which makes it the worst game to uncap, and the only one that is.

### 3. Two `resize(w, h)` methods, same shape, opposite unit contracts

| method | takes | caps DPR? |
|---|---|---|
| [`GlContext.resize`](../../../engine/core/src/render/webgl2/gl-context.ts) | **CSS pixels** — its doc calls this *"the non-negotiable invariant shared with `RendererLike`: callers always author in CSS pixels, the backend scales by DPR internally"* | **yes**, internally |
| [`SceneRenderer3D.resize`](../../../engine/core/src/render3d/webgl2/renderer3d.ts) (~291) | **device pixels** — it just does `gl.viewport(0, 0, w, h)`; its doc says *"match the current canvas size"* | **no** |

Two same-named, same-signature, same-engine methods where passing one's argument to the other is
silently wrong. `app.ts` computes device pixels and calls the 3D one, which is self-consistent — so
nothing is broken *today*. It is wrong the first time anyone reaches for the method they remember.

## Why it is worth fixing, stated honestly

**The 2D side is debt; the Hollow side is a live perf gap; the `resize` pair is a trap.**

- Copies 2–7 are correct today. Verified. Nothing is rendering wrong.
- But copies 4–7 are **input→world mapping in Citadel**, and copy 1 is **the renderer's viewport**. If
  `MAX_DPR` is ever raised (a reasonable future call — 2 is conservative on a modern 3× phone), the
  renderer changes and Citadel's pointer mapping does not. The failure mode is *clicks landing on the
  wrong tile*, scaling with DPR, on high-DPI machines only, with every test green — because each copy
  is self-consistent and nothing asserts they agree.
- Hollow's uncapped path is a real cost on real hardware right now, and the project has been bitten by
  exactly this shape before: [open-questions.md](../../wiki/open-questions.md) records `DEFAULT_ZOOM = 2`
  being kept as *"insurance for weak/integrated GPUs + high-DPI."* The insurance was bought for the 2D
  path and never extended to the 3D one.

## What to do

1. **Export the cap and the derivation from the engine.** Add to `@engine/core/render` something like
   `MAX_DEVICE_PIXEL_RATIO` and `effectiveDpr(): number` (the whole
   `Math.min(window.devicePixelRatio || 1, MAX)` expression, including the `typeof window` guard the
   engine copies already carry for the `node` test env). One function, one place.
2. **Replace all seven derivations with a call to it**, including both engine-internal literals. Delete
   the four prose restatements or reduce them to *"see `effectiveDpr`"* — a formula written in four
   comments is four things to update.
3. **Apply it to Hollow's three sites.** This is the behaviour change in the brief: Hollow's 3D scene
   and its overlay canvas start capping at 2. Expect a **visible** difference on a DPR-3 display —
   slightly softer, much cheaper. That is the intended trade and the same one the 2D path already made;
   record it in the closeout as a deliberate change, not a silent one.
4. **Make the overlay and the 3D canvas provably share one ratio.** Hollow computes DPR twice (`app.ts`
   for the GL canvas, `main.ts` for the overlay, then `ctx.setTransform(dpr,…)`). Two independent reads
   of a value that must match is how misaligned name-tags happen. One call site, one value, passed.
5. **Name the unit in the 3D signature.** Either rename to
   `resizeDevicePixels(widthPx, heightPx)`, or give it the CSS-pixel contract its 2D sibling has and
   let it apply `effectiveDpr()` itself. Prefer the second — one contract across the engine beats two
   honestly-named ones. Either way it must stop being *`resize(w, h)` meaning something different from
   the other `resize(w, h)`*.
6. **Consider a guard**, in the repo's established idiom (palette scan, layering scan, GLSL lint): a
   test that greps `engine/` + `games/` for `devicePixelRatio` and fails on any occurrence outside the
   one engine helper. That is what turns this from a fix into a fix that stays fixed.

## Files you OWN
- `engine/core/src/render/palette.ts`'s neighbours — wherever `@engine/core/render` is the right home
  for `effectiveDpr` (do **not** put it in `gl-context.ts`; non-WebGL2 callers need it)
- `engine/core/src/render/webgl2/gl-context.ts`, `.../webgl2/renderer.ts`, `.../overlay-2d.ts`
- `engine/core/src/render3d/webgl2/renderer3d.ts` (the signature)
- all four Citadel sites, all three Hollow sites

## Files you must NOT touch
- `DEFAULT_ZOOM` and anything else in the zoom/camera path — this is about the backing-store scale, not
  the camera. Conflating them was a 2026-06-12 mistake (brief 84); do not repeat it.
- The *value* 2. This brief centralizes the cap; it does not retune it. Changing 2 to 3 is a separate,
  measured call.

## Acceptance
- `grep -rn "devicePixelRatio" engine games --include=*.ts` returns **one** production site (the new
  helper) plus tests that deliberately stub it.
- **Hollow measured before/after** on a DPR > 1 display: canvas backing-store dimensions and frame time
  for the 3D scene, recorded in [performance-measurements.md](../../wiki/performance-measurements.md).
  If the machine is DPR 1, say so — the change is then unobservable there and the claim must not be
  made anyway.
- **Citadel pointer mapping unchanged**: click a known tile at DPR 1 and at a simulated DPR 2 and
  confirm the same tile is hit. This is the regression the refactor could plausibly introduce.
- Hollow's name-tag overlay still aligns with agent heads after the change (the two-DPR-reads risk).
- `npm run typecheck` + `npm run test -w @engine/core` + both clients' suites + `npm run gates`.
