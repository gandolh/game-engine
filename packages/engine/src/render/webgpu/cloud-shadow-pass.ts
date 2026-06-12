/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// cloud-shadow-pass.ts — fBm cloud-shadow pass (brief 15)
//
// Draws a world-anchored, scrolling cloud-shadow overlay using 3-octave fBm noise.
// Positioned BETWEEN the weather curtain and the day/night tint so clouds darken
// the scene but still receive the tint wash on top of them (pass order in endFrame:
//   water → static → shadows → sprites → particles → weather → [cloud] → tint).
//
// Bind-group ownership:
//   group(0) = ViewUniform (set once per render pass by orchestrator;
//              CloudShadowPass relies on it being already set — never sets group 0).
//   group(1) = CloudUniform (per-draw: EDG shadow color as RGB floats + coverage +
//              drift speed + time). CloudShadowPass owns and writes this bind group.
//
// CloudUniform layout (32 bytes — must match cloud.wgsl):
//   offset  0: shadow_color (vec3<f32>, align 16, size 12)
//   offset 12: coverage     (f32)   — [0..1]
//   offset 16: drift_speed  (f32)   — world px / s
//   offset 20: time_sec     (f32)   — wall-clock seconds
//   offset 24: _pad0        (f32)
//   offset 28: _pad1        (f32)

import shaderSrc from "./shaders/cloud.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import { rgbOf } from "../palette";

const CLOUD_UNIFORM_BYTES = 32;

export interface CloudOptions {
  /** EDG hex color string for the shadow darkening (e.g. EDG.ink). */
  color: string;
  /** Cloud coverage in [0..1]: 0 = clear sky, 1 = full overcast. */
  coverage: number;
  /** Horizontal drift speed in world pixels per second (vertical is 38% of this). */
  driftSpeed: number;
  /** Wall-clock time in seconds — drives the animation phase. */
  timeSec: number;
}

export class CloudShadowPass {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformScratch: Float32Array;
  private readonly bindGroupLayout: GPUBindGroupLayout;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    // ── Cloud uniform buffer (group 1) ───────────────────────────────────────
    this.uniformBuffer = ctx.device.createBuffer({
      label: "CloudShadowPass uniform buffer",
      size: CLOUD_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Float32Array scratch: 8 floats = 32 bytes.
    // Layout matches CloudUniform in cloud.wgsl:
    //   [0..2] = shadow_color.rgb   (vec3<f32> at offset 0)
    //   [3]    = coverage           (f32 at offset 12)
    //   [4]    = drift_speed        (f32 at offset 16)
    //   [5]    = time_sec           (f32 at offset 20)
    //   [6]    = _pad0              (f32 at offset 24)
    //   [7]    = _pad1              (f32 at offset 28)
    this.uniformScratch = new Float32Array(8);

    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: "CloudShadowPass bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    // ── Pipeline ──────────────────────────────────────────────────────────────
    const shaderModule = ctx.device.createShaderModule({
      label: "cloud shadow shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "CloudShadowPass pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(),  // group(0) — ViewUniform (owned by orchestrator)
        this.bindGroupLayout,       // group(1) — CloudUniform (owned by this pass)
      ],
    });

    // Premultiplied source-over blend (identical to TintPass / WeatherPass):
    //   out.rgb = src.rgb + dst.rgb × (1 - src.a)
    //   out.a   = src.a  + dst.a   × (1 - src.a)
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

    this.pipeline = ctx.device.createRenderPipeline({
      label: "CloudShadowPass pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        // No vertex buffers — fullscreen triangle from vertex_index.
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });
  }

  /**
   * Draw the cloud-shadow overlay over whatever is currently in the render pass.
   *
   * Assumes the orchestrator has already called:
   *   pass.setBindGroup(0, ctx.viewBindGroup())
   * BEFORE calling draw() — group(0) is NOT set here.
   *
   * `opts.color` must be an EDG hex string; it is parsed to float RGB on the CPU
   * (the shader never synthesizes color values — pre-parsed EDG uniform pattern).
   *
   * The caller should skip draw() when coverage ≤ 0.001 (sunny day with no clouds).
   *
   * Assumes the pass is already open; does NOT call pass.end().
   */
  draw(pass: GPURenderPassEncoder, opts: CloudOptions): void {
    // Parse EDG hex string to float RGB (0..1).
    const [r255, g255, b255] = rgbOf(opts.color);
    const sr = (r255 ?? 0) / 255;
    const sg = (g255 ?? 0) / 255;
    const sb = (b255 ?? 0) / 255;

    // Pack CloudUniform into scratch buffer (layout matches cloud.wgsl).
    this.uniformScratch[0] = sr;
    this.uniformScratch[1] = sg;
    this.uniformScratch[2] = sb;
    this.uniformScratch[3] = opts.coverage;
    this.uniformScratch[4] = opts.driftSpeed;
    this.uniformScratch[5] = opts.timeSec;
    this.uniformScratch[6] = 0;  // _pad0
    this.uniformScratch[7] = 0;  // _pad1

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformScratch.buffer,
      0,
      CLOUD_UNIFORM_BYTES,
    );

    const bg = this.device.createBindGroup({
      label: "CloudShadowPass bg",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    pass.setPipeline(this.pipeline);
    // group(0) already set by orchestrator — do NOT set here.
    pass.setBindGroup(1, bg);
    // 3 vertices, 1 instance — fullscreen triangle.
    pass.draw(3, 1, 0, 0);
  }
}
