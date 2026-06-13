# WebGPU Migration — Architecture & Contracts

This is the shared reference every executor depends on. The signatures here are the
**contract**: Wave 0 writes them as stubs; later waves fill the bodies. Do not change a
signature without updating this file and notifying the orchestrator.

## 1. The `RendererLike` interface

Extracted verbatim from the current `Canvas2dRenderer` public surface
(`packages/engine/src/render/canvas2d/renderer.ts`). Both backends implement it.

```ts
// packages/engine/src/render/renderer.ts
import type { Camera2D } from "./camera";
import type { LoadedAtlasImage } from "../assets/loader";
import type { ParticleSystem } from "./particles";
import type { Canvas2dSprite, Ctx2D } from "./canvas2d/types";

/** A sprite to draw. Alias kept stable; canonical shape lives in canvas2d/types.ts. */
export type Sprite = Canvas2dSprite;

export interface WashOptions { color: string; alpha: number; }
export interface WeatherLike { count: number; draw(ctx: Ctx2D): void; }
export type DecorateFn = (ctx: Ctx2D, widthPx: number, heightPx: number) => void;

export interface RendererLike {
  readonly camera: Camera2D;
  clearColor: string;
  pixelSnap: boolean;

  addAtlas(atlas: LoadedAtlasImage): void;
  setAtlas(atlas: LoadedAtlasImage): void;
  getAtlas(id: string): LoadedAtlasImage | undefined;

  bakeStaticLayer(
    sprites: readonly Sprite[],
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
  ): void;
  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void;
  setWaterScroll(offsetX: number, offsetY: number): void;
  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void;
  clearStaticLayer(): void;

  beginFrame(): void;
  push(sprite: Sprite): void;
  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void;
  endFrame(wash?: WashOptions, particles?: ParticleSystem, weather?: WeatherLike): void;
}
```

**Why this shape is load-bearing** (do not "improve" it during migration — parity first):
- `getAtlas` is used by UI code (`main/sprite-icon.ts`) to blit single frames to DOM
  `<canvas>` for hotbar/cursor icons. The WebGPU renderer must still return the
  `LoadedAtlasImage` (which carries the source `ImageBitmap` + `frameRect`). Keep atlases
  in CPU memory even after uploading to the GPU.
- `endFrame`'s `particles` and `weather` draw into a `Ctx2D`. The WebGPU backend supplies
  that context from its 2D overlay (see §4). Signature is unchanged.
- `bakeStaticLayer`'s `decorate` callback draws into a `Ctx2D` (ground-noise, water-depth).
  The WebGPU backend bakes onto an OffscreenCanvas 2D, runs the decorator, then uploads
  the result as a texture (see §5). Callback signature unchanged.

## 2. The factory

```ts
// packages/engine/src/render/create-renderer.ts
import type { Camera2D } from "./camera";
import type { RendererLike } from "./renderer";

export interface CreateRendererOptions {
  /** Force a backend (tests/debug). Default: auto = webgpu if available else canvas2d. */
  backend?: "auto" | "webgpu" | "canvas2d";
  /** Called once the backend is chosen, for logging/telemetry. */
  onBackend?: (backend: "webgpu" | "canvas2d") => void;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
  opts?: CreateRendererOptions,
): Promise<RendererLike>;
```

- Wave 0 implements it returning **only** `Canvas2dRenderer` (webgpu branch throws
  "not implemented" so `auto` still falls back). Wave 3 flips it to try WebGPU first.
- WebGPU init is async (`navigator.gpu.requestAdapter()` → `requestDevice()`); on ANY
  failure (no `navigator.gpu`, no adapter, lost device, exception) it falls back to
  `new Canvas2dRenderer(canvas, camera)` and calls `onBackend("canvas2d")`.

## 3. WebGPU module layout & internal contracts

```
render/webgpu/
  renderer.ts          # WebGpuRenderer implements RendererLike (orchestrator)
  gpu-context.ts       # GpuContext: device, queue, canvas config, frame view uniform
  texture-atlas.ts     # GpuAtlasStore: ImageBitmap -> GPUTexture + UV lookup
  sprite-batch.ts      # SpriteBatch: instanced quad pipeline + sprite.wgsl
  static-layer-pass.ts # StaticLayerPass + WaterPass: baked texture + tiling water
  overlay-2d.ts        # Overlay2D: stacked 2D canvas for shadows/particles/weather/wash
  shaders/
    sprite.wgsl
    water.wgsl
```

### 3.1 `GpuContext` (Wave 1a)

