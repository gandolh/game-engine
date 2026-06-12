/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// Wave 1e: StaticLayerPass + WaterPass
// StaticLayerPass: bakes static sprites onto an OffscreenCanvas (reusing the existing
//   Canvas2D path) then uploads to a GPUTexture; each frame draws the visible sub-rect
//   as a single textured quad, mirroring Canvas2dRenderer.endFrame's 9-arg drawImage.
// WaterPass: uploads the scaled water tile to a GPUTexture with a repeat sampler;
//   per-frame draws the visible world rect using water.wgsl with scroll + optional swell.

import type { GpuContext, ViewUniform } from "./gpu-context";
import type { DecorateFn, Sprite } from "../renderer";
import type { LoadedAtlasImage } from "../../assets/loader";
import { createOffscreen, compareSprite, drawSprite } from "../canvas2d/draw";
import type { Ctx2D } from "../canvas2d/types";
import { EDG } from "../palette";
import waterWgsl from "./shaders/water.wgsl?raw";

/** EDG hex → [r,g,b] in 0..1. Called only with EDG.* constants (palette stays the source of truth). */
function hexToRgb(hex: string): [number, number, number] {
  let c = hex.trim();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
  const n = parseInt(c, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

// Procedural-water palette anchors (brief 83 water shader). Deep ocean base → sky-blue ripple crests
// → cyan glints. Sourced from EDG so the WGSL stays free of color literals.
const WATER_DEEP = hexToRgb(EDG.blue);
const WATER_SHALLOW = hexToRgb(EDG.skyBlue);
const WATER_GLINT = hexToRgb(EDG.cyan);

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

/** Visible world rect (world px) clipped to the static layer bounds. */
export interface VisibleRect {
  visL: number;
  visT: number;
  visR: number;
  visB: number;
}

/** Upload an OffscreenCanvas (or HTMLCanvasElement) to a new GPUTexture (RGBA8). */
function uploadToTexture(
  device: GPUDevice,
  surface: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
): GPUTexture {
  const texture = device.createTexture({
    size: [width, height, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  // GPUCopyExternalImageSource includes both OffscreenCanvas and HTMLCanvasElement.
  device.queue.copyExternalImageToTexture(
    { source: surface },
    { texture },
    [width, height],
  );
  return texture;
}

// --------------------------------------------------------------------------
// StaticLayerPass
// --------------------------------------------------------------------------

// WGSL for the static-layer pass — a simple textured quad, no uniforms beyond
// the view transform already provided by GpuContext and a texture + sampler.
const STATIC_WGSL = /* wgsl */`
// ViewUniform: scaleX/offsetX positive; scaleY is NEGATIVE (Y-flip baked by GpuContext Wave 1a).
// Shader: clipX = worldX * scaleX + offsetX
//         clipY = worldY * scaleY + offsetY  (scaleY already negative — no extra negation)
struct ViewUniform {
  scaleX  : f32,
  scaleY  : f32,
  offsetX : f32,
  offsetY : f32,
}
@group(0) @binding(0) var<uniform> view : ViewUniform;

// QuadUniform: source UV rect (0..1 within the GPUTexture) + destination world rect (world px).
struct QuadUniform {
  srcL : f32, srcT : f32, srcR : f32, srcB : f32,
  dstL : f32, dstT : f32, dstR : f32, dstB : f32,
}
@group(1) @binding(0) var<uniform> quad  : QuadUniform;
@group(1) @binding(1) var staticTex      : texture_2d<f32>;
@group(1) @binding(2) var staticSampler  : sampler;

struct VertexOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let u = f32(vi & 1u);
  let v = f32((vi >> 1u) & 1u);

  // World-space destination position.
  let wx = quad.dstL + u * (quad.dstR - quad.dstL);
  let wy = quad.dstT + v * (quad.dstB - quad.dstT);

  // Source UV (0..1 within the sub-rect of the baked static texture).
  let su = quad.srcL + u * (quad.srcR - quad.srcL);
  let sv = quad.srcT + v * (quad.srcB - quad.srcT);

  var out: VertexOut;
  out.pos = vec4<f32>(wx * view.scaleX + view.offsetX,
                      wy * view.scaleY + view.offsetY,
                      0.0, 1.0);
  out.uv  = vec2<f32>(su, sv);
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let c = textureSample(staticTex, staticSampler, in.uv);
  // Output premultiplied alpha (canvas alphaMode = "premultiplied").
  return vec4<f32>(c.rgb * c.a, c.a);
}
`;

/** Byte layout of QuadUniform (8 f32 = 32 bytes). */
function makeQuadBuffer(device: GPUDevice): GPUBuffer {
  return device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

export class StaticLayerPass {
  private readonly ctx: GpuContext;
  private texture: GPUTexture | null = null;
  private textureW = 0;
  private textureH = 0;

  // Pipeline + layout objects created lazily on first bake/draw.
  private pipeline: GPURenderPipeline | null = null;
  private quadBuf: GPUBuffer | null = null;
  private texBindGroupLayout: GPUBindGroupLayout | null = null;
  private texBindGroup: GPUBindGroup | null = null;
  private nearestSampler: GPUSampler | null = null;

  constructor(ctx: GpuContext) {
    this.ctx = ctx;
  }

  // ---- Lazy pipeline init (called once) ----

  private initPipeline(): void {
    if (this.pipeline) return;
    const { device, format } = this.ctx;

    const module = device.createShaderModule({ code: STATIC_WGSL });

    // Group 1 layout: quad uniform + texture + sampler.
    this.texBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const layout = device.createPipelineLayout({
      bindGroupLayouts: [
        this.ctx.viewBindGroupLayout(), // group 0
        this.texBindGroupLayout,        // group 1
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: "uint16" },
    });

    this.nearestSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.quadBuf = makeQuadBuffer(device);
  }

  // ---- Public API ----

  /**
   * Bake static sprites into an OffscreenCanvas (identical to Canvas2dRenderer.bakeStaticLayer),
   * then upload the result to a GPUTexture.
   *
   * @param atlases - Map of atlas id → LoadedAtlasImage (passed by the orchestrator, Wave 2).
   */
  bake(
    sprites: readonly Sprite[],
    atlases: Map<string, LoadedAtlasImage>,
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
  ): void {
    const w = Math.max(1, Math.ceil(worldWidth));
    const h = Math.max(1, Math.ceil(worldHeight));
    const surface = createOffscreen(w, h);
    const bakeCtx = surface.getContext("2d") as Ctx2D | null;
    if (!bakeCtx) throw new Error("StaticLayerPass.bake: failed to acquire offscreen 2d context");
    bakeCtx.imageSmoothingEnabled = false;
    bakeCtx.clearRect(0, 0, w, h);
    const sorted = sprites.slice().sort(compareSprite);
    for (const s of sorted) {
      drawSprite(bakeCtx, atlases, s);
    }
    if (decorate) decorate(bakeCtx, w, h);

    // Drop any previous texture.
    this.texture?.destroy();
    this.texture = uploadToTexture(this.ctx.device, surface, w, h);
    this.textureW = w;
    this.textureH = h;

    // Rebuild texture bind group with the new texture.
    this.texBindGroup = null; // invalidate; recreated in draw()
    this.initPipeline();
    this.rebuildTexBindGroup();
  }

  private rebuildTexBindGroup(): void {
    if (!this.texBindGroupLayout || !this.texture || !this.nearestSampler || !this.quadBuf) return;
    this.texBindGroup = this.ctx.device.createBindGroup({
      layout: this.texBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.quadBuf } },
        { binding: 1, resource: this.texture.createView() },
        { binding: 2, resource: this.nearestSampler },
      ],
    });
  }

  clear(): void {
    this.texture?.destroy();
    this.texture = null;
    this.textureW = 0;
    this.textureH = 0;
    this.texBindGroup = null;
  }

  /**
   * Draw the visible sub-rect of the baked static layer as a single textured quad.
   * Mirrors the 9-arg drawImage in Canvas2dRenderer.endFrame:
   *   ctx.drawImage(staticLayer, visL, visT, visW, visH, visL, visT, visW, visH)
   *
   * @param pass     - Active render pass encoder.
   * @param view     - Current frame view uniform (world→clip).
   * @param visRect  - Visible rect in world px, pre-clipped to static layer bounds.
   */
  draw(pass: GPURenderPassEncoder, _view: ViewUniform, visRect: VisibleRect): void {
    if (!this.texture || !this.pipeline || !this.texBindGroup || !this.quadBuf) return;
    const { visL, visT, visR, visB } = visRect;
    const visW = visR - visL;
    const visH = visB - visT;
    if (visW <= 0 || visH <= 0) return;

    // Source UVs (0..1) within the GPUTexture.
    const srcU0 = visL / this.textureW;
    const srcV0 = visT / this.textureH;
    const srcU1 = visR / this.textureW;
    const srcV1 = visB / this.textureH;

    // Destination world rect (same as source in world px — identical to 9-arg drawImage).
    // QuadUniform layout: srcL, srcT, srcR, srcB, dstL, dstT, dstR, dstB (8 × f32).
    const data = new Float32Array([srcU0, srcV0, srcU1, srcV1, visL, visT, visR, visB]);
    this.ctx.device.queue.writeBuffer(this.quadBuf, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.ctx.viewBindGroup());
    pass.setBindGroup(1, this.texBindGroup);
    pass.draw(4);
  }
}

// --------------------------------------------------------------------------
// WaterPass
// --------------------------------------------------------------------------

// Brief 13: WaterUniform extended with foam/caustics colors + world dimensions for depth UV mapping.
// Layout (floats):
//   [0..3]   left, top, right, bottom
//   [4..7]   scrollX, scrollY, swellAlpha, swellScrollX
//   [8..11]  swellScrollY, tileSize, useLinear, time
//   [12..15] deepColor    (vec4)
//   [16..19] shallowColor (vec4)
//   [20..23] glintColor   (vec4)
//   [24..27] foamColor    (vec4) — EDG white; tasks 3
//   [28..31] causticsColor (vec4) — EDG cyan/white; task 4
//   [32..35] worldWidthPx, worldHeightPx, tilePx, _pad0
// Total: 36 × f32 = 144 bytes (16-byte aligned).
const WATER_UNIFORM_FLOATS = 36;
const WATER_UNIFORM_BYTES = WATER_UNIFORM_FLOATS * 4;

// Foam/caustics EDG colors (brief 13 tasks 3–4).
const WATER_FOAM     = hexToRgb(EDG.white);
const WATER_CAUSTICS = hexToRgb(EDG.cyan);

export class WaterPass {
  private readonly ctx: GpuContext;

  private waterTexture: GPUTexture | null = null;
  private tileSize = 0;
  private scrollX = 0;
  private scrollY = 0;
  private swellAlpha = 0;
  private swellScrollX = 0;
  private swellScrollY = 0;

  // Depth mask texture (brief 13 tasks 3–4). Null = no depth info (foam/caustics invisible).
  private depthTexture: GPUTexture | null = null;
  private depthTexW = 0;
  private depthTexH = 0;
  private worldWidthPx = 0;
  private worldHeightPx = 0;
  private tilePx = 0;

  // Pipeline objects (lazy init).
  private pipeline: GPURenderPipeline | null = null;
  private waterUniformBuf: GPUBuffer | null = null;
  private waterBindGroupLayout: GPUBindGroupLayout | null = null;
  private waterBindGroup: GPUBindGroup | null = null;
  private samplerNearest: GPUSampler | null = null;
  private samplerLinear: GPUSampler | null = null;
  private samplerDepth: GPUSampler | null = null;

  constructor(ctx: GpuContext) {
    this.ctx = ctx;
  }

  private initPipeline(): void {
    if (this.pipeline) return;
    const { device, format } = this.ctx;

    const module = device.createShaderModule({ code: waterWgsl });

    // Group 1: WaterUniform + water texture + 2 water samplers + depth mask texture + depth sampler.
    this.waterBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const layout = device.createPipelineLayout({
      bindGroupLayouts: [
        this.ctx.viewBindGroupLayout(), // group 0
        this.waterBindGroupLayout,      // group 1
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-strip", stripIndexFormat: "uint16" },
    });

    this.samplerNearest = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    this.samplerLinear = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    // Depth sampler: clamp-to-edge (out-of-bounds = 0 = deep ocean, no effects).
    // LINEAR filtering so the tile-resolution gradient mask interpolates smoothly between tiles
    // (brief 13 follow-up: wide shore-to-deep gradient requires sub-tile interpolation).
    this.samplerDepth = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.waterUniformBuf = device.createBuffer({
      size: WATER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create a 1×1 fallback depth texture (all zeros = deep ocean everywhere).
    // This ensures the bind group is always valid even before setDepthMask() is called.
    this._ensureFallbackDepthTexture();
  }

  /** Create or replace the 1×1 all-zero fallback depth texture. */
  private _ensureFallbackDepthTexture(): void {
    if (this.depthTexture) return; // already set (either fallback or real mask)
    const { device } = this.ctx;
    const tex = device.createTexture({
      size: [1, 1, 1],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: tex },
      new Uint8Array([0]),
      { bytesPerRow: 1 },
      [1, 1, 1],
    );
    this.depthTexture = tex;
    this.depthTexW = 1;
    this.depthTexH = 1;
  }

  private rebuildWaterBindGroup(): void {
    if (!this.waterBindGroupLayout || !this.waterTexture || !this.samplerNearest || !this.samplerLinear ||
        !this.waterUniformBuf || !this.depthTexture || !this.samplerDepth) return;
    this.waterBindGroup = this.ctx.device.createBindGroup({
      layout: this.waterBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.waterUniformBuf } },
        { binding: 1, resource: this.waterTexture.createView() },
        { binding: 2, resource: this.samplerNearest },
        { binding: 3, resource: this.samplerLinear },
        { binding: 4, resource: this.depthTexture.createView() },
        { binding: 5, resource: this.samplerDepth },
      ],
    });
  }

  /**
   * Upload the scaled water tile to a GPUTexture with a repeat sampler.
   * Reproduces Canvas2dRenderer.bakeWaterPattern's size/scale math exactly.
   *
   * @param atlases    - Atlas map (passed by the orchestrator, Wave 2).
   * @param frame      - Frame name within the atlas.
   * @param atlasId    - Atlas id to look up.
   * @param tileSize   - Unscaled tile size in world px.
   * @param pixelScale - Upscale factor (default 1). Clamped to integer ≥ 1.
   */
  bakePattern(
    atlases: Map<string, LoadedAtlasImage>,
    frame: string,
    atlasId: string,
    tileSize: number,
    pixelScale = 1,
  ): void {
    const atlas = atlases.get(atlasId);
    if (!atlas) throw new Error(`WaterPass.bakePattern: atlas "${atlasId}" not found`);
    const scale = Math.max(1, Math.round(pixelScale));
    const size = Math.max(1, Math.ceil(tileSize) * scale);

    // Draw the atlas frame into a size×size OffscreenCanvas (matches Canvas2D path).
    const surface = createOffscreen(size, size);
    const tctx = surface.getContext("2d") as Ctx2D | null;
    if (!tctx) throw new Error("WaterPass.bakePattern: failed to acquire offscreen 2d context");
    tctx.imageSmoothingEnabled = false;
    const r = atlas.frameRect(frame);
    tctx.drawImage(atlas.bitmap, r.x, r.y, r.w, r.h, 0, 0, size, size);

    this.waterTexture?.destroy();
    this.waterTexture = uploadToTexture(this.ctx.device, surface, size, size);
    this.tileSize = size;
    this.scrollX = 0;
    this.scrollY = 0;

    this.waterBindGroup = null; // invalidate; recreated in draw()
    this.initPipeline();
    this.rebuildWaterBindGroup();
  }

  /**
   * Upload a per-tile depth mask for shore foam and caustics (brief 13 tasks 3–4).
   *
   * The mask is a single-channel (R8) float texture, tilesX × tilesY pixels, where each
   * texel value is depth/COAST_DEPTH_MAX in [0, 1]:  0 = deep ocean, ~1 = adjacent to shore.
   * The shader samples it by mapping worldPos → [0,1] UV using worldWidthPx/worldHeightPx.
   *
   * @param data          - Raw depth values as Uint8Array (0..255, where 255 = max depth).
   * @param tilesX        - Width of the depth grid in tiles.
   * @param tilesY        - Height of the depth grid in tiles.
   * @param worldWidthPx  - Full world width in pixels (for UV mapping).
   * @param worldHeightPx - Full world height in pixels (for UV mapping).
   * @param tilePxSize    - Tile size in world pixels (for UV mapping).
   */
  setDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void {
    const w = Math.max(1, tilesX);
    const h = Math.max(1, tilesY);
    if (data.length < w * h) {
      throw new Error(`WaterPass.setDepthMask: data too small (got ${data.length}, need ${w * h})`);
    }
    const { device } = this.ctx;

    // Destroy old depth texture (whether fallback or previous real mask).
    this.depthTexture?.destroy();

    const tex = device.createTexture({
      size: [w, h, 1],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    // writeTexture requires bytesPerRow ≥ width (here = w, since R8 = 1 byte/pixel).
    device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: w },
      [w, h, 1],
    );

    this.depthTexture = tex;
    this.depthTexW = w;
    this.depthTexH = h;
    this.worldWidthPx = worldWidthPx;
    this.worldHeightPx = worldHeightPx;
    this.tilePx = tilePxSize;

    // Rebuild the bind group with the new depth texture (pipeline must already be inited).
    if (this.pipeline) {
      this.waterBindGroup = null;
      this.rebuildWaterBindGroup();
    }
  }

  /**
   * Set the water scroll offset (world px).
   * Wraps to tile size, matching Canvas2dRenderer.setWaterScroll.
   */
  setScroll(offsetX: number, offsetY: number): void {
    if (this.tileSize <= 0) return;
    this.scrollX = offsetX % this.tileSize;
    this.scrollY = offsetY % this.tileSize;
  }

  /**
   * Set swell parameters for the coming frame.
   * alpha ≤ 0 skips the second pass, matching Canvas2dRenderer.setWaterSwell.
   */
  setSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.swellAlpha = alpha;
    if (this.tileSize > 0) {
      this.swellScrollX = offsetX % this.tileSize;
      this.swellScrollY = offsetY % this.tileSize;
    }
  }

  /**
   * Fill the visible world rect with the tiling water pattern.
   *
   * @param pass      - Active render pass encoder.
   * @param _view     - Current frame view uniform (consumed via viewBindGroup).
   * @param visRect   - Visible rect in world px.
   * @param zoomedOut - True when camera sx < 1 (use linear sampler to avoid shimmer).
   */
  draw(pass: GPURenderPassEncoder, _view: ViewUniform, visRect: VisibleRect, zoomedOut: boolean): void {
    if (!this.waterTexture || !this.pipeline || !this.waterBindGroup || !this.waterUniformBuf) return;
    const { visL, visT, visR, visB } = visRect;
    const visW = visR - visL;
    const visH = visB - visT;
    if (visW <= 0 || visH <= 0) return;

    // Write WaterUniform (WATER_UNIFORM_FLOATS × f32) matching the struct layout in water.wgsl.
    const data = new Float32Array(WATER_UNIFORM_FLOATS);
    data[0]  = visL;
    data[1]  = visT;
    data[2]  = visR;
    data[3]  = visB;
    data[4]  = this.scrollX;
    data[5]  = this.scrollY;
    data[6]  = this.swellAlpha;
    data[7]  = this.swellScrollX;
    data[8]  = this.swellScrollY;
    data[9]  = this.tileSize;
    data[10] = zoomedOut ? 1.0 : 0.0;
    // Animation phase — wall-clock seconds. Display timing only (render-only, like the bridge sway),
    // so performance.now() here is correct; determinism is a sim-side property.
    data[11] = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
    // Procedural-water colors (vec4 slots; rgb used, a=1). EDG-sourced.
    data[12] = WATER_DEEP[0];     data[13] = WATER_DEEP[1];     data[14] = WATER_DEEP[2];     data[15] = 1.0;
    data[16] = WATER_SHALLOW[0];  data[17] = WATER_SHALLOW[1];  data[18] = WATER_SHALLOW[2];  data[19] = 1.0;
    data[20] = WATER_GLINT[0];    data[21] = WATER_GLINT[1];    data[22] = WATER_GLINT[2];    data[23] = 1.0;
    // Brief 13 additions: foam + caustics colors.
    data[24] = WATER_FOAM[0];     data[25] = WATER_FOAM[1];     data[26] = WATER_FOAM[2];     data[27] = 1.0;
    data[28] = WATER_CAUSTICS[0]; data[29] = WATER_CAUSTICS[1]; data[30] = WATER_CAUSTICS[2]; data[31] = 1.0;
    // World dimensions for depth UV mapping.
    data[32] = this.worldWidthPx > 0 ? this.worldWidthPx : 1.0;
    data[33] = this.worldHeightPx > 0 ? this.worldHeightPx : 1.0;
    data[34] = this.tilePx > 0 ? this.tilePx : 1.0;
    data[35] = 0.0; // _pad0

    this.ctx.device.queue.writeBuffer(this.waterUniformBuf, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.ctx.viewBindGroup());
    pass.setBindGroup(1, this.waterBindGroup);
    pass.draw(4);
  }
}
