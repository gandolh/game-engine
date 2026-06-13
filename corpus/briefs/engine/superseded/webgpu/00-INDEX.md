# WebGPU Renderer Migration — Master Plan

**Status:** CLOSED / WON'T-DO (2026-06-13) — planning complete, execution never started; backlog closed by user decision. Reopen with a fresh brief if WebGPU is revisited.
**Owner of plan:** opus (orchestrator). **Executors:** sonnet subagents, one per wave brief.
**Branch:** all work happens on `webgpu-migration` (never commit to `main`).

## Goal

Replace the Canvas2D rendering backend of Farm Valley with a **WebGPU** backend,
behind a stable `RendererLike` interface, with an **automatic Canvas2D fallback**
when WebGPU is unavailable (older browser, Firefox/Linux, headless tests).

This is a **render-only** change. The sim lives in a Web Worker and is never touched.
**Determinism is not affected** and must not be a concern for any executor.

## Non-negotiable constraints (read before touching code)

1. **Determinism untouched.** Renderer is main-thread display only. Do NOT import
   anything from `worker/` or `sim-core` sim systems into render code. Do NOT run
   determinism checks — they are irrelevant here and the hardware is constrained.
2. **EDG32 palette is enforced** by `packages/engine/src/render/palette.test.ts`.
   It scans `.ts/.js/.mjs/.cjs` for hex literals. Therefore:
   - **All WGSL lives in `.wgsl` files** (not scanned), imported via Vite `?raw`.
   - **No color hex literals in `.ts`** shader strings. Colors enter shaders as
     `vec4<f32>` uniforms, converted at runtime from EDG strings the consumer passes.
3. **Locked conventions** (see `corpus/wiki/decisions.md`): no `.js` import suffixes,
   pinned dependency versions (no `^`/`~`), TS strict + `noUncheckedIndexedAccess` +
   `exactOptionalPropertyTypes`, no `any` without a comment.
4. **Engine never imports game.** All new WebGPU code is generic and lives in
   `packages/engine/src/render/webgpu/`. Only `main.ts`/`render-loop.ts` (game) wire it.
5. **Git hygiene** (see `HANDOFF.md`): commit only the files your brief owns.
   NEVER run `git reset`, `git checkout -- `, `git clean`, or `git rebase` that could
   discard another agent's work. One commit per brief.

## Architecture in one paragraph

A new `RendererLike` interface (in `render/renderer.ts`) captures the exact public
surface of `Canvas2dRenderer`. `Canvas2dRenderer implements RendererLike` unchanged.
A new `WebGpuRenderer implements RendererLike` renders sprites/static-layer/water on
the GPU and keeps a **stacked 2D overlay canvas** for shadows, particles, weather, and
the day/night wash (these receive a `Ctx2D` exactly as today, so ParticleSystem /
RainField / the decorators work without modification). An async factory
`createRenderer(canvas, camera)` returns a `WebGpuRenderer` when `navigator.gpu`
initialises, else a `Canvas2dRenderer`. See `01-architecture.md` for full contracts.

## Wave map

Each wave is a barrier: do not start a wave until the previous wave is merged to
`webgpu-migration` and verified green by the orchestrator.

| Wave | Brief(s) | Parallel agents | Depends on | What it delivers |
|------|----------|-----------------|-----------|------------------|
| 0 | `wave-0-scaffolding.md` | 1 | — | Interface, factory stub, `@webgpu/types`, `.wgsl` plumbing, empty WebGPU module skeleton with agreed signatures. **The contract.** |
| 1 | `wave-1a` … `wave-1e` | 5 (worktree-isolated) | Wave 0 | Independent GPU modules: context, texture-atlas, sprite-batch, overlay-2d, static+water passes. |
| 2 | `wave-2-orchestration.md` | 1 | Wave 1 (all) | Wire `WebGpuRenderer` to orchestrate every collaborator; full `RendererLike` impl. |
| 3 | `wave-3-activation-verify.md` | 1–2 | Wave 2 | Flip factory to WebGPU-first; make `main.ts` use it; browser parity verification; typecheck/tests green. |
| 4 (optional) | `wave-4-gpu-particles-weather.md` | 2 | Wave 3 | Port particles + weather from the 2D overlay to GPU instancing; retire overlay for them. |

## File-ownership matrix (prevents merge conflicts)

Files are owned by exactly one brief. An agent edits ONLY its owned files.

| File / dir | Owned by |
|---|---|
| `render/renderer.ts` (interface) | Wave 0 |
| `render/create-renderer.ts` (factory) | Wave 0 (creates), Wave 3 (flips default) |
| `render/index.ts` (exports) | Wave 0 only |
| `render/canvas2d/renderer.ts` (`implements`) | Wave 0 only |
| `render/webgpu/gpu-context.ts` | Wave 1a |
| `render/webgpu/texture-atlas.ts` | Wave 1b |
| `render/webgpu/sprite-batch.ts` + `shaders/sprite.wgsl` | Wave 1c |
| `render/webgpu/overlay-2d.ts` | Wave 1d |
| `render/webgpu/static-layer-pass.ts` + `shaders/water.wgsl` | Wave 1e |
| `render/webgpu/renderer.ts` (skeleton) | Wave 0 (skeleton), Wave 2 (body) |
| `farm-valley/src/main.ts` | Wave 3 only |
| `farm-valley/vite-env.d.ts` / wgsl decl | Wave 0 only |
| `webgpu/types.d.ts` registration in tsconfig | Wave 0 only |

## Risk register

- **WSL2/Linux dev browser may lack `navigator.gpu`.** Fallback to Canvas2D is the
  mitigation; verify the fallback path works (Wave 3) even if you cannot see WebGPU.
- **Pixel-art crispness.** WebGPU sampler must be `nearest` (mag+min) and the pipeline
  must reproduce the pixel-snap behaviour. Parity is a Wave 3 acceptance gate.
- **Tint path.** Canvas2D does an RGB multiply via offscreen; the sprite shader must
  reproduce `tintRgba` multiply with transparent-padding safety (premultiplied alpha).

## Reading order for an executor

1. This file. 2. `01-architecture.md` (contracts). 3. `HANDOFF.md` (protocol).
4. Your specific `wave-*.md` brief. Then verify the real code paths it names still exist.
