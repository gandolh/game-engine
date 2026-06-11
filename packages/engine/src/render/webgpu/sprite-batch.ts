/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// sprite-batch.ts — instanced sprite pipeline (Wave 1c)
//
// Bind-group ownership strategy (documented for Wave 2 / orchestrator):
//   - group(0) = ViewUniform (set ONCE per render pass by the orchestrator via
//     pass.setBindGroup(0, ctx.viewBindGroup()) BEFORE calling flush()).
//     SpriteBatch never sets group 0 — it relies on the pass already having it.
//   - group(1) = atlas texture + sampler (set per-flush call via atlasBindGroup arg).
//   - Instance vertex buffer: written per-flush from the atlasInstances array.
//
// Per-instance buffer layout (all f32, stride = FLOATS_PER_INSTANCE × 4 = 56 bytes):
//   offset  0: x        — world center X
//   offset  4: y        — world center Y (z-lifted by orchestrator)
//   offset  8: w        — world width
//   offset 12: h        — world height
//   offset 16: u0       — atlas UV left
//   offset 20: v0       — atlas UV top
//   offset 24: u1       — atlas UV right
//   offset 28: v1       — atlas UV bottom
//   offset 32: rotation — radians
//   offset 36: flip_x   — 0.0 or 1.0
//   offset 40: r        — tint red   (0..1)
//   offset 44: g        — tint green (0..1)
//   offset 48: b        — tint blue  (0..1)
//   offset 52: a        — sprite alpha × tint alpha (0..1)

import shaderSrc from "./shaders/sprite.wgsl?raw";
import type { GpuContext } from "./gpu-context";

export interface GpuSpriteInstance {
  x: number; y: number; w: number; h: number;     // world px, centered at (x, y - z)
  u0: number; v0: number; u1: number; v1: number; // atlas UVs
  rotation: number; flipX: 0 | 1;
  r: number; g: number; b: number; a: number;     // tint multiply (0..1), a = sprite alpha
}

// Number of f32 values per instance (14 × 4 bytes = 56 bytes per instance)
const FLOATS_PER_INSTANCE = 14;

// Initial capacity in number of instances; grown by doubling when exceeded
const INITIAL_CAPACITY = 512;