```ts
export interface ViewUniform {
  // maps world px -> clip space; updated each beginFrame from camera
  scaleX: number; scaleY: number; offsetX: number; offsetY: number;
}

export class GpuContext {
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly format: GPUTextureFormat;   // navigator.gpu.getPreferredCanvasFormat()
  readonly context: GPUCanvasContext;

  static async create(canvas: HTMLCanvasElement): Promise<GpuContext>; // throws on failure
  /** Resize the configured canvas to (w,h) device px if changed. */
  resize(width: number, height: number): void;
  /** Upload the per-frame view transform (world->clip). Returns the bind group for it. */
  setView(view: ViewUniform): void;
  viewBindGroupLayout(): GPUBindGroupLayout;
  viewBindGroup(): GPUBindGroup;
  /** Begin a render pass that clears to clearColor (rgba 0..1). */
  beginPass(encoder: GPUCommandEncoder, clear: [number, number, number, number]): GPURenderPassEncoder;
}
```

- Canvas config: `alphaMode: "premultiplied"`, `format = getPreferredCanvasFormat()`.
- The view uniform converts world px to clip space. Given camera: `sx = canvas.width /
  camera.worldUnitsX`, `sy = canvas.height / camera.worldUnitsY`, `left = centerX -
  worldUnitsX/2`, `top = centerY - worldUnitsY/2`. World→clip:
  `clipX = (worldX*sx + ox)/W*2 - 1`, `clipY = 1 - (worldY*sy + oy)/H*2` (Y flips).
  Fold `W,H` into the uniform or pass them too. Mirror the existing pixel-snap math from
  `Canvas2dRenderer.endFrame` (round `ox/oy` when `pixelSnap`).

### 3.2 `GpuAtlasStore` (Wave 1b)

```ts
export interface AtlasUV { u0: number; v0: number; u1: number; v1: number; layer: number; }

export class GpuAtlasStore {
  constructor(device: GPUDevice);
  /** Upload (or replace) one atlas sheet. Keeps the LoadedAtlasImage for getAtlas(). */
  add(atlas: LoadedAtlasImage): void;
  get(id: string): LoadedAtlasImage | undefined;
  /** UV rect (0..1) for a frame within its sheet, plus which texture/layer it is in. */
  uv(atlasId: string, frame: string): AtlasUV;
  /** The bind group (texture + sampler) for a given atlas id. Sampler MUST be nearest. */
  bindGroup(atlasId: string): GPUBindGroup;
  bindGroupLayout(): GPUBindGroupLayout;
}
```

- Simplest correct approach: **one `GPUTexture` per atlas sheet** (sprites are grouped by
  `atlasId`, so batching per-atlas is natural). `layer` in `AtlasUV` is for a future
  texture-array optimisation; set to 0 for now.
- Sampler: `magFilter: "nearest"`, `minFilter: "nearest"`, clamp-to-edge. This preserves
  pixel-art crispness — non-negotiable.
- Upload via `device.queue.copyExternalImageToTexture({ source: bitmap }, …)`.

### 3.3 `SpriteBatch` (Wave 1c)

```ts
export interface GpuSpriteInstance {
  x: number; y: number; w: number; h: number;     // world px, centered at (x, y - z)
  u0: number; v0: number; u1: number; v1: number; // atlas UVs
  rotation: number; flipX: 0 | 1;
  r: number; g: number; b: number; a: number;     // tint multiply (0..1), a = sprite alpha
}

export class SpriteBatch {
  constructor(ctx: GpuContext, atlasBindGroupLayout: GPUBindGroupLayout);
  begin(): void;                       // reset instance buffer
  add(inst: GpuSpriteInstance): void;  // append (grow buffer as needed)
  /** Flush all instances for one atlas in one draw call. Call once per atlas group. */
  flush(pass: GPURenderPassEncoder, atlasBindGroup: GPUBindGroup, atlasInstances: GpuSpriteInstance[]): void;
}
```

- Instanced unit quad (4 verts). Per-instance attributes from `GpuSpriteInstance`.
- `sprite.wgsl`: vertex shader places the quad using the view uniform; fragment samples
  the atlas texture (nearest) and multiplies by `vec4(r,g,b,a)` tint. Output premultiplied
  alpha. White tint (1,1,1) is a no-op — matches Canvas2D fast path.
- The orchestrator (Wave 2) sorts sprites (layer, then sortY/y) and groups consecutive
  runs by `atlasId` to minimise pipeline/bind-group switches.

### 3.4 `Overlay2D` (Wave 1d)

A second `<canvas>` (CSS-stacked exactly over the WebGPU canvas, same client size, same
DPR) with a 2D context. Used in v1 for **shadows, particles, weather, and the wash**, so
`ParticleSystem`, `RainField`, and the multiply-shadow code run unmodified.

