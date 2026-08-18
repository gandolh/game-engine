# WebGL2 migration — BUILD STATE / RESUME (live tracker)

status: **WAVE 1 COMPLETE** (briefs 01, 02) — gate green, committed. Wave 2 (03/04/05/06/07/10) next.
updated: 2026-08-18

**Read this first to resume.** Design-of-record is
[2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) — read it before any
brief. This file is the live progress tracker.

**The decision (2026-08-18, user directive):** remove Canvas2D, remove WebGPU, **one backend —
WebGL2** — for all four games including Hollow's 3D. Trigger was WebGPU browser support (Firefox on
Linux still unshipped; both 2D clients hard-forced `backend: "webgpu"` and gave unsupported browsers
a blank canvas). Rationale and the rejected alternative are in the BUILD ORDER.

## Progress

| # | Brief | Wave | Status | Commit | Notes |
|---|---|---|---|---|---|
| 01 | shared 2D vocabulary relocation | 1 | **DONE** | see git log | clean break, no compat alias; hit a pre-existing `Sprite` name collision (below) |
| 02 | GL context + shader tooling | 1 | **DONE** | see git log | 8 new files, 33 tests incl. lint negative fixtures |
| 03 | sprite + shadow batch | 2 | **DONE** | _pending wave-2 gate_ | 29 tests + real-browser screenshot; adds a `setView` call brief 08 MUST make |
| 04 | static layer + water | 2 | TODO | — | |
| 05 | tint + overlay-2d + UI quads | 2 | TODO | — | |
| 06 | particles + weather | 2 | TODO | — | |
| 07 | cloud shadow + haze | 2 | **DONE** | _pending wave-2 gate_ | 77 tests; 3 real-WebGL2 screenshots, quantization intact |
| 10 | render3d device + buffers | 2 | **DONE** | _pending wave-2 gate_ | buffers.ts moved up (pure CPU packing); 15 new tests; depth-context caveat below |
| 08 | WebGl2Renderer assembly | 3 | TODO | — | |
| 11 | render3d scene renderer | 3 | TODO | — | |
| 09 | client switch + fallback screen | 4 | TODO | — | |
| 12 | delete WebGPU + purge types | 5 | TODO | — | |
| 13 | corpus + decisions update | 5 | TODO | — | |

## How we're building it
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (standing user directive). **Never fable.**
- **New branch off current `main`** (`webgl2-migration`). Note: a stale `webgpu-migration` branch
  already exists from the *previous* migration — do not confuse or reuse it.
- Wave-2 briefs are worktree-parallel (disjoint new files). Per the project's worktree-swarm pattern:
  create every worktree from **current `main`**, and **diff each against `main` before merging** — a
  stale worktree base has bitten this repo before (Citadel Phase 3).
- **Verify gate after every wave** (controller runs it, not the subagent): `npm run typecheck`
  (workspace) + `npm run test -w @engine/core` (narrow) + `git status --porcelain` shows the expected
  new files. Commit only when green. Waves 3→4 additionally require the controller to **open the game
  and look**.

## Constraints (carry into every dispatch)
- **Visual parity is the acceptance bar, not green tests.** Standing lesson: green subagent tests have
  twice hidden inert features (dead economy in Phase 2, inert hazards in 4.5). This migration's
  failure mode is precisely "compiles, renders nothing" — every pass brief owes a screenshot.
- **Constrained hardware:** narrowest test scope while working; full suite only at briefs 09 and 12.
  **Never** run a determinism/EXPORT check — the controller asks the user first.
- **Palette rule reaches into GLSL.** No colour literals in shaders; colours arrive as uniforms from
  `EDG.*` / `CITADEL_PAL.*` / `MATE_PAL.*` / `HOLLOW_PAL.*`. Enforced by `glsl-lint.test.ts` (brief 02).
