/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// weather-pass.ts — GPU weather pipeline (Wave 4b)
//
// Bind-group ownership strategy (mirrors particle-batch.ts / sprite-batch.ts):
//   - group(0) = ViewUniform (set ONCE per render pass by the orchestrator via
//     pass.setBindGroup(0, ctx.viewBindGroup()) BEFORE calling draw()).
//     WeatherPass never sets group 0 — it relies on the pass already having it.
//   - group(1) = WeatherUniform (per-draw: parsed EDG color as RGB floats +
//     curtain alpha). WeatherPass owns and writes this bind group each draw().
//
// Rain streak instance buffer layout (Float32, stride = STREAK_FLOATS × 4 = 20 bytes):
//   offset  0: x0  — streak head X (world px)
//   offset  4: y0  — streak head Y (world px)
//   offset  8: x1  — streak tail X (world px)
//   offset 12: y1  — streak tail Y (world px)
//   offset 16: w   — half-width of the oriented quad (world px)
//
// Snow flake instance buffer layout (Float32, stride = SNOW_FLOATS × 4 = 12 bytes):
//   offset  0: cx        — center X (world px, includes sin-sway)
//   offset  4: cy        — center Y (world px)
//   offset  8: halfSize  — half-size (world px)
//
// Rain primitive choice: THIN ORIENTED QUADS (two triangles per streak).
// Line-list topology was considered but quads give explicit width control (~0.7
// world px full width, matching RAIN.lineWidth = 0.7 on Canvas-2D) and avoid
// platform variation in line rendering.

import shaderSrc from "./shaders/weather.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import type { RainField } from "../rain-field";
import { rgbOf } from "../palette";

// Per-instance float counts (see buffer layout above)
const STREAK_FLOATS = 5; // x0,y0,x1,y1, w   — 20 bytes per streak instance
const SNOW_FLOATS   = 3; // cx,cy,halfSize     — 12 bytes per snow instance

// Initial GPU buffer capacity (in number of instances); grown by doubling
const INITIAL_CAPACITY = 512;

// Half-width of a rain streak quad in world px.
// Matches RAIN.lineWidth = 0.7 from rain-field.ts (0.7 / 2 = 0.35).
const STREAK_HALF_WIDTH = 0.35;

// Size in bytes of the WeatherUniform block in the shader:
//   vec3<f32> color (12 bytes) + 4 bytes padding + f32 curtain_alpha (4 bytes) = 16 bytes
// WGSL struct layout: vec3<f32> has alignment 16, so the struct is:
//   offset 0: color (12 bytes)  + 4 bytes implicit padding = 16 bytes
//   offset 16: curtain_alpha (4 bytes) + 12 bytes padding   = 16 bytes
// Total: 32 bytes.
const WEATHER_UNIFORM_BYTES = 32;

export class WeatherPass {
  private readonly device: GPUDevice;

  // Two separate pipelines: one for rain streaks, one for snow squares.
  // Both share the same shader module (different entry points).
  private readonly rainPipeline: GPURenderPipeline;
  private readonly snowPipeline: GPURenderPipeline;

  // Per-draw weather uniform (color + curtain_alpha) — rebuilt each draw()
  private readonly weatherUniformBuffer: GPUBuffer;
  private readonly weatherUniformScratch: Float32Array;
  private readonly weatherBindGroupLayout: GPUBindGroupLayout;

  // Rain streak instance resources
  private rainInstanceBuffer: GPUBuffer;
  private rainInstanceCapacity: number;
  private rainStagingData: Float32Array;