export class SpriteBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  // Reusable CPU-side staging array; resized on demand
  private stagingData: Float32Array;
  // GPU instance buffer; recreated when capacity grows
  private instanceBuffer: GPUBuffer;
  private instanceCapacity: number;

  constructor(ctx: GpuContext, atlasBindGroupLayout: GPUBindGroupLayout) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx, atlasBindGroupLayout);
  }

  /** Reset instance buffer for the new frame (no-op for SpriteBatch — state is per-flush). */
  begin(): void {
    // No persistent state to reset; each flush() is self-contained.
  }

  /**
   * Append one sprite instance. This method does NOT write to GPU memory;
   * it is kept for API compatibility with the §3.3 contract. The orchestrator
   * (Wave 2) accumulates instances into per-atlas groups and calls flush() per group.
   * add() is intentionally a no-op here — the orchestrator passes the array directly
   * to flush() after grouping. Retaining it keeps the contract intact for Wave 2.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  add(_inst: GpuSpriteInstance): void {
    // The §3.3 contract includes add() but the brief clarifies that the orchestrator
    // (Wave 2) groups sprites by atlasId and passes them as atlasInstances to flush().
    // add() therefore stays as a documented no-op stub until Wave 2 decides whether
    // to use it for inline accumulation. No work done here.
  }

  /**
   * Write atlasInstances into the GPU buffer, bind the pipeline + atlas, and issue
   * one instanced draw call (6 vertex indices × atlasInstances.length instances).
   *
   * Assumes the caller (orchestrator) has already called:
   *   pass.setBindGroup(0, ctx.viewBindGroup())
   * before any flush() on this pass.
   */
  flush(
    pass: GPURenderPassEncoder,
    atlasBindGroup: GPUBindGroup,
    atlasInstances: GpuSpriteInstance[],
  ): void {
    const count = atlasInstances.length;
    if (count === 0) return;

    // Grow GPU buffer + CPU staging array if needed (doubling strategy)
    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      this.instanceBuffer.destroy();
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.stagingData = new Float32Array(newCap * FLOATS_PER_INSTANCE);
      this.instanceCapacity = newCap;
    }

    // Pack instances into the staging array
    for (let i = 0; i < count; i++) {
      const inst = atlasInstances[i];
      // Guard: noUncheckedIndexedAccess requires the check above (count bound)
      if (inst === undefined) break;
      const base = i * FLOATS_PER_INSTANCE;
      this.stagingData[base + 0]  = inst.x;
      this.stagingData[base + 1]  = inst.y;
      this.stagingData[base + 2]  = inst.w;
      this.stagingData[base + 3]  = inst.h;
      this.stagingData[base + 4]  = inst.u0;
      this.stagingData[base + 5]  = inst.v0;
      this.stagingData[base + 6]  = inst.u1;
      this.stagingData[base + 7]  = inst.v1;
      this.stagingData[base + 8]  = inst.rotation;
      this.stagingData[base + 9]  = inst.flipX;
      this.stagingData[base + 10] = inst.r;
      this.stagingData[base + 11] = inst.g;
      this.stagingData[base + 12] = inst.b;
      this.stagingData[base + 13] = inst.a;
    }

    // Upload to GPU
    const byteLength = count * FLOATS_PER_INSTANCE * 4;
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.stagingData.buffer,
      0,
      byteLength,
    );

    // Bind pipeline
    pass.setPipeline(this.pipeline);

    // group(0) = ViewUniform — already set by the orchestrator once per pass; do NOT re-set here.
    // group(1) = atlas texture + sampler for this batch
    pass.setBindGroup(1, atlasBindGroup);

    // Instance buffer bound at slot 0 (vertex step mode)
    pass.setVertexBuffer(0, this.instanceBuffer);

    // Draw: 6 vertices per quad (triangle-list, no index buffer), N instances
    pass.draw(6, count, 0, 0);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _createInstanceBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "SpriteBatch instance buffer",
      size: capacity * FLOATS_PER_INSTANCE * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private _createPipeline(
    ctx: GpuContext,
    atlasBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline {
    const device = ctx.device;

    const shaderModule = device.createShaderModule({
      label: "sprite shader",
      code: shaderSrc,
    });

    // Pipeline layout: group 0 = view (from GpuContext), group 1 = atlas
    const pipelineLayout = device.createPipelineLayout({
      label: "sprite pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(), // group 0
        atlasBindGroupLayout,      // group 1
      ],
    });

    // Instance vertex buffer layout (array-stride = 14 floats × 4 bytes = 56)
    // All attributes are per-instance (stepMode: "instance")
    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [
        // location 0: pos (x, y) — float32x2 at offset 0
        { shaderLocation: 0, offset: 0,  format: "float32x2" },
        // location 1: size (w, h) — float32x2 at offset 8
        { shaderLocation: 1, offset: 8,  format: "float32x2" },
        // location 2: uv_min (u0, v0) — float32x2 at offset 16
        { shaderLocation: 2, offset: 16, format: "float32x2" },
        // location 3: uv_max (u1, v1) — float32x2 at offset 24
        { shaderLocation: 3, offset: 24, format: "float32x2" },
        // location 4: rotation — float32 at offset 32
        { shaderLocation: 4, offset: 32, format: "float32" },
        // location 5: flip_x — float32 at offset 36
        { shaderLocation: 5, offset: 36, format: "float32" },
        // location 6: tint (r, g, b, a) — float32x4 at offset 40
        { shaderLocation: 6, offset: 40, format: "float32x4" },
      ],
    };

    // Premultiplied-alpha blend state:
    //   out.rgb = src.rgb × 1  +  dst.rgb × (1 - src.a)
    //   out.a   = src.a  × 1  +  dst.a   × (1 - src.a)
    const blendState: GPUBlendState = {
      color: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
    };

    return device.createRenderPipeline({
      label: "sprite pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [instanceBufferLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: ctx.format,
            blend: blendState,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
    });
  }
}