- **No `.js` import suffixes. Pinned versions. TS strict** + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`.
- **Sim code is off-limits.** Rendering is downstream of the snapshot; no brief here touches a system,
  an agent, or the scheduler. Determinism is unaffected by design.
- **Subagent git rules:** no `git reset` / `checkout` / `stash`; commit only your own paths
  (concurrent sessions share the tree); the controller verifies exit status itself.

## Wave 1 gate result (controller-verified 2026-08-18, not taken on report)
- `npx turbo run typecheck --force` → **19/19 packages, 0 cached** (a cached pass proves nothing; forced).
- `npm run test -w @engine/core` → **41 files / 322 tests passed**.
- `npm run test -w @engine/ui` → **9 files / 171 tests passed**.
- `git check-ignore` on `render/webgl2/`, `sprite-types.ts`, `raster2d.ts` → **empty** (nothing built
  green from files git was silently ignoring).
- `canvas2d/` now holds exactly `renderer.ts` + `index.ts` — precisely what brief 08 deletes.

## Controller-side work done at the wave-1 gate
- **Relocated `ViewUniform`** to `engine/core/src/render/view-uniform.ts` (backend-neutral), exported
  from `render/index.ts`, and re-exported from `webgpu/gpu-context.ts` for back-compat. Its doc
  comment now records the thing that will otherwise be re-broken: **two different instances are
  computed per frame and are not interchangeable** — the clip-space one (`scaleY` already NEGATIVE,
  Y-flip baked in) for GPU passes, and the screen-pixel one (both scales POSITIVE) for the 2D overlay.
  Brief 05's scope was updated to say "already done, don't move it again".
- **Repointed two stale wiki deep-links** that brief 01's move broke: `wiki/architecture.md`
  (`spritesOverlap`) and `wiki/performance.md` (the pixel-snap item) → `render/raster2d.ts`.
  `corpus/lint.sh` is green again.

## 🔴 Live bug found while planning wave 2 (2026-08-18) — Farm's night lighting is dead

Grepping for real `OverlayFn` callers (to decide brief 05's "implement or delete?" question) turned up
a **shipped, user-visible bug that predates this migration**:

- `games/farm/client/src/main/render-loop.ts` ~972 calls
  `renderer.endFrame(wash, particles, rain, lightOverlay)`.
- `lightOverlay` = `makeLightOverlay(nightness, view)` from `games/farm/client/src/render/lights.ts`
  ~25 — Farm's **night lighting**: warm radial glows via `createRadialGradient`, composited with
  `globalCompositeOperation = "lighter"`, gated on `nightness > NIGHT_GATE`, viewport-culled.
- `WebGpuRenderer.endFrame` takes the parameter as **`_overlay` and never invokes it.**
- Farm has been **WebGPU-forced**, so those glows have not rendered at all. Citadel's
  `render/atmosphere.ts` ~16 documents the no-op explicitly and nobody connected it to Farm.

**This is the third instance of this project's recurring failure mode** (after the Phase 2 dead economy
and the 4.5 inert hazards): a feature that is wired, tested-adjacent, and completely inert at runtime.
It was invisible because the parameter is *optional* — passing it costs nothing and silently does
nothing.

**Resolution:** brief 05 now implements `OverlayFn` properly rather than choosing between "implement or
delete" — and implements it **additively**, not by the naive route. Drawing the callback straight onto
the transparent `Overlay2D` canvas would look plausible but be wrong: that canvas is alpha-composited
over the world, so an additive glow becomes a translucent haze instead of light *added* to the scene.
Correct approach (the idiom `static-layer-pass.ts` already uses): run the callback into an offscreen 2D
canvas under the world transform, upload as a texture, draw one full-screen quad with additive
blending — **after** sprites, **before** the day/night wash, so glows lift the darkened scene. Brief
05's acceptance now requires a Farm-at-night screenshot showing the restored glows.

## Lane reassignment before wave 2 (controller, 2026-08-18)
Briefs 05 and 07 as written would **both** have edited `render/renderer.ts` (the `RendererLike`
interface) — a shared hub file, so they were not actually parallel-safe. Rather than serialize them,
both interface changes moved to **brief 08**, which already owns that file and where they first become
*safe*: making `setCloudOptions` required while `Canvas2dRenderer` still exists would break the
workspace typecheck until that class is deleted. Brief 08 now also owns the three guarded
`setCloudOptions` call sites in Farm/Citadel. Wave-2 agents are explicitly barred from
`render/renderer.ts` and `render/index.ts`.

## ⚠️ Controller TODO at the wave-2 gate — make the depth-enabled context explicit

Brief 10 needed a **depth buffer** for 3D, but the shared `GlContext` is created with `depth: false`
(correct for the CPU-sorted 2D sprite path) and `gl-context.ts` was another agent's lane this wave. Its
workaround: `GlDevice3d.create()` calls `canvas.getContext("webgl2", { depth: true, … })` **itself,
before** calling `createGlContext(canvas)`, relying on the spec rule that **the first `getContext` call
for a given type wins the attributes** and every later call returns that same context, silently
ignoring the new attrs.

That is genuinely how the spec behaves, and the agent flagged it rather than hiding it. But it is an
**order-dependent, silent failure mode**: if anything ever calls `createGlContext(canvas)` first, 3D
loses its depth buffer and Hollow renders depth-garbage **with no error at all**. That is precisely the
class of bug this migration has already found one of.

**Decision: give `createGlContext` an explicit options parameter** (`{ depth?: boolean }`, defaulting
to today's `false`) and have `GlDevice3d` ask for depth by name. Optional param ⇒ backward-compatible
with every wave-2 pass already written against the current signature. Controller does this at the
wave-2 gate, once no agent is holding the file.

## ⚠️ Second controller TODO at the wave-2 gate — the GLSL lint scans comments

Brief 07 hit **two lint false positives that were both in its own comments, not its code**: the
reserved-word scan flagged the word `in` inside the prose "a pseudo-random float in [0,1)", and the
colour-literal scan flagged `vec4(0,0,0,0)` inside the prose "naturally evaluates to vec4(0,0,0,0)".
It did the right thing — reworded the comments rather than weakening the lint — but this will keep
biting every future shader author, and the failure mode is confusing (a lint error pointing at a
sentence).

**Fix at the gate: strip `//` and `/* */` comments before applying the rules.** Cheap, removes a
recurring papercut, and makes the remaining hits real. Keep scanning comments for nothing.

