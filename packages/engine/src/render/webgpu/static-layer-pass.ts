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
import waterWgsl from "./shaders/water.wgsl?raw";

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

/** Float32 byte size of WaterUniform struct (12 × f32 = 48 bytes). */
const WATER_UNIFORM_FLOATS = 12;
const WATER_UNIFORM_BYTES = WATER_UNIFORM_FLOATS * 4;

export class WaterPass {
  private readonly ctx: GpuContext;

  private waterTexture: GPUTexture | null = null;
  private tileSize = 0;
  private scrollX = 0;
  private scrollY = 0;
  private swellAlpha = 0;
  private swellScrollX = 0;
  private swellScrollY = 0;

  // Pipeline objects (lazy init).
  private pipeline: GPURenderPipeline | null = null;
  private waterUniformBuf: GPUBuffer | null = null;
  private waterBindGroupLayout: GPUBindGroupLayout | null = null;
  private waterBindGroup: GPUBindGroup | null = null;
  private samplerNearest: GPUSampler | null = null;
  private samplerLinear: GPUSampler | null = null;

  constructor(ctx: GpuContext) {
    this.ctx = ctx;
  }

  private initPipeline(): void {
    if (this.pipeline) return;
    const { device, format } = this.ctx;

    const module = device.createShaderModule({ code: waterWgsl });

    // Group 1: WaterUniform + texture + 2 samplers.
    this.waterBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
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

    this.waterUniformBuf = device.createBuffer({
      size: WATER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private rebuildWaterBindGroup(): void {
    if (!this.waterBindGroupLayout || !this.waterTexture || !this.samplerNearest || !this.samplerLinear || !this.waterUniformBuf) return;
    this.waterBindGroup = this.ctx.device.createBindGroup({
      layout: this.waterBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.waterUniformBuf } },
        { binding: 1, resource: this.waterTexture.createView() },
        { binding: 2, resource: this.samplerNearest },
        { binding: 3, resource: this.samplerLinear },
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

    // Write WaterUniform (12 floats, 48 bytes) matching the struct layout in water.wgsl.
    // Struct: left, top, right, bottom, scrollX, scrollY,
    //         swellAlpha, swellScrollX, swellScrollY, tileSize, useLinear, _pad
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
    data[11] = 0.0; // _pad

    this.ctx.device.queue.writeBuffer(this.waterUniformBuf, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.ctx.viewBindGroup());
    pass.setBindGroup(1, this.waterBindGroup);
    pass.draw(4);
  }
}
