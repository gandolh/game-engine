# WebGL2 migration — BUILD ORDER (design of record + wave map)

status: todo
created: 2026-08-18

**Goal: one render backend, WebGL2, everywhere.** Delete `Canvas2dRenderer`. Delete the WebGPU
backends (2D *and* 3D). Every game — Farm Valley, Citadel, MateQuest, Hollow — renders through a
single `WebGl2Renderer` (2D) / `SceneRenderer3D`-on-WebGL2 (3D), on every browser that ships
WebGL2 (~98%, universal on desktop + mobile since ~2017).

This file is the **design of record** and the master ordering for the numbered `webgl2-NN-*`
briefs. Live progress: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md).

---

## Why (the decision, 2026-08-18)

WebGPU compatibility is the trigger. As of 2026-08 WebGPU ships by default in Chrome/Edge (113+),
Safari 26 (macOS Tahoe 26 / iOS 26), and Firefox 141 (Windows) / 145 (macOS ARM64) — but **Firefox
on Linux is still not shipped**, Android Firefox is in progress, and the no-hardware-acceleration
tail (VMs, remote desktops, headless) has already bitten this project twice: the SwiftShader perf
red herring ([../../wiki/performance.md](../../wiki/performance.md) 2026-06-11) and Hollow's
no-GPU-adapter sandbox path.

Today both 2D clients **hard-force** `backend: "webgpu"`, which makes `createRenderer` rethrow
instead of falling back, so an unsupported browser gets a **blank canvas**:
[../../games/farm/client/src/main.ts](../../../games/farm/client/src/main.ts) line ~66,
[../../games/citadel/client/src/render/citadel-renderer.ts](../../../games/citadel/client/src/render/citadel-renderer.ts)
line ~269. Citadel's boot even documents it: *"if WebGPU is unavailable this throws and the surface
stays blank"*.

The alternative — keep WebGPU and add WebGL2 as a *second* GPU backend — was rejected. The
"passes come in pairs" discipline from decision 2026-07-09 has **already drifted** with only two
backends (`setCloudOptions` is WebGPU-only; `OverlayFn` is honoured on Canvas2D and ignored on
WebGPU). Paying that tax across a much larger surface, forever, buys a fast path for browsers
that mostly already run WebGL2 fine. One backend that works everywhere is the better trade.

**What we give up, stated honestly:** compute shaders and storage buffers (neither is used today —
see the feasibility audit below), and WebGPU's lower per-draw CPU overhead. The engine is
*far* under frame budget on real hardware (render frame ~1.4–2.3 ms of a 16.6 ms budget,
[../../wiki/performance-measurements.md](../../wiki/performance-measurements.md)), so the overhead
difference is not load-bearing at this scale.

## Feasibility audit (measured 2026-08-18 — this is why the port is safe)

1. **No game or tool references a `GPU*` type.** Grepped `\bGPU[A-Z][A-Za-z]+` across `games/`,
   `tools/`, and `engine/ui`: **zero hits** outside `engine/core/src/render/webgpu/` and
   `engine/core/src/render3d/webgpu/`. The WebGPU surface is fully contained behind
   `RendererLike`. This migration is engine-internal plus **4 client call sites**.
2. **No compute shaders anywhere.** Zero `@compute` in all 7 WGSL files.
3. **Exactly one WebGL2-incompatible feature in the whole repo:** `var<storage, read> materials:
   array<MaterialEntry>` in
   [../../engine/core/src/render3d/webgpu/shaders/scene3d.wgsl](../../../engine/core/src/render3d/webgl2/shaders/scene3d.frag.glsl)
   (line ~27). WebGL2 has no storage buffers → becomes a **UBO with a compile-time
   `MAX_MATERIALS`** (WebGL2 guarantees ≥16 KB UBOs; the table is small — world keys + agent
   skin/hair/cloth keys). Fallback if it ever outgrows a UBO: an `RGBA32F` lookup texture +
   `texelFetch`. Decided in brief 11.