## ⚠️ Orchestration hazard discovered — the browser tool is a SHARED resource across parallel agents

Brief 07 called `agent_browser_close({ all: true })` when finishing its visual proof, which closed
**every** active browser session — including one named `webgl2-05-brief` belonging to the concurrently
running brief 05. It flagged this itself rather than staying quiet, which is the only reason we know.

**Lesson for future waves: browser sessions are global, not per-agent.** File lanes protect the
filesystem but nothing protects the browser. Either (a) tell each parallel agent to close only its own
named session, never `all: true`, or (b) serialize the visual-verification step. Watch brief 05's
report for a truncated verification and re-dispatch just that step if so.

## Decisions taken during the build
_(append as they land — brief 13 folds these into the wiki)_
- **2026-08-18** — `MAX_MATERIALS` UBO size for `scene3d`: _pending brief 11._
- **2026-08-18** — `TEXTURE_2D` per sheet vs `TEXTURE_2D_ARRAY` for the atlas store: _pending brief 03._
- **2026-08-18** — `OverlayFn`: implement on the overlay canvas, or delete from `RendererLike`?
  _pending brief 05's grep for real callers._
- **2026-08-18 (brief 02, ACCEPTED)** — **DPR lives inside `GlContext.resize`.** WebGPU's
  `gpu-context.ts#resize` takes dimensions the *caller* (`WebGpuRenderer.beginFrame`) has already
  DPR-scaled. The WebGL2 version inverts this: `resize(cssWidth, cssHeight)` takes **CSS pixels** and
  applies `min(devicePixelRatio, 2)` internally, then syncs `gl.viewport`. Justified — brief 02
  assigns "DPR sizing" to that module. **Consequence for brief 08: call
  `resize(canvas.clientWidth, canvas.clientHeight)` and do NOT re-apply DPR on top, or every
  coordinate is double-scaled.**
