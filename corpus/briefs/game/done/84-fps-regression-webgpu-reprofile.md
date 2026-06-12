# Brief 84 — FPS regression: re-profile on the WebGPU renderer

**Status:** **Done (2026-06-12)** · **Area:** `packages/engine` (WebGPU renderer/camera, debug overlay) + `packages/farm-valley` (main/config, camera, render-loop) · **Drafted:** 2026-06-12

## Resolution (2026-06-12) — regression NOT reproducible on real hardware

A user-supplied real-GPU `?profile` export settled it. **GPU: `ANGLE (AMD Radeon … Direct3D11)`** — a genuine AMD GPU, not SwiftShader. The same build the headless probe measured at ~40 fps runs **99 fps** here, with **`frame` JS 5.0 ms mean / 7.5 ms p95** — well under the 16.6 ms budget. Breakdown: `render.endFrame` 2.7/4.4 ms, `pushSprites` 0.93 ms, `panels` 0.51 ms (`relmatrix` 0.028 ms — the brief-#1 dirty-guard holds), `interp` 0.06 ms; server `tick` 1.06 ms mean. Only isolated p-max spikes (`frame` 25 ms once, `panels` 20 ms once, `tick` 19 ms on a day boundary).

**Verdict:** the original "15–30 fps" was largely a **headless-Chromium-on-SwiftShader (CPU-raster) artifact** — exactly the caveat the 2026-06-11 profile flagged. There is **no GPU-overdraw problem on real hardware** → **task 3 (GPU-overdraw reduction) is closed as unnecessary**; **task 4 (sort-on-dirty) stays deferred** (the profile confirms the sort never shows up). The reading was taken at `zoom: 2` so the clamp's *isolated* contribution is unmeasured — it's kept as cheap insurance for weak/integrated GPUs + high-DPI displays (this reading was a modest 1317×910 @ dpr 0.9), not because real-HW perf needs it.

**Shipped & kept:** (1) `DEFAULT_ZOOM = 2` (task 2) — user chose to keep the framed-in opening shot; (2) the `?profile` **profile-export button** + `window.__exportProfile()` + `DebugOverlay.exportReport()` + WebGL GPU-identity probe ([profile-export.ts](../../../../packages/farm-valley/src/main/profile-export.ts)), which is what made this attribution possible and stays for future render work. **Not changed:** the uncapped render loop (user chose to keep it for input latency, accepting the ~40% discarded-frame power cost on a 60 Hz display).

---

**(Original brief follows.)**

**Status:** Todo · **Area:** `packages/engine` (WebGPU renderer/camera) + `packages/farm-valley` (main/config, render-loop) · **Drafted:** 2026-06-12

The live game runs ~15–30 fps where the baseline was ~60 ([open-questions.md](../../../wiki/open-questions.md) → *FPS regression*, [performance.md](../../../wiki/performance.md) Tier 0). **The existing Tier-0 diagnosis is stale**: it was profiled (2026-06-11) against the **Canvas2D** renderer (full-world CPU blit + two-pass bilinear water fill + ~470 CPU-rastered sprites). The game became **WebGPU-only on 2026-06-12** (`farm-valley` forces `backend: "webgpu"`, [main.ts:60](../../../../packages/farm-valley/src/main.ts#L60)); Canvas2dRenderer survives only for engine tests. WebGPU batches sprites into instanced GPU draws and rasters on the GPU, so the Canvas2D-era "fix #4" (clip the static blit / drop the 2nd water pass) targets a code path the player no longer runs. **This brief re-establishes the bottleneck on the actual renderer before any fix is committed.** Render-only throughout; **zero sim/determinism impact** (re-verify with the fast 3-day/3-seed diff regardless, per the determinism guardrail).

## Read first

- [corpus/wiki/performance.md](../../../wiki/performance.md) — Tier 0 (stale Canvas2D profile; keep for the suspect-number references), the `?profile` / `DebugOverlay` / `window.__frameProfile()` tooling, and the SwiftShader environment caveat.
- [corpus/wiki/status.md](../../../wiki/status.md) — WebGPU-only migration note + the one open Tier-0 thread.
- The WebGPU renderer: [renderer.ts](../../../../packages/engine/src/render/webgpu/renderer.ts) (`endFrame` is the whole per-frame CPU path), [static-layer-pass.ts](../../../../packages/engine/src/render/webgpu/static-layer-pass.ts) (`StaticLayerPass` + `WaterPass`, `zoomedOut = sx < 1`), [sprite-batch.ts](../../../../packages/engine/src/render/webgpu/sprite-batch.ts), [weather-pass.ts](../../../../packages/engine/src/render/webgpu/weather-pass.ts).
- Camera/zoom: [camera.ts](../../../../packages/engine/src/render/camera.ts) (`MIN_ZOOM=0.5`, `MAX_ZOOM=6`, `zoom=1` default → `worldUnitsX = baseUnitsX = WORLD_WIDTH*TILE`, the whole 160-tile world), [config.ts](../../../../packages/farm-valley/src/main/config.ts) (`CAMERA_CONFIG`, `PROFILE_ENABLED`).

## Current state (verified against code 2026-06-12)

- **Default zoom = 1 still spans the whole world.** `Camera2D` starts at `zoom = 1`, where `worldUnitsX = baseUnitsX = WORLD_WIDTH*TILE` ([camera.ts:35-38](../../../../packages/engine/src/render/camera.ts#L35-L38), [config.ts:26-31](../../../../packages/farm-valley/src/main/config.ts#L26-L31)). So the viewport cull in `WebGpuRenderer.push()` ([renderer.ts:286-290](../../../../packages/engine/src/render/webgpu/renderer.ts#L286-L290)) drops nothing at the default zoom — every sprite is packed every frame. This is the one Canvas2D-era observation that **carries over unchanged** to WebGPU.
- **WebGPU already does the cheap things.** Sprite/shadow queues are pooled (no per-frame alloc), sprites pack into a single instance buffer uploaded once, draws are grouped by atlas, water has a `zoomedOut` flag, the static pass takes a visible rect. So the obvious wins are mostly already in.
- **Per-frame whole-queue sort remains.** `this._queue.sort(compareSprite)` runs every frame ([renderer.ts:399](../../../../packages/engine/src/render/webgpu/renderer.ts#L399)) over all in-view sprites (~470 at default zoom). JS-side, sort-on-dirty is still unclaimed.
- **GPU time is invisible to `?profile`.** The overlay's `frame` timer measures only the JS callback (`endFrame` returns after `queue.submit`, before the GPU finishes). A low `frame` JS number with low fps now points at **GPU pass cost** (overdraw: full-world water pass + static pass + ~470 instanced quads + weather), not CPU.
- **Environment ceiling:** the dev box is WSL2; headless Chromium rasters on SwiftShader (CPU), so it cannot validate GPU-raster fixes faithfully. A real-GPU `?profile` reading is required (see Risks).

## Tasks

- [ ] **1. Re-profile on WebGPU first (gates everything else).** On a **real-GPU** browser, `npm run dev` + `?profile`; read overlay `fps` + `frame` mean/p95 and `window.__frameProfile()`. Capture at the default zoom (whole world) **and** zoomed-in (cull active). Record the numbers in performance.md. Decide which branch applies:
  - `frame` JS is low (~5–8 ms) but fps is low → **GPU-raster/overdraw bound** → tasks 2–3.
  - `frame` JS ≥ ~16 ms → a JS path regressed → bisect (`endFrame` sort / pack loop, panels, interp) and fix that instead.
  - **Per the resource rule, ask the user before any longer perf probe**, and capture a before/after per fix.
  - **Tooling (added 2026-06-12):** `?profile` now mounts a bottom-left **"⤓ Export profile"** button (and `window.__exportProfile()`) that downloads a JSON bundle — fps/frame-ms, the live frame + worker profiler reports, camera/zoom + canvas dims, and a **WebGL GPU-identity probe** (distinguishes a real GPU from SwiftShader/llvmpipe). [profile-export.ts](../../../../packages/farm-valley/src/main/profile-export.ts) + `DebugOverlay.exportReport()`. The user runs the live game, clicks the button, and hands back the JSON for attribution.
- [x] **2. Clamp the default zoom so the cull bites (top candidate, cheap). — DONE 2026-06-12 (GPU-independent slice).** Added `DEFAULT_ZOOM = 2` ([config.ts](../../../../packages/farm-valley/src/main/config.ts)); the camera module initializes `zoom = DEFAULT_ZOOM` and `setupCameraListeners` calls `camera.setZoom(zoom)` before the first frame ([main/camera.ts](../../../../packages/farm-valley/src/main/camera.ts)). At zoom 2 `worldUnitsX` = 1280 px (80 tiles) vs the 2560 px (160-tile) world, so `push()` culling + the static/water visible-rect now drop off-screen work. Wheel zoom still reaches `MIN_ZOOM=0.5` for a full-world establishing view. Regression test in [main/camera.test.ts](../../../../packages/farm-valley/src/main/camera.test.ts) asserts a far-corner sprite is culled at `DEFAULT_ZOOM` but not at zoom 1, and guards `DEFAULT_ZOOM > 1`. **OPEN (needs real GPU + product eye):** the exact value (2) and whether the opening shot should still be the whole valley vs framed-in is a visual/product call — confirm on a real GPU and tune the one constant.
- [ ] **3. Reduce GPU overdraw at zoom-out (only if task 1 says GPU-bound).** Candidates, cheapest first: skip/short-circuit the `WaterPass` second pass or simplify the procedural water shader when `zoomedOut`; confirm the static + water passes honor the visible rect (they should already); confirm weather/particle passes are bounded. **Validate each on a real GPU** — SwiftShader will mislead.
- [ ] **4. Sort-on-dirty (JS-side). — EVALUATED, DEFERRED 2026-06-12.** Not worth it / risky as a naive guard: the ~40 movers change `y` every frame (interpolation), so a position-keyed signature is always dirty (no benefit), while a set-keyed guard would skip re-sorts when positions changed → stale z-order → sprites at the wrong depth (visible bug). V8 sort is TimSort (≈O(n) on this nearly-sorted, now-culled queue) and the profile never flagged the sort. A *correct* version (merge movers into a pre-sorted static list) is a bigger change; gate it on the task-1 profile showing the sort actually costs.
- [ ] **5. Determinism + render parity.** Render-only, but run the fast 3-day/3-seed `EXPORT=json` diff to confirm sim untouched (**ask the user first** — resource rule). Spot-check the WebGPU↔Canvas2D parity tests still pass (the renderer comments promise pixel-snap/tint parity).
- [ ] **6.** `npm run typecheck` + `npm run test`.

## Acceptance

- A real-GPU `?profile` reading is recorded in performance.md (before, and after each shipped fix), and the Tier-0 section is rewritten to describe the **WebGPU** path (the Canvas2D profile moves to a "historical / pre-migration" note).
- Steady-state fps at the default view is materially improved toward 60 (target depends on task-1 findings) on a real GPU, with `frame` JS still well under 16.6 ms.
- No sim/determinism change (3-seed diff MATCH); palette guard + render parity tests green.

## Risks / notes

- **Don't reintroduce the Canvas2D fix blindly.** Fix #4 as written (clip static blit / drop 2nd water pass) was scoped to `canvas2d/renderer.ts`. The WebGPU analogue may be a no-op or already handled — task 1 decides.
- **Engine-layer change** — any camera-default or renderer change stays game-agnostic in `@engine/core`; the *policy* (default zoom value, framing target) lives in `farm-valley`.
- **Real-GPU gate is hard on this box.** WSL2 + SwiftShader can't validate GPU-raster fixes; coordinate a real-GPU reading with the user (or a native browser on the host) before committing tasks 2–3. Tasks 4 (sort-on-dirty) and the default-zoom clamp's *cull-activation* logic can be reasoned/tested without a GPU; their *fps payoff* still needs the real reading.
- **Profiler blind spot:** `frame` excludes GPU time. If a fix lowers GPU overdraw, the overlay `frame` number may barely move while fps climbs — trust fps + frame-count, not the JS timer alone.
