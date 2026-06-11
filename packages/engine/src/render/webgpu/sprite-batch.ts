/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// sprite-batch.ts — instanced sprite pipeline (Wave 1c)
//
// Bind-group ownership strategy (documented for Wave 2 / orchestrator):
//   - group(0) = ViewUniform (set ONCE per render pass by the orchestrator via
//     pass.setBindGroup(0, ctx.viewBindGroup()) BEFORE calling drawRange()).
//     SpriteBatch never sets group 0 — it relies on the pass already having it.
//   - group(1) = atlas texture + sampler (set per-drawRange call via atlasBindGroup arg).
//
// Frame protocol (the orchestrator drives this once per frame):
//   1. begin()                       — reset the instance cursor
//   2. add(inst) × N                 — pack every sprite for the frame (all atlas groups,
//                                      in draw order), remembering each group's first/count
//   3. upload()                      — ONE writeBuffer for the whole frame, BEFORE encoding
//                                      any draws that reference the buffer
//   4. drawRange(pass, bg, first, n) — per atlas group, in order, inside the render pass
//
// Why one upload per frame: queue.writeBuffer() executes on the queue timeline BEFORE the
// frame's command buffer is submitted. Writing the buffer once per atlas group at offset 0
// (the old flush() design) meant the LAST write was the contents for EVERY draw in the
// pass — all groups rendered the final group's instances. Packing the whole frame and
// drawing disjoint ranges via firstInstance avoids that entirely.
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
//   offset 52: a        — sprite alpha (0..1; tint alpha byte is ignored, like Canvas2D)

import shaderSrc from "./shaders/sprite.wgsl?raw";
import type { GpuContext } from "./gpu-context";

export interface GpuSpriteInstance {
  x: number; y: number; w: number; h: number;     // world px, centered at (x, y - z)
  u0: number; v0: number; u1: number; v1: number; // atlas UVs
  rotation: number; flipX: 0 | 1;
  r: number; g: number; b: number; a: number;     // tint multiply rgb (0..1), a = sprite alpha
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
  // Number of instances packed since begin()
  private cursor = 0;

  constructor(ctx: GpuContext, atlasBindGroupLayout: GPUBindGroupLayout) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx, atlasBindGroupLayout);
  }

  /** Reset the instance cursor for a new frame. */
  begin(): void {
    this.cursor = 0;
  }

  /** Instances packed since begin(). The next add() returns this as its index. */
  get count(): number {
    return this.cursor;
  }

  /**
   * Pack one sprite instance into the CPU staging array.
   * Returns the instance index (use as `first` for drawRange).
   * Grows the staging array by doubling; GPU upload happens in upload().
   */
  add(inst: GpuSpriteInstance): number {
    const index = this.cursor;
    const neededFloats = (index + 1) * FLOATS_PER_INSTANCE;
    if (neededFloats > this.stagingData.length) {
      const grown = new Float32Array(this.stagingData.length * 2);
      grown.set(this.stagingData);
      this.stagingData = grown;
    }
    const base = index * FLOATS_PER_INSTANCE;
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
    this.cursor = index + 1;
    return index;
  }

  /**
   * Upload the whole frame's instances to the GPU in ONE writeBuffer call.
   * MUST be called before the render pass that draws these instances is encoded
   * begins executing — i.e. call it before encoding drawRange() calls, never between
   * them (a second write would clobber the first for every draw in the pass).
   *
   * Growing the GPU buffer here is safe: the old buffer is only referenced by
   * already-submitted frames, and destroy() defers until the GPU is done with it.
   */
  upload(): void {
    const count = this.cursor;
    if (count === 0) return;

    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      this.instanceBuffer.destroy();
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.instanceCapacity = newCap;
    }

    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.stagingData.buffer,
      0,
      count * FLOATS_PER_INSTANCE * 4,
    );
  }

  /**
   * Encode one instanced draw for the range [first, first + count) packed via add().
   * The range is selected with the draw call's firstInstance — instance-stepped
   * vertex buffers start fetching at that index, so no per-group buffer rebind
   * or offset math is needed.
   *
   * Assumes the caller (orchestrator) has already called:
   *   pass.setBindGroup(0, ctx.viewBindGroup())
   * before any drawRange() on this pass, and upload() before the pass executes.
   */
  drawRange(
    pass: GPURenderPassEncoder,
    atlasBindGroup: GPUBindGroup,
    first: number,
    count: number,
  ): void {
    if (count === 0) return;
    pass.setPipeline(this.pipeline);
    // group(0) = ViewUniform — already set by the orchestrator once per pass; do NOT re-set here.
    // group(1) = atlas texture + sampler for this group
    pass.setBindGroup(1, atlasBindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    // Draw: 6 vertices per quad (triangle-list, no index buffer), N instances from `first`
    pass.draw(6, count, 0, first);
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
