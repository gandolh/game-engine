/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// tint-pass.ts — GPU full-screen tint pass (brief 12)
//
// Draws a solid color wash over the entire swap-chain texture using
// source-over blending: out = mix(scene, washColor, washAlpha).
//
// Bind-group ownership:
//   group(0) = TintUniform (owned entirely by TintPass — pre-parsed EDG color
//              as RGB floats + alpha). No ViewUniform is needed: the vertex
//              shader generates a fullscreen triangle from vertex_index alone.
//
// Uniform block layout (mirrors weather-pass.ts "pre-parsed EDG" pattern):
//   struct { wash_color: vec3<f32>, wash_alpha: f32 }
//   WGSL layout: vec3<f32> has align 16 / size 12; f32 at offset 12 (tail padding).
//   Total: 16 bytes.
//
// Pass ordering (see renderer.ts endFrame):
//   water → static → shadows → sprites → particles → weather → [tint] → overlay
//   The tint sits over every in-scene draw (sprites, water, weather) so later
//   passes (caustics, cloud shadows — briefs 13/15) compose UNDER it.

import shaderSrc from "./shaders/tint.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import { rgbOf } from "../palette";

// Size of TintUniform in bytes: vec3<f32> (12) + f32 (4) = 16.
const TINT_UNIFORM_BYTES = 16;

export class TintPass {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformScratch: Float32Array;
  private readonly bindGroupLayout: GPUBindGroupLayout;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    // ── Uniform buffer ────────────────────────────────────────────────────────
    this.uniformBuffer = ctx.device.createBuffer({
      label: "TintPass uniform buffer",
      size: TINT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Float32Array scratch: 4 floats = 16 bytes.
    // Layout: [0..2] = wash_color.rgb, [3] = wash_alpha (offset 12 in WGSL).
    this.uniformScratch = new Float32Array(4);

    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: "TintPass bgl",
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
      label: "tint shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "TintPass pipeline layout",
      bindGroupLayouts: [
        this.bindGroupLayout, // group(0) — TintUniform
        // No group(1): no ViewUniform needed (fullscreen triangle from vertex_index)
      ],
    });

    // Premultiplied-alpha source-over blend (identical to WeatherPass / ParticleBatch):
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
      label: "TintPass pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        // No vertex buffers — fullscreen triangle generated from vertex_index.
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
   * Draw the full-screen tint over whatever is currently in the render pass.
   *
   * `color` is an EDG hex string (e.g. EDG.slate); it is parsed to float RGB
   * on the CPU — the shader never synthesizes color values, matching the
   * "pre-parsed EDG uniform" pattern used by WeatherPass.
   *
   * `alpha` is the composite alpha in [0, 1].  The caller should skip draw()
   * when alpha ≤ 0.001 to avoid a no-op pipeline switch.
   *
   * Assumes the pass is already open; does NOT call pass.end().
   * Does NOT set group(0) on the view uniform — TintPass uses group(0) for its
   * own TintUniform and does not require a ViewUniform.
   */
  draw(pass: GPURenderPassEncoder, color: string, alpha: number): void {
    // Parse EDG hex string to float RGB (0..1).
    // rgbOf() returns [0..255, 0..255, 0..255]; divide by 255 for the shader.
    const [r255, g255, b255] = rgbOf(color);
    this.uniformScratch[0] = (r255 ?? 0) / 255;
    this.uniformScratch[1] = (g255 ?? 0) / 255;
    this.uniformScratch[2] = (b255 ?? 0) / 255;
    this.uniformScratch[3] = alpha;

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformScratch.buffer,
      0,
      TINT_UNIFORM_BYTES,
    );

    // Recreate the bind group each draw so it always reflects the updated buffer.
    // (GPUBindGroup creation is cheap; the buffer object itself never changes.)
    const bg = this.device.createBindGroup({
      label: "TintPass bg",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    // 3 vertices, 1 instance — fullscreen triangle.
    pass.draw(3, 1, 0, 0);
  }
}