```ts
export class Overlay2D {
  constructor(gpuCanvas: HTMLCanvasElement);  // creates & positions the overlay canvas
  /** Match size/DPR of the base canvas; clear for a new frame. */
  beginFrame(): void;
  /** Apply the same world->screen transform the GPU pass uses (camera + pixel-snap). */
  applyWorldTransform(view: ViewUniform): void;
  /** The 2D context handed to particles/weather/shadow draws. */
  readonly ctx: Ctx2D;
  /** Reset transform to screen space (for the wash). */
  resetTransform(): void;
  clearColorIsTransparent: true; // overlay must NOT clear to a solid color
}
```

- The overlay clears to **transparent** every frame; only the GPU canvas clears to
  `clearColor`. Shadows use `globalCompositeOperation = "multiply"` — note: multiply on a
  transparent overlay differs from multiply onto the baked world. Wave 1d must verify
  shadows still read correctly; if multiply-on-transparent looks wrong, draw shadows on
  the GPU instead (dark translucent ellipses in the sprite pass) and document the choice.

### 3.5 `StaticLayerPass` + `WaterPass` (Wave 1e)

- **Static layer:** reuse the existing Canvas2D bake. Create an OffscreenCanvas of
  (worldWidth × worldHeight), draw the sorted static sprites with the SAME `drawSprite`
  helper, run the `decorate` callback, then `copyExternalImageToTexture` the canvas into a
  GPUTexture. Each frame, draw the visible sub-rect as a single textured quad (mirror the
  9-arg `drawImage` visible-rect clipping in `Canvas2dRenderer.endFrame`).
- **Water:** `bakeWaterPattern` uploads the (scaled) water tile to a small GPUTexture with
  `repeat` sampler. `water.wgsl` fills the visible world rect, sampling with a UV scroll
  offset (`setWaterScroll`) and an optional second low-alpha swell pass (`setWaterSwell`).
  Reproduce the bilinear-at-zoom-out anti-shimmer (`waterSmooth = sx < 1`): use a `linear`
  sampler variant when zoomed out, `nearest` otherwise.

## 4. Per-frame orchestration (Wave 2 wires this)

`WebGpuRenderer.endFrame(wash, particles, weather)`:
1. `gpu.resize()`, compute `ViewUniform` from camera (+ pixel-snap), `gpu.setView()`.
2. `encoder = device.createCommandEncoder()`; `pass = gpu.beginPass(encoder, clearColor)`.
3. Water pass (under static), then static-layer quad.
4. Sort queue (`compareSprite`), group by atlasId, `SpriteBatch.flush()` per group.
   X-ray pass: re-emit occludable sprites at low alpha when covered (port the existing
   overlap scan from `Canvas2dRenderer.endFrame`).
5. `pass.end()`; `device.queue.submit([encoder.finish()])`.
6. `Overlay2D.beginFrame()`; draw shadows (or GPU-side per 3.4), then `particles.draw(ctx)`,
   `weather.draw(ctx)`, then the screen-space `wash`.

`beginFrame()` resets the sprite queue + shadow queue + recomputes the cull rect (port the
exact margin logic). `push()`/`pushShadow()` cull then enqueue, identical to Canvas2D.

## 5. Build & tooling

- Add `@webgpu/types` (pinned, exact version) to `@engine/core` devDeps; register in the
  package tsconfig `compilerOptions.types`.
- `.wgsl` import: declare a module `declare module "*.wgsl?raw" { const s: string; export default s; }`
  in an ambient `.d.ts`. Vite serves `?raw` natively; for vitest add nothing (WGSL files
  are only imported by browser-path code, which tests must not execute under jsdom).
- **jsdom guard:** every WebGPU code path must be unreachable under jsdom. `createRenderer`
  detects `navigator.gpu` (absent in jsdom) and returns Canvas2D, so tests never construct
  `WebGpuRenderer`. Do NOT import `webgpu/*` eagerly from a module that tests load on the
  Canvas2D path — use a dynamic `import()` inside the factory's webgpu branch.

## 6. Parity acceptance (Wave 3)

Visual parity with Canvas2D on: pixel crispness (nearest), sprite y-sort/layer order,
tint multiply, flipX/rotation, z-lift, static layer + decorators, water scroll/swell,
shadows, particles, weather, day/night wash, zoom in/out, camera follow. Functional:
typecheck clean, `@engine/core` render tests green, palette test green, Canvas2D fallback
still works when `backend: "canvas2d"` is forced.
