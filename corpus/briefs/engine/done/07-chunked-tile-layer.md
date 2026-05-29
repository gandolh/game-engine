# Engine Task 07 — Chunked Tile-Layer Render Pass (perf, profile-gated)

> **Resolved 2026-05-29.** The user explicitly opted to build the cache now
> rather than wait on the profile gate (it's a safe, well-understood win).
> Implemented the *cached single static layer* variant, not chunking: the
> renderer (`Canvas2dRenderer.bakeStaticLayer`) bakes the static backdrop —
> grass/dirt/path tiles, farm fences, and plot dirt — once into an offscreen
> canvas in world-pixel space, then blits it beneath the per-frame dynamic
> queue in `endFrame`. `render-systems.ts` split the static sprites
> (`iterStaticSprites` / `buildStaticLayerSprites`) out of the per-frame
> `iterSceneSprites`; crops, entities, MEET indicators, and the focus halo
> stay dynamic. `main.ts` calls `bakeStaticLayer` once after `bootstrapSim`.
> Chunking (viewport-culled per-chunk canvases) was NOT needed — one
> 640×640 offscreen canvas is trivial. Verified visually identical in the
> browser at 60fps. Canvas2D stayed locked; the WebGPU legacy was not touched.

## Context

Open question in [open-questions.md](../../../wiki/open-questions.md): *"Tilemap layer on Canvas2D?"* The background is currently redrawn ad-hoc, one tile at a time, every frame — the backdrop pass in `render-systems.ts` iterates the full 40×40 grid (1600 `drawImage` calls) plus fences, plots, and sprites, each render frame. At today's scale (40×40, ~4 farmers, 60fps) this is comfortable, so this brief is **profile-gated**: do NOT start it as a speculative optimization. [decisions.md](../../../wiki/decisions.md) is explicit — *"If perf demands push the renderer again, the next step is profiling Canvas2D first, not reaching for WebGPU."*

The static backdrop never changes after world setup, so it's the obvious candidate to cache once instead of re-blitting every frame.

## Activation gate (do this FIRST)

Before any implementation, **profile** and record numbers in this brief / the log:
1. Measure current frame time with the per-tile backdrop (use the debug overlay + browser profiler) at the target scale, and again at a stress scale (e.g. 100 agents, larger world if feasible).
2. Identify whether the backdrop pass is actually a hot spot. If it isn't (likely at current scale), STOP — record "not needed yet, measured X ms/frame" in [open-questions.md](../../../wiki/open-questions.md) and close the brief without code changes.
3. Only proceed to implementation if profiling shows the backdrop redraw is a meaningful cost.

## Goal (only if the gate passes)

1. **Cache the static backdrop**: render the grass/dirt/path/fence layer once to an offscreen canvas (or per-chunk offscreen canvases) at world setup, then blit the cached layer each frame instead of re-iterating tiles.
2. **Chunking** (if a single offscreen canvas is too large): split the world into fixed-size chunks, cache each, and blit only chunks intersecting the camera viewport.
3. **Keep dynamic layers per-frame**: plots (can change: planted/growing/mature), sprites, indicators, and the focus halo stay drawn per frame on top of the cached backdrop. Only the *static* backdrop is cached.
4. **Engine-generic**: the caching/chunking capability belongs in the engine renderer; the game tells it what static tiles to bake.

## Files in scope

- `packages/engine/src/render/canvas2d.ts` — add an offscreen/cached-layer or chunked-tile-layer capability (generic). Read it first; keep the existing `push`/`beginFrame`/`endFrame` API intact and additive.
- `packages/engine/src/render/canvas2d.test.ts` (create if absent) — test the caching capability in isolation (a baked layer composites correctly).
- `packages/farm-valley/src/render-systems.ts` — bake the static backdrop + fences once; stop emitting them as per-frame sprites; keep plots/sprites/indicators/halo per-frame.
- `corpus/wiki/open-questions.md` — record the profiling result and the decision either way.

## Files you must NOT touch

- The sim entirely (`systems/**`, `agents/**`, `world/**`, `sim-bootstrap.ts`, `components.ts`, `protocols/**`) — this is render-only.
- Other engine subsystems (`ecs`, `input`, `runtime`, `sim`, `animation`, `spatial`, `persistence`, `wasm`).
- `ui/**`, `screens/**`, `main.ts` beyond minimal wire-up if the renderer needs a one-time "bake" call.
- Do NOT revive the quarantined `packages/engine/legacy/webgpu/**` — Canvas2D is the locked decision.

## Acceptance criteria

- The activation gate is honored: profiling numbers are recorded *before* any code change; if the backdrop isn't a hot spot, the brief closes with a measurement note and no code.
- If implemented: `npm run typecheck` + `npm run test` pass; `npm run dev` is visually identical to before (same world, same animations) but with reduced per-frame backdrop cost; plots still update when crops grow.
- Renderer changes are additive and generic; the game still drives what gets baked.
- No `.js` import suffixes; no new runtime deps; no WebGPU.

## Workflow

You're the sonnet executor. **First profile and report** — do not write rendering code until the gate passes and the orchestrator confirms. If it passes, read `canvas2d.ts` and `render-systems.ts`, implement the cached/chunked layer, verify visual parity in `npm run dev`. Report the profiling numbers, files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
