# Wave 0 — Scaffolding & Contracts

**Agents:** 1 (sole writer). **Depends on:** nothing. **Gates:** all other waves.

## Goal

Lay down the interface, the factory (Canvas2D-only for now), the build plumbing, and an
empty WebGPU module skeleton whose signatures exactly match `01-architecture.md`. After
this wave, every Wave-1 agent can fill in one module independently with no guesswork.

## Files you own (create unless noted)

- `packages/engine/src/render/renderer.ts` — the `RendererLike` interface + `Sprite`,
  `WashOptions`, `WeatherLike`, `DecorateFn` types. Copy verbatim from `01-architecture.md §1`.
- `packages/engine/src/render/create-renderer.ts` — `createRenderer` + `CreateRendererOptions`
  per `§2`. Implement the `auto`/`canvas2d` branches returning `new Canvas2dRenderer(...)`.
  The `webgpu` branch (and `auto` when `navigator.gpu` exists) must call a **dynamically
  imported** `tryCreateWebGpuRenderer` that for now `throw new Error("webgpu: not yet
  implemented")` — caught by `auto`, which then falls back to Canvas2D. Use dynamic
  `import("./webgpu/renderer")` so jsdom/tests never eagerly load WebGPU code.
- `packages/engine/src/render/canvas2d/renderer.ts` — **edit**: add `implements RendererLike`
  to the class declaration and `import type { RendererLike } from "../renderer"`. Make NO
  behavioural change. If TS complains about a missing/extra member, fix the *interface*
  to match the real class (and update `01-architecture.md`), do not change the class.
- `packages/engine/src/render/webgpu/renderer.ts` — **skeleton**: `export class
  WebGpuRenderer implements RendererLike` with every member present. Bodies either:
  store trivial state (e.g. `clearColor`, `pixelSnap`, `addAtlas` into a Map) or
  `throw new Error("WebGpuRenderer.<method>: not implemented (Wave 2)")`. Also export
  `export async function tryCreateWebGpuRenderer(canvas, camera): Promise<RendererLike>`
  that currently throws "not implemented". This file's bodies are filled by Wave 2; the
  collaborators it will use are filled by Wave 1. Add `// TODO(wave-2)` / `// TODO(wave-1)`
  markers and import the (stub) collaborator classes so the wiring points are visible.
- `packages/engine/src/render/webgpu/gpu-context.ts` — **stub** class `GpuContext` per `§3.1`
  (methods throw "not implemented (Wave 1a)"). Just enough that it typechecks.
- `packages/engine/src/render/webgpu/texture-atlas.ts` — **stub** `GpuAtlasStore` per `§3.2`.
- `packages/engine/src/render/webgpu/sprite-batch.ts` — **stub** `SpriteBatch` + the
  `GpuSpriteInstance` interface per `§3.3`.
- `packages/engine/src/render/webgpu/overlay-2d.ts` — **stub** `Overlay2D` per `§3.4`.
- `packages/engine/src/render/webgpu/static-layer-pass.ts` — **stub** `StaticLayerPass`
  and `WaterPass` classes per `§3.5`.
- `packages/engine/src/render/webgpu/shaders/sprite.wgsl` — empty placeholder + a comment
  `// filled by Wave 1c`. (An empty file is fine; Wave 1c overwrites it.)
- `packages/engine/src/render/webgpu/shaders/water.wgsl` — placeholder `// filled by Wave 1e`.
- `packages/engine/src/render/index.ts` — **edit**: export `RendererLike`, `Sprite`,
  `WashOptions`, `WeatherLike`, `DecorateFn`, `createRenderer`, `CreateRendererOptions`.
  Do NOT export `WebGpuRenderer` from the barrel (keep it behind the dynamic import so it
  isn't pulled into the Canvas2D/test bundle).
- `packages/engine/src/render/webgpu/wgsl.d.ts` — ambient module:
  `declare module "*.wgsl?raw" { const src: string; export default src; }`
- `packages/engine/package.json` — **edit**: add `@webgpu/types` to `devDependencies`
  with an **exact pinned version** (no `^`/`~`). Run `npm install` to refresh the lockfile.
- `packages/engine/tsconfig.json` — **edit**: add `"@webgpu/types"` to
  `compilerOptions.types` (create the array if absent). Verify `types` doesn't accidentally
  exclude existing global types — if `types` was previously unset, list what the package
  needs (e.g. existing usage of DOM lib types stays via `lib`, not `types`).

## Files you must NOT touch

`farm-valley/*` (Wave 3 owns `main.ts`); any `webgpu/*.ts` body beyond stubs; the bodies
of `gpu-context`/`texture-atlas`/etc. (Wave 1 fills them).

## Implementation notes

- The interface must match the class **exactly**, including `readonly camera`. Verify by
  compiling — `implements RendererLike` on `Canvas2dRenderer` is your correctness oracle.
- Keep `Canvas2dSprite` as the canonical sprite type in `canvas2d/types.ts`; `Sprite` is
  just an alias re-export so future code can use the backend-neutral name.
- Do not add `@webgpu/types` to the *farm-valley* package; only `@engine/core` needs it.
  (farm-valley transitively typechecks engine source, so confirm farm-valley typecheck
  still passes — if it errors on `GPU*` globals, add the types reference there too and
  note it.)

## Acceptance

- `npm run typecheck` (root, all workspaces) is clean.
- `npm run test -w @engine/core` is green (existing render tests must still pass — the
  `implements` change is behaviour-neutral; the palette test must still pass since no hex
  literals were added).
- `createRenderer(canvas, camera)` returns a `Canvas2dRenderer` in jsdom (no `navigator.gpu`).
- Grep shows no eager `import ... from "./webgpu/..."` in `create-renderer.ts` (must be
  dynamic `import()`), and `index.ts` does not export `WebGpuRenderer`.

## Verify

```bash
npm run typecheck
npm run test -w @engine/core
```

Then commit owned paths only: `webgpu(wave-0): renderer interface, factory, webgpu skeleton`.