  // Snow flake instance resources
  private snowInstanceBuffer: GPUBuffer;
  private snowInstanceCapacity: number;
  private snowStagingData: Float32Array;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    // ── Weather uniform buffer (group 1) ─────────────────────────────────────
    this.weatherUniformBuffer = ctx.device.createBuffer({
      label: "WeatherPass weather-uniform buffer",
      size: WEATHER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Float32Array scratch: 8 floats = 32 bytes.
    // Layout matches WGSL WeatherUniform:
    //   [0..2] = color.rgb (with implicit padding at [3] = 0)
    //   [4]    = curtain_alpha (with [5..7] = 0 padding)
    this.weatherUniformScratch = new Float32Array(8);

    this.weatherBindGroupLayout = ctx.device.createBindGroupLayout({
      label: "WeatherPass weather-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    // ── Pipelines ────────────────────────────────────────────────────────────
    const shaderModule = ctx.device.createShaderModule({
      label: "weather shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "WeatherPass pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(),   // group(0) — owned by orchestrator
        this.weatherBindGroupLayout, // group(1) — owned by WeatherPass
      ],
    });

    // Premultiplied-alpha blend state (identical to ParticleBatch / SpriteBatch):
    //   out.rgb = src.rgb × 1  +  dst.rgb × (1 - src.a)
    //   out.a   = src.a  × 1  +  dst.a   × (1 - src.a)
    const blendState: GPUBlendState = {
      color: {
        srcFactor:  "one",
        dstFactor:  "one-minus-src-alpha",
        operation:  "add",
      },
      alpha: {
        srcFactor:  "one",
        dstFactor:  "one-minus-src-alpha",
        operation:  "add",
      },
    };

    // Rain pipeline — vs_streak entry point, per-instance: x0,y0,x1,y1,w
    const rainInstanceLayout: GPUVertexBufferLayout = {
      arrayStride: STREAK_FLOATS * 4,
      stepMode: "instance",
      attributes: [
        // location 0: p0 (x0, y0) — float32x2 at offset 0
        { shaderLocation: 0, offset: 0,  format: "float32x2" },
        // location 1: p1 (x1, y1) — float32x2 at offset 8
        { shaderLocation: 1, offset: 8,  format: "float32x2" },
        // location 2: w (half-width) — float32 at offset 16
        { shaderLocation: 2, offset: 16, format: "float32" },
      ],
    };

    this.rainPipeline = ctx.device.createRenderPipeline({
      label: "WeatherPass rain pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_streak",
        buffers: [rainInstanceLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });

    // Snow pipeline — vs_snow entry point, per-instance: cx,cy,halfSize
    const snowInstanceLayout: GPUVertexBufferLayout = {
      arrayStride: SNOW_FLOATS * 4,
      stepMode: "instance",
      attributes: [
        // location 0: center (cx, cy) — float32x2 at offset 0
        { shaderLocation: 0, offset: 0, format: "float32x2" },
        // location 1: half_size — float32 at offset 8
        { shaderLocation: 1, offset: 8, format: "float32" },
      ],
    };

    this.snowPipeline = ctx.device.createRenderPipeline({
      label: "WeatherPass snow pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_snow",
        buffers: [snowInstanceLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });

    // ── Instance buffers (initial capacity) ──────────────────────────────────
    this.rainInstanceCapacity = INITIAL_CAPACITY;
    this.rainStagingData = new Float32Array(INITIAL_CAPACITY * STREAK_FLOATS);
    this.rainInstanceBuffer = this._createRainBuffer(INITIAL_CAPACITY);

    this.snowInstanceCapacity = INITIAL_CAPACITY;
    this.snowStagingData = new Float32Array(INITIAL_CAPACITY * SNOW_FLOATS);
    this.snowInstanceBuffer = this._createSnowBuffer(INITIAL_CAPACITY);
  }

  /**
   * Draw all weather instances for this frame.
   *
   * Assumes the orchestrator has already called:
   *   pass.setBindGroup(0, ctx.viewBindGroup())
   * before draw() — group(0) is NOT set here.
   *
   * Branches on weather.weatherKind:
   *   "rain"  → packs streak instances via forEachRainStreak, one instanced draw
   *   "snow"  → packs snow instances via forEachSnowFlake, one instanced draw
   *   "none"  → early-out (no-op)
   */
  draw(pass: GPURenderPassEncoder, weather: RainField): void {
    const kind = weather.weatherKind;
    if (kind === "none" || weather.count === 0) return;

    // Parse the EDG color string to RGB floats (0..1).
    // rgbOf() returns [0..255, 0..255, 0..255]; divide by 255 for shader input.
    // This is done once per draw() call (cheap — no allocation for the result tuple).
    const [r255, g255, b255] = rgbOf(weather.streakColor);
    // rgbOf is guaranteed to return a 3-element tuple; the values are always defined.
    const cr = (r255 ?? 0) / 255;
    const cg = (g255 ?? 0) / 255;
    const cb = (b255 ?? 0) / 255;
    const ca = weather.curtainAlpha;

    // Pack WeatherUniform into the scratch buffer.
    // WGSL layout (std140 / WGSL alignment rules for structs):
    //   vec3<f32> color  → 12 bytes (occupies elements [0..2]),
    //   padding          → 4 bytes  (element [3] = 0)
    //   f32 curtain_alpha→ 4 bytes  (element [4])
    //   padding          → 12 bytes (elements [5..7] = 0)
    this.weatherUniformScratch[0] = cr;
    this.weatherUniformScratch[1] = cg;
    this.weatherUniformScratch[2] = cb;
    this.weatherUniformScratch[3] = 0; // pad
    this.weatherUniformScratch[4] = ca;
    this.weatherUniformScratch[5] = 0; // pad
    this.weatherUniformScratch[6] = 0; // pad
    this.weatherUniformScratch[7] = 0; // pad
    this.device.queue.writeBuffer(
      this.weatherUniformBuffer,
      0,
      this.weatherUniformScratch.buffer,
      0,
      WEATHER_UNIFORM_BYTES,
    );

    // Create (or recreate) the weather bind group pointing at the updated buffer.
    // Recreated each draw() call so the bind group always reflects the latest uniform.
    // (GPUBindGroup is cheap to create; buffer is always the same object.)
    const weatherBindGroup = this.device.createBindGroup({
      label: "WeatherPass weather-bg",
      layout: this.weatherBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.weatherUniformBuffer } }],
    });

    if (kind === "rain") {
      this._drawRain(pass, weather, weatherBindGroup);
    } else {
      this._drawSnow(pass, weather, weatherBindGroup);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _drawRain(
    pass: GPURenderPassEncoder,
    weather: RainField,
    weatherBindGroup: GPUBindGroup,
  ): void {
    // Count streaks and grow buffers if needed
    const count = weather.count;
    if (count > this.rainInstanceCapacity) {
      let newCap = this.rainInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.rainInstanceBuffer.destroy();
      this.rainInstanceBuffer = this._createRainBuffer(newCap);
      this.rainStagingData = new Float32Array(newCap * STREAK_FLOATS);
      this.rainInstanceCapacity = newCap;
    }

    // Pack streak instances into staging array via the RainField read API
    let i = 0;
    weather.forEachRainStreak((x0, y0, x1, y1) => {
      const base = i * STREAK_FLOATS;
      this.rainStagingData[base + 0] = x0;
      this.rainStagingData[base + 1] = y0;
      this.rainStagingData[base + 2] = x1;
      this.rainStagingData[base + 3] = y1;
      this.rainStagingData[base + 4] = STREAK_HALF_WIDTH;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    // Upload to GPU
    this.device.queue.writeBuffer(
      this.rainInstanceBuffer,
      0,
      this.rainStagingData.buffer,
      0,
      writtenCount * STREAK_FLOATS * 4,
    );

    // Bind and draw
    pass.setPipeline(this.rainPipeline);
    // group(0) already set by orchestrator — do NOT set here
    pass.setBindGroup(1, weatherBindGroup);
    pass.setVertexBuffer(0, this.rainInstanceBuffer);
    // 6 vertices per oriented quad (triangle-list), writtenCount instances
    pass.draw(6, writtenCount, 0, 0);
  }

  private _drawSnow(
    pass: GPURenderPassEncoder,
    weather: RainField,
    weatherBindGroup: GPUBindGroup,
  ): void {
    // Count flakes and grow buffers if needed
    const count = weather.count;
    if (count > this.snowInstanceCapacity) {
      let newCap = this.snowInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.snowInstanceBuffer.destroy();
      this.snowInstanceBuffer = this._createSnowBuffer(newCap);
      this.snowStagingData = new Float32Array(newCap * SNOW_FLOATS);
      this.snowInstanceCapacity = newCap;
    }

    // Pack snow instances into staging array via the RainField read API
    let i = 0;
    weather.forEachSnowFlake((cx, cy, halfSize) => {
      const base = i * SNOW_FLOATS;
      this.snowStagingData[base + 0] = cx;
      this.snowStagingData[base + 1] = cy;
      this.snowStagingData[base + 2] = halfSize;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    // Upload to GPU
    this.device.queue.writeBuffer(
      this.snowInstanceBuffer,
      0,
      this.snowStagingData.buffer,
      0,
      writtenCount * SNOW_FLOATS * 4,
    );

    // Bind and draw
    pass.setPipeline(this.snowPipeline);
    // group(0) already set by orchestrator — do NOT set here
    pass.setBindGroup(1, weatherBindGroup);
    pass.setVertexBuffer(0, this.snowInstanceBuffer);
    // 6 vertices per square quad (triangle-list), writtenCount instances
    pass.draw(6, writtenCount, 0, 0);
  }

  private _createRainBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "WeatherPass rain instance buffer",
      size: capacity * STREAK_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private _createSnowBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "WeatherPass snow instance buffer",
      size: capacity * SNOW_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}