- **2026-08-18 (brief 02, DEFERRED to the controller)** — **`ViewUniform` was NOT relocated.** It
  still lives only in `webgpu/gpu-context.ts`. This is a **plan gap**: briefs 03/04/06/07 all consume
  a view record and were scheduled in the same wave as brief 05, which owned the move — so they had
  no valid path to import from. **Resolved by the controller at the wave-1 gate:** `ViewUniform` moves
  to a backend-neutral `render/view-uniform.ts` before wave 2 dispatches, and brief 05's scope drops
  that item. Field order is fixed and shared by every pass:
  `{scaleX, scaleY, offsetX, offsetY, timeSec, windStrength}`.
- **2026-08-18 (brief 03, API ADDITION — brief 08 must honour it)** — **`SpriteBatch.setView(view)`
  and `ShadowBatch.setView(view)` are NEW methods with no WebGPU counterpart, and must be called ONCE
  PER FRAME before any `drawRange`/`draw`.** WebGPU shared the view via bind-group 0 across pipelines;
  WebGL2 has no equivalent for independently-compiled programs without a UBO, and the view record was
  deliberately left as scalar uniforms. Per-frame order is therefore:
  **`setView` → `begin` → `add`* → `upload` → `drawRange`*.** Omitting `setView` yields a valid draw
  call that renders nothing visible — exactly the silent-failure shape to watch for.
- **2026-08-18 (brief 03)** — **v-flip fixed in exactly one place**: `UNPACK_FLIP_Y_WEBGL = true`
  around `texImage2D` in `GlAtlasStore.add()`, reset to `false` immediately after; `uv()` does **no**
  extra flip. One `TEXTURE_2D` per sheet (not `TEXTURE_2D_ARRAY`) — `AtlasUV.layer` is always 0 in the
  original and never used for indexing.
- **2026-08-18 (brief 03)** — blend state translated literally from the WebGPU pipeline:
  `blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)` +
  `blendEquationSeparate(FUNC_ADD, FUNC_ADD)` — i.e. **premultiplied**, matching the context's
  `premultipliedAlpha: true`.
- **2026-08-18 (brief 03)** — WebGL2 has **no base-instance parameter**, so `drawRange`'s `first`
  offset is implemented by re-pointing every per-instance attribute at `first * 64` bytes before
  `drawArraysInstanced(TRIANGLES, 0, 6, count)`. Relatedly, both batches rebuild their per-instance
  attribute bindings on **every** draw rather than baking them into the VAO once: growing the instance
  buffer replaces the underlying `WebGLBuffer`, and a VAO pins the actual buffer object, so a one-time
  binding would silently point at a deleted buffer after the first capacity doubling.
- **2026-08-18 (brief 10)** — `pipeline-cache` for 3D is keyed by **`toonSteps` only**; WebGPU's
  `format` key was dropped rather than faked, since `GPUTextureFormat` has no WebGL2 meaning. Vertex
  attribute locations are **fixed in the cache** (loc0 position.xyz, loc1 materialIndex; loc2–5 model
  matrix columns, loc6 tint, all `divisor:1`), mechanically derived from `FLOATS_PER_VERTEX` (4) and
  `FLOATS_PER_INSTANCE` (20) — so brief 11's GLSL must declare matching `layout(location = N)`.
  `MAX_UNIFORM_BLOCK_SIZE` is queried once at device creation and exposed as
  `GlDevice3d.maxUniformBlockSize`, which brief 11 sizes `MAX_MATERIALS` against.
- **2026-08-18 (brief 02)** — no UBO for the view record: 6 floats go through scalar
  `uniform1f`/`uniform2f` via `uniformLocations`. Passes may roll a UBO for parity if they prefer;
  neither is mandated.
