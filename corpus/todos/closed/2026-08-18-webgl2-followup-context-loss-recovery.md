# WebGL2 follow-up — resource re-creation after context loss

status: **DONE 2026-08-18** (implemented after the 13 briefs; see the resolution note at the end)
created: 2026-08-18
context: [2026-08-18-webgl2-00-BUILD-ORDER.md](closed/2026-08-18-webgl2-00-BUILD-ORDER.md) · discovered during brief 02

## The gap

WebGL2 contexts are lost routinely — tab backgrounding, GPU reset, a driver hiccup, or a laptop
switching GPUs. WebGPU had no equivalent exposure in this codebase, so nothing here has ever had to
handle it.

Brief 02 delivered the **seam**: `GlContext` registers `webglcontextlost` (with `preventDefault()`)
and `webglcontextrestored`, exposes `onContextLost` / `onContextRestored` / `isLost()`, and every pass
no-ops its draw while lost. That much means a loss no longer produces a wall of GL errors.

**What is still missing:** on restore, nothing re-creates GPU resources. Every buffer, texture,
program, and VAO in every pass is invalidated by the loss, and no pass rebuilds them. So the observed
behaviour after a loss+restore cycle is a **frozen or black canvas that never recovers**, with the sim
still happily running underneath.

This was deliberately deferred rather than bolted onto brief 02 — it is cross-cutting work that
touches every pass, and it could not be designed sensibly before the passes existed.

## Why this needs its own brief
It is the one *regression relative to WebGPU* that the migration introduces. Everything else in the
migration is parity or an improvement. Left unfiled it would surface later as a vague
"the game goes black after I come back to the tab" bug, which is expensive to diagnose from that
symptom and trivial to fix from this description.

## Sketch of the work
- Give each pass a `recreate(gl)` (or make construction cheap and re-runnable) and have the renderer
  re-run it on `onContextRestored`.
- Re-upload what the CPU still owns: atlas textures (`LoadedAtlasImage` is retained), the baked static
  layer and water pattern (the CPU bake inputs are retained — this is why the CPU rasterizer staying
  is load-bearing), and every static geometry buffer.
- Decide what to do about a loss mid-frame vs. between frames.
- The renderer should surface a "restoring" state so a client can show something honest rather than a
  black rectangle.

## Verification
Chrome's `WEBGL_lose_context` extension can force loss and restore on demand — drive it from the
console in Farm and Citadel, confirm the world comes back intact (terrain, water, sprites, UI text),
and confirm the sim never stalled.


---

## Resolution (2026-08-18)

Implemented in `engine/core/src/render/webgl2/renderer.ts`.

**Approach: rebuild + replay, not repair.** A restored context hands back the same `gl` object, but
every texture/buffer/program/VAO it vended is dead and unreadable — so the renderer retains the
CPU-side inputs as they arrive (`bakeStaticLayer` args, `bakeWaterPattern` args, the depth mask, water
scroll/swell; atlases were already retained in `_atlases`). On `webglcontextrestored`,
`_rebuildGpuState()` re-creates all ten GPU-owned passes, drops the stale `WebGLTexture` handles cached
in the draw groups, re-adds every atlas, and replays the bakes and water state in caller order.

`Overlay2D` is deliberately **not** rebuilt — it is a 2D canvas and unaffected by GL context loss.

**Host-facing:** `isRestoring` and `onContextStateChange(lost)` let a client show a hint; `endFrame`
skips frames while lost or mid-rebuild instead of issuing dead GL calls.

**Verification:** six unit tests, and the recovery path is **mutation-verified** — deleting the
`_rebuildGpuState()` call fails two of them, including "renders again after a restore", which is
exactly the black-canvas-forever symptom. Not yet exercised against a real
`WEBGL_lose_context` in a browser; that is the one remaining confirmation and it is a console
one-liner (`gl.getExtension('WEBGL_lose_context').loseContext()`).
