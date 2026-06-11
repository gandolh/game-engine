/// <reference types="@webgpu/types" />
/// <reference path="./wgsl.d.ts" />
// particle-batch.ts — instanced particle pipeline (Wave 4a)
//
// Bind-group ownership strategy (mirrors sprite-batch.ts convention):
//   - group(0) = ViewUniform (set ONCE per render pass by the orchestrator via
//     pass.setBindGroup(0, ctx.viewBindGroup()) BEFORE calling draw()).
//     ParticleBatch never sets group 0 — it relies on the pass already having it.
//   - No additional bind groups (particles carry color as instance attributes).
//   - Instance vertex buffer: written each draw() call from the live particle pool.
//
// Per-instance buffer layout (all f32, stride = FLOATS_PER_INSTANCE × 4 = 32 bytes):
//   offset  0: x       — world center X
//   offset  4: y       — world center Y
//   offset  8: size    — radius/half-size in world px
//   offset 12: shapeId — 0.0 = circle, 1.0 = rect, 2.0 = star (filled diamond approx)
//   offset 16: r       — red   (0..1, normalised from 0..255 storage)
//   offset 20: g       — green (0..1)
//   offset 24: b       — blue  (0..1)
//   offset 28: alpha   — opacity (0..1), = max(0, life/maxLife)

import shaderSrc from "./shaders/particle.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import type { ParticleSystem } from "../particles";

// Number of f32 values per instance (8 × 4 bytes = 32 bytes per instance)
const FLOATS_PER_INSTANCE = 8;

// Initial capacity in number of instances; grown by doubling when exceeded
const INITIAL_CAPACITY = 256;

// shapeId values must match particle.wgsl constants
const SHAPE_ID_CIRCLE = 0.0;
const SHAPE_ID_RECT   = 1.0;
const SHAPE_ID_STAR   = 2.0;

export class ParticleBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  // CPU-side staging array; resized on demand (doubling strategy)
  private stagingData: Float32Array;
  // GPU instance buffer; recreated when capacity grows
  private instanceBuffer: GPUBuffer;
  private instanceCapacity: number;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx);
  }

  /**
   * Read all live particles from the ParticleSystem, pack them into the GPU instance
   * buffer, and issue a single instanced draw call.
   *
   * Assumes the orchestrator has already set group(0) on the pass:
   *   pass.setBindGroup(0, ctx.viewBindGroup())
   */
  draw(pass: GPURenderPassEncoder, particles: ParticleSystem): void {
    if (particles.count === 0) return;

    // First pass: count so we can pre-allocate / grow if needed.
    // (count is a cheap getter; the pool size is bounded by the emit rate.)
    const count = particles.count;

    // Grow GPU buffer + CPU staging array if needed (doubling strategy)
    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      this.instanceBuffer.destroy();
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.stagingData = new Float32Array(newCap * FLOATS_PER_INSTANCE);
      this.instanceCapacity = newCap;
    }

    // Pack instances into the staging array via the ParticleSystem read API
    let i = 0;
    particles.forEachParticle((v) => {
      const base = i * FLOATS_PER_INSTANCE;
      this.stagingData[base + 0] = v.x;
      this.stagingData[base + 1] = v.y;
      this.stagingData[base + 2] = v.size;
      this.stagingData[base + 3] =
        v.shape === "circle" ? SHAPE_ID_CIRCLE :
        v.shape === "rect"   ? SHAPE_ID_RECT   :
        /* "star" */           SHAPE_ID_STAR;
      // Normalise colors from 0..255 range (as stored in ParticleSystem) to 0..1
      this.stagingData[base + 4] = v.r / 255;
      this.stagingData[base + 5] = v.g / 255;
      this.stagingData[base + 6] = v.b / 255;
      this.stagingData[base + 7] = v.alpha;
      i++;
    });

    // actual written count (should equal `count`; guard against any mismatch)
    const writtenCount = i;
    if (writtenCount === 0) return;

    // Upload to GPU
    const byteLength = writtenCount * FLOATS_PER_INSTANCE * 4;
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
    // Instance buffer bound at slot 0 (vertex step mode, instance-stepped)
    pass.setVertexBuffer(0, this.instanceBuffer);

    // Draw: 6 vertices per quad (triangle-list, no index buffer), N instances
    pass.draw(6, writtenCount, 0, 0);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _createInstanceBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "ParticleBatch instance buffer",
      size: capacity * FLOATS_PER_INSTANCE * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private _createPipeline(ctx: GpuContext): GPURenderPipeline {
    const device = ctx.device;

    const shaderModule = device.createShaderModule({
      label: "particle shader",
      code: shaderSrc,
    });

    // Pipeline layout: group 0 = view (from GpuContext); no group 1.
    const pipelineLayout = device.createPipelineLayout({
      label: "particle pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(), // group 0
      ],
    });

    // Instance vertex buffer layout (array-stride = 8 floats × 4 bytes = 32)
    // All attributes are per-instance (stepMode: "instance")
    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [
        // location 0: center (x, y) — float32x2 at offset 0
        { shaderLocation: 0, offset: 0,  format: "float32x2" },
        // location 1: size — float32 at offset 8
        { shaderLocation: 1, offset: 8,  format: "float32" },
        // location 2: shapeId — float32 at offset 12
        { shaderLocation: 2, offset: 12, format: "float32" },
        // location 3: color (r, g, b, alpha) — float32x4 at offset 16
        { shaderLocation: 3, offset: 16, format: "float32x4" },
      ],
    };

    // Premultiplied-alpha blend state (identical to SpriteBatch):
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
      label: "particle pipeline",
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