- **2026-08-18 (brief 01, ACCEPTED after controller review)** — **`Sprite` is an overloaded name in
  this package and the flat barrel keeps its OLD meaning.** Renaming `Canvas2dSprite` → `Sprite`
  collided with a **pre-existing ECS component also called `Sprite`**
  (`engine/core/src/ecs/components.ts`, fields `atlasId/frame/layer/tintRgba`, used by
  `GameEntity.sprite`). Both are wildcard-re-exported by `engine/core/src/index.ts`, which produced a
  real `TS2308` ambiguous-export error. Resolution: an explicit
  `export type { Sprite } from "./ecs";` in the package barrel, so **bare `@engine/core` → the ECS
  component** (exactly its pre-existing meaning — no consumer changed behaviour), and **the render
  `Sprite` must be imported from the `@engine/core/render` subpath**. Six call sites were retargeted.
  Accepted over the alternatives (renaming the ECS component would touch sim code, which is
  out of scope for this migration; reverting the rename would defeat brief 01).
  **Every downstream brief: import the render `Sprite` from `@engine/core/render`, never from
  `@engine/core`.**

## Verified-in-browser screenshots
_(the evidence trail brief 12 relies on before it deletes the WebGPU reference implementation.
Scratchpad paths are session-local — brief 09 re-verifies in the assembled build, which is the
durable check.)_
- **brief 03** — `scratchpad/webgl2-03-visual-proof.png`: real Farm `characters`/`props` atlases, 4
  character frames (one flipped, one rotated, one tinted) + 3 prop frames across two `drawRange`
  texture groups + one shadow ellipse. Confirms sprites right-side-up (v-flip correct), no dark edge
  fringing (blend state correct), shadow blends onto the ground colour.
- **brief 07** — `scratchpad/01-shadow-mode.png`, `02-haze-mode-darkbg.png` (+ `02-haze-mode.png`),
  `03-vignette.png`: real `getContext("webgl2")` in Chromium driving the shipped GLSL verbatim.
  **All three show hard step-quantized tiers, never a smooth gradient** — the stated failure condition
  for this pass. Haze is near-invisible over saturated green (expected: low max alpha), hence the
  dark-background capture.
  WebGPU side-by-side was attempted and is **inconclusive, not evidence**: adapter/device/pipeline all
  created without error but the composited canvas showed nothing — consistent with the project's known
  no-GPU-adapter sandbox limitation, not a WGSL bug.

## Known risks going in
1. **MateQuest is the behavioural change.** It is the only game that ran on Canvas2D, so it is the
   only one moving to a GPU backend for the first time rather than between GPU backends. Expect
   trouble there, not in Farm.
2. **Texture v-origin flip** (WebGPU v=0 top, WebGL v=0 bottom). Fix in exactly one place; doing both
   cancels out and doing neither renders everything upside down.
3. **Blend state** — translate each pipeline's blend descriptor literally rather than assuming
   `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`. Wrong premultiplication gives dark fringes on pixel-art edges:
   subtle enough to ship, obvious in a screenshot.
4. **Winding + depth convention** in 3D (brief 11) — a mismatch renders Hollow's town inside-out.
   Fix in the renderer, never in the shared `mat4.ts`.
5. **Context loss** is routine on WebGL2 (unlike WebGPU) and has no existing analogue in this
   codebase. Brief 02 delivered the seam (`isLost()`, `onContextLost`/`onContextRestored`) and loss
   now degrades quietly. **Full resource re-creation on restore remains unimplemented** — every
   pass's buffers/textures/programs/VAOs are invalidated by a loss and nothing rebuilds them, so a
   loss+restore cycle leaves a frozen or black canvas. **Filed 2026-08-18 as
   [2026-08-18-webgl2-followup-context-loss-recovery.md](2026-08-18-webgl2-followup-context-loss-recovery.md)**
   — it is NOT in the 13-brief scope and must not be silently absorbed into one.
6. **The GLSL lint's colour rule is a regex, not a compiler.** It flags any `vec3`/`vec4` built from
   3–4 numeric literals, so a legitimate hardcoded non-colour vector (a fixed direction, say) will
   false-positive. Correct response is to source the value from a uniform/constant — **not** to relax
   the rule. Pass authors: read the rules in brief 02's handoff before writing a shader.
6. **`@webgpu/types` is in 16 `package.json` files** because the `@engine/core` barrel transitively
   re-exported the WebGPU passes. Brief 12 must verify the GLSL equivalent does *not* leak the same
   way rather than mirroring the old workaround.
