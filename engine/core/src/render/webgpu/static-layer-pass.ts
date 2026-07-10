

import type { GpuContext, ViewUniform } from "./gpu-context";
import type { DecorateFn, Sprite } from "../renderer";
import type { LoadedAtlasImage } from "../../assets/loader";
import { createOffscreen, compareSprite, drawSprite } from "../canvas2d/draw";
import type { Ctx2D } from "../canvas2d/types";
import { EDG } from "../palette";
import { resolveStaticRegion, staticBlitRect } from "../static-region";
import type { StaticRegion } from "../static-region";
import waterWgsl from "./shaders/water.wgsl?raw";

function hexToRgb(hex: string): [number, number, number] {
  let c = hex.trim();
  if (c.startsWith("#")) c = c.slice(1);
  if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
  const n = parseInt(c, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

const WATER_DEEP = hexToRgb(EDG.blue);
const WATER_SHALLOW = hexToRgb(EDG.skyBlue);
const WATER_GLINT = hexToRgb(EDG.cyan);

export interface VisibleRect {
  visL: number;
  visT: number;
  visR: number;
  visB: number;
}

/**
 * Fail loudly if a texture exceeds the adapter's `maxTextureDimension2D`.
 *
 * WebGPU's default is 8192 px. A baked static layer scales with the world, so a
 * large enough world silently overflows it — `createTexture` raises a validation
 * error on the device's error scope, the texture is invalid, and the frame paints
 * **black** with nothing in the console tying it to the world size. Nothing in
 * `render/` checked this before brief 110; a 256×256 Citadel world lands its iso
 * texture at exactly 8192 wide, i.e. on the limit with zero margin.
 *
 * Throwing here converts that silent black screen into a message naming the
 * offending dimension. Exported so the world-bake path can pre-flight a size
 * before it has spent the CPU cost of painting it.
 */
export function assertTextureWithinLimits(
  device: GPUDevice,
  width: number,
  height: number,
  label = "texture",
): void {
  const max = device.limits.maxTextureDimension2D;
  if (width > max || height > max) {
    throw new RangeError(
      `${label} is ${width}×${height}px but this device's maxTextureDimension2D is ${max}px. ` +
        `Reduce the world size, or window the bake so it allocates a viewport-sized sub-region instead.`,
    );
  }
}

function uploadToTexture(
  device: GPUDevice,
  surface: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
): GPUTexture {
  assertTextureWithinLimits(device, width, height, "static-layer bake");
  const texture = device.createTexture({
    size: [width, height, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: surface },
    { texture },
    [width, height],
  );
  return texture;
}

const STATIC_WGSL = `
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
  // World-px origin the baked texture covers (0,0 for a whole-world bake).
  private regionOriginX = 0;
  private regionOriginY = 0;

  private pipeline: GPURenderPipeline | null = null;
  private quadBuf: GPUBuffer | null = null;
  private texBindGroupLayout: GPUBindGroupLayout | null = null;
  private texBindGroup: GPUBindGroup | null = null;
  private nearestSampler: GPUSampler | null = null;

  // Per-draw uniform scratch, reused every frame (writeBuffer copies synchronously,
  // so a single field-level array is safe). Avoids per-frame GC churn.
  private readonly quadScratch = new Float32Array(8);

  constructor(ctx: GpuContext) {
    this.ctx = ctx;
  }

  private initPipeline(): void {
    if (this.pipeline) return;
    const { device, format } = this.ctx;

    const module = device.createShaderModule({ code: STATIC_WGSL });

    this.texBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const layout = device.createPipelineLayout({
      bindGroupLayouts: [
        this.ctx.viewBindGroupLayout(), 
        this.texBindGroupLayout,        
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

  bake(
    sprites: readonly Sprite[],
    atlases: Map<string, LoadedAtlasImage>,
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
    region?: StaticRegion,
  ): void {
    const reg = resolveStaticRegion(worldWidth, worldHeight, region);
    const w = reg.width;
    const h = reg.height;
    const surface = createOffscreen(w, h);
    const bakeCtx = surface.getContext("2d") as Ctx2D | null;
    if (!bakeCtx) throw new Error("StaticLayerPass.bake: failed to acquire offscreen 2d context");
    bakeCtx.imageSmoothingEnabled = false;
    bakeCtx.clearRect(0, 0, w, h);
    // Sprites + decorate draw in WORLD coords; translate by -origin onto the
    // windowed texture (no-op for a whole-world bake → byte-identical).
    const offset = reg.originX !== 0 || reg.originY !== 0;
    if (offset) bakeCtx.translate(-reg.originX, -reg.originY);
    const sorted = sprites.slice().sort(compareSprite);
    for (const s of sorted) {
      drawSprite(bakeCtx, atlases, s);
    }
    if (decorate) decorate(bakeCtx, w, h);
    if (offset) bakeCtx.translate(reg.originX, reg.originY);

    this.texture?.destroy();
    this.texture = uploadToTexture(this.ctx.device, surface, w, h);
    this.textureW = w;
    this.textureH = h;
    this.regionOriginX = reg.originX;
    this.regionOriginY = reg.originY;

    this.texBindGroup = null;
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
    this.regionOriginX = 0;
    this.regionOriginY = 0;
    this.texBindGroup = null;
  }

  draw(pass: GPURenderPassEncoder, _view: ViewUniform, visRect: VisibleRect): void {
    if (!this.texture || !this.pipeline || !this.texBindGroup || !this.quadBuf) return;
    const { visL, visT, visR, visB } = visRect;
    // Clamp the visible rect to the baked region (handles a windowed bake; a
    // whole-world bake leaves src == dst == the visible rect, byte-identical).
    const blit = staticBlitRect(visL, visT, visR, visB, {
      originX: this.regionOriginX,
      originY: this.regionOriginY,
      width: this.textureW,
      height: this.textureH,
    });
    if (!blit) return;

    const srcU0 = blit.srcX / this.textureW;
    const srcV0 = blit.srcY / this.textureH;
    const srcU1 = (blit.srcX + blit.srcW) / this.textureW;
    const srcV1 = (blit.srcY + blit.srcH) / this.textureH;
    const dstL = blit.dstL;
    const dstT = blit.dstT;
    const dstR = blit.dstL + blit.dstW;
    const dstB = blit.dstT + blit.dstH;

    const data = this.quadScratch;
    data[0] = srcU0; data[1] = srcV0; data[2] = srcU1; data[3] = srcV1;
    data[4] = dstL;  data[5] = dstT;  data[6] = dstR;  data[7] = dstB;
    this.ctx.device.queue.writeBuffer(this.quadBuf, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.ctx.viewBindGroup());
    pass.setBindGroup(1, this.texBindGroup);
    pass.draw(4);
  }
}

const WATER_UNIFORM_FLOATS = 36;
const WATER_UNIFORM_BYTES = WATER_UNIFORM_FLOATS * 4;

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

  private depthTexture: GPUTexture | null = null;
  private depthTexW = 0;
  private depthTexH = 0;
  private worldWidthPx = 0;
  private worldHeightPx = 0;
  private tilePx = 0;

  private pipeline: GPURenderPipeline | null = null;
  private waterUniformBuf: GPUBuffer | null = null;
  private waterBindGroupLayout: GPUBindGroupLayout | null = null;
  private waterBindGroup: GPUBindGroup | null = null;
  private samplerNearest: GPUSampler | null = null;
  private samplerLinear: GPUSampler | null = null;
  private samplerDepth: GPUSampler | null = null;

  // Per-draw uniform scratch, reused every frame (writeBuffer copies synchronously).
  private readonly waterScratch = new Float32Array(WATER_UNIFORM_FLOATS);

  constructor(ctx: GpuContext) {
    this.ctx = ctx;
  }

  private initPipeline(): void {
    if (this.pipeline) return;
    const { device, format } = this.ctx;

    const module = device.createShaderModule({ code: waterWgsl });

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
        this.ctx.viewBindGroupLayout(), 
        this.waterBindGroupLayout,      
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

    this._ensureFallbackDepthTexture();
  }

  private _ensureFallbackDepthTexture(): void {
    if (this.depthTexture) return; 
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

    this.waterBindGroup = null; 
    this.initPipeline();
    this.rebuildWaterBindGroup();
  }

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

    this.depthTexture?.destroy();

    const tex = device.createTexture({
      size: [w, h, 1],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

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

    if (this.pipeline) {
      this.waterBindGroup = null;
      this.rebuildWaterBindGroup();
    }
  }

  setScroll(offsetX: number, offsetY: number): void {
    if (this.tileSize <= 0) return;
    this.scrollX = offsetX % this.tileSize;
    this.scrollY = offsetY % this.tileSize;
  }

  setSwell(alpha: number, offsetX: number, offsetY: number): void {
    this.swellAlpha = alpha;
    if (this.tileSize > 0) {
      this.swellScrollX = offsetX % this.tileSize;
      this.swellScrollY = offsetY % this.tileSize;
    }
  }

  draw(pass: GPURenderPassEncoder, _view: ViewUniform, visRect: VisibleRect, zoomedOut: boolean): void {
    if (!this.waterTexture || !this.pipeline || !this.waterBindGroup || !this.waterUniformBuf) return;
    const { visL, visT, visR, visB } = visRect;
    const visW = visR - visL;
    const visH = visB - visT;
    if (visW <= 0 || visH <= 0) return;

    const data = this.waterScratch;
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

    data[11] = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;

    data[12] = WATER_DEEP[0];     data[13] = WATER_DEEP[1];     data[14] = WATER_DEEP[2];     data[15] = 1.0;
    data[16] = WATER_SHALLOW[0];  data[17] = WATER_SHALLOW[1];  data[18] = WATER_SHALLOW[2];  data[19] = 1.0;
    data[20] = WATER_GLINT[0];    data[21] = WATER_GLINT[1];    data[22] = WATER_GLINT[2];    data[23] = 1.0;

    data[24] = WATER_FOAM[0];     data[25] = WATER_FOAM[1];     data[26] = WATER_FOAM[2];     data[27] = 1.0;
    data[28] = WATER_CAUSTICS[0]; data[29] = WATER_CAUSTICS[1]; data[30] = WATER_CAUSTICS[2]; data[31] = 1.0;

    data[32] = this.worldWidthPx > 0 ? this.worldWidthPx : 1.0;
    data[33] = this.worldHeightPx > 0 ? this.worldHeightPx : 1.0;
    data[34] = this.tilePx > 0 ? this.tilePx : 1.0;
    data[35] = 0.0; 

    this.ctx.device.queue.writeBuffer(this.waterUniformBuf, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.ctx.viewBindGroup());
    pass.setBindGroup(1, this.waterBindGroup);
    pass.draw(4);
  }
}