4. **Instancing maps directly.** `draw(6, instanceCount)` + `@builtin(instance_index)` →
   `drawArraysInstanced` / `drawElementsInstanced` + `gl_InstanceID`, both core in WebGL2 /
   GLSL ES 3.00. No extension needed.
5. **The 3D math layer is backend-agnostic and survives untouched** — `mat4.ts`, `camera3d.ts`,
   `geometry.ts`, `pick.ts` (674 LOC + their tests) live in `render3d/`, not `render3d/webgpu/`.
6. **Testability is unaffected.** Both existing backends are unit-tested against **stubs**, not
   real contexts (`canvas2d.test.ts` stubs `getContext`; `webgpu/renderer.test.ts` stubs
   `requestAdapter`). A mock-GL harness follows the same pattern, so the `node` test env never
   needs a real GL context. **This retires the stated reason Canvas2D was kept** ("a real, tested
   second backend for the `node` test env") — the stub, not the backend, is what makes tests work.

## What is being deleted vs. kept

| Path | Fate |
|---|---|
| `engine/core/src/render/canvas2d/renderer.ts`, `index.ts`, `../canvas2d.test.ts` | **deleted** (brief 08) |
| `engine/core/src/render/canvas2d/types.ts` (`Canvas2dSprite`, `Ctx2D`) | **relocated** (brief 01) — shared vocabulary, 27 files reference these names |
| `engine/core/src/render/canvas2d/draw.ts` (`createOffscreen`, `compareSprite`, `spritesOverlap`, `drawSprite`) | **relocated** (brief 01) — the CPU rasterizer is still needed for **texture baking** and the UI tint cache |
| `engine/core/src/render/webgpu/**` (3,167 LOC, 6 WGSL) | **deleted** (brief 12) after WebGL2 parity |
| `engine/core/src/render3d/webgpu/**` (674 LOC, 1 WGSL) | **deleted** (brief 12) after WebGL2 parity |
| `engine/core/src/render3d/{mat4,camera3d,geometry,pick}.ts` | **untouched** |
| 2D canvas *contexts* (`Ctx2D`) for baking + overlay + `ui-draw` | **kept** — "remove Canvas2D" means the **backend**, not all `Ctx2D` use |

**Do not conflate the two.** `getContext("2d")` is load-bearing inside the GPU backend itself
(static-layer bake at `webgpu/static-layer-pass.ts` ~line 230 and ~470, `webgpu/overlay-2d.ts`,
`ui-draw.ts`, `rain-field.ts`, Citadel's atlas + `citadel-renderer.ts`). All of that stays.

## Locked constraints (carry into every brief)

- **`RendererLike` is the contract and it does not change shape.** The interface at
  [../../engine/core/src/render/renderer.ts](../../../engine/core/src/render/renderer.ts) is the seam
  that makes this migration cheap. Ports implement it; they do not redesign it. **One exception:**
  `setCloudOptions?` becomes **required** (it was optional only because Canvas2D lacked it), and
  `OverlayFn` gets a single defined behaviour instead of one-per-backend.
- **Visual parity is the acceptance bar, not "tests pass."** Standing project lesson
  ([memory: verify integration not just tests]) — green subagent tests have twice hidden inert
  features. Every pass brief must be verified by *looking at the rendered result*, and the
  controller re-verifies in a real browser at the wave gate.
- **Palette discipline is enforced by a guard test.** Every colour comes from a named palette-role
  constant — **including inside GLSL**. No raw hex in shaders; colours arrive as uniforms from
  `EDG.*` (engine/Farm), `CITADEL_PAL.*` (Citadel), `MATE_PAL.*` (MateQuest), `HOLLOW_PAL.*`.
- **Do not regress the shipped tint-cache win.** The per-`(atlas, frame, rgb)` tint cache in
  `ui-draw.ts` took Farm from **3.36 → 57.06 fps** (brief 118, `4fd48dc`). It lives in the shared
  CPU rasterizer, so it survives the backend swap — but brief 05 must prove it still bites.
- **No `.js` import suffixes. Pinned versions (no `^`/`~`). TS strict** +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any` without a comment.
- **Determinism is untouched by this work.** Rendering is downstream of the sim; no brief here may
  touch sim code or introduce `Math.random()`/`Date.now()` into a sim path.
- **Constrained hardware.** Narrowest test scope while working (`-w @engine/core`), never the full
  repo suite mid-wave. **Never run a determinism/EXPORT check** — the controller asks the user.
- **Subagent git rules.** No `git reset` / `checkout` / `stash`. Commit only your own paths
  (concurrent sessions share the tree). Worktrees are created from **current `main`**, and every
  merge is diffed against `main` before integration.

## Wave map (dependency-ordered — this is what the orchestrator runs)

Wave 2's six briefs all create **disjoint new files** under `render/webgl2/` or `render3d/webgl2/`
and only *read* the WGSL originals, so they parallelize cleanly (wave-grouped by file overlap per
the project's worktree-swarm pattern).

```
WAVE 1  foundation
  01  relocate shared 2D vocabulary out of canvas2d/     [wide edits — runs alone-ish]
  02  WebGL2 context + shader tooling + GLSL lint guard  [new files only]

WAVE 2  the passes  (6 parallel)
  03  sprite-batch + texture-atlas + shadow-batch   ← the core quad path
  04  static-layer + water
  05  tint pass + overlay-2d + UI quad flush        ← guards the tint-cache perf win
  06  particles + weather
  07  cloud-shadow / warm-haze  (setCloudOptions becomes universal)
  10  render3d: GL device + buffers + pipeline cache

WAVE 3  assembly  (2 parallel)
  08  WebGl2Renderer + single-backend createRenderer + DELETE canvas2d backend
  11  scene3d GLSL + SceneRenderer3D on WebGL2 (materials UBO — see audit #3)

WAVE 4  integration
  09  switch all 4 client call sites + unsupported-WebGL2 screen + real-browser verification

WAVE 5  cleanup  (2 parallel)
  12  DELETE both WebGPU backends + purge @webgpu/types from 16 package.json files
  13  corpus: retire decision 2026-07-09, rewrite the WebGPU-only claims, log it
```

**Gate between every wave** (controller runs it, not the subagent): `npm run typecheck` across the
workspace + `npm run test -w @engine/core` + `git status --porcelain` shows the expected new files.
Commit only when green. Waves 3→4 additionally require the controller to *open the game* and look.

## Brief index

| # | Brief | Wave |
|---|---|---|
| 01 | [shared 2D vocabulary relocation](2026-08-18-webgl2-01-shared-2d-vocabulary.md) | 1 |
| 02 | [GL context + shader tooling](2026-08-18-webgl2-02-gl-context-and-shader-tooling.md) | 1 |
| 03 | [sprite + shadow batch](2026-08-18-webgl2-03-sprite-and-shadow-batch.md) | 2 |
| 04 | [static layer + water](2026-08-18-webgl2-04-static-layer-and-water.md) | 2 |
| 05 | [tint + overlay-2d + UI quads](2026-08-18-webgl2-05-tint-overlay-and-ui.md) | 2 |
| 06 | [particles + weather](2026-08-18-webgl2-06-particles-and-weather.md) | 2 |
| 07 | [cloud shadow + haze](2026-08-18-webgl2-07-cloud-shadow-and-haze.md) | 2 |
| 08 | [WebGl2Renderer assembly](2026-08-18-webgl2-08-renderer-assembly.md) | 3 |
| 09 | [client switch + fallback screen](2026-08-18-webgl2-09-client-switch-and-fallback.md) | 4 |
| 10 | [render3d GL device + buffers](2026-08-18-webgl2-10-render3d-device-and-buffers.md) | 2 |
| 11 | [render3d scene shader + renderer](2026-08-18-webgl2-11-render3d-scene-renderer.md) | 3 |
| 12 | [delete WebGPU + purge types](2026-08-18-webgl2-12-delete-webgpu.md) | 5 |
| 13 | [corpus + decisions update](2026-08-18-webgl2-13-corpus-and-decisions.md) | 5 |
