/// <reference types="@webgpu/types" />
// shadow-batch.ts — instanced ground drop-shadow ellipses, drawn inside the GPU pass
// AFTER the static layer and BEFORE the sprite queue (same order as Canvas2dRenderer).
//
// Why GPU-side and not the 2D overlay: the overlay canvas composites ON TOP of the
// GPU canvas, so overlay shadows would darken the sprites standing on them. Order
// matters — shadows must sit under sprites, which means they have to live in the
// same render pass. (See overlay-2d.ts §"SHADOWS ARE NOT DRAWN HERE".)
//
// Blend equivalence with Canvas2D: the 2D path draws the ellipse with
// globalCompositeOperation = "multiply", fillStyle = EDG.black, globalAlpha = a.
// On an opaque destination that computes dst × (1 − a) inside the ellipse — exactly
// what premultiplied source-over of black at alpha a produces (src.rgb = 0):
//   out.rgb = 0 × 1 + dst.rgb × (1 − a)
// So the standard premultiplied blend state reproduces the multiply look 1:1.
//
// Bind-group ownership (same convention as sprite-batch / particle-batch):
//   - group(0) = ViewUniform, set once per pass by the orchestrator. Never set here.
//   - No other bind groups: the shadow color arrives as instance data, parsed at
//     runtime from an EDG swatch by the orchestrator (no color literals in WGSL).
//
// Frame protocol: begin() → add() × N → upload() (one writeBuffer, before encoding)
// → draw() (a single instanced draw inside the pass).
//
// Per-instance buffer layout (all f32, stride = FLOATS_PER_INSTANCE × 4 = 32 bytes):
//   offset  0: x     — ellipse center X (world px)
//   offset  4: y     — ellipse center Y (world px)
//   offset  8: rx    — ellipse X radius (world px)
//   offset 12: ry    — ellipse Y radius (world px)
//   offset 16: r     — shadow red   (0..1, runtime-parsed from EDG)
//   offset 20: g     — shadow green (0..1)
//   offset 24: b     — shadow blue  (0..1)
//   offset 28: alpha — shadow opacity (0..1)

import type { GpuContext } from "./gpu-context";

const FLOATS_PER_INSTANCE = 8;
const INITIAL_CAPACITY = 64;

const SHADOW_WGSL = /* wgsl */`
// ViewUniform — canonical convention shared with sprite.wgsl / particle.wgsl:
//   clipX = worldX * scale_x + offset_x
//   clipY = worldY * scale_y + offset_y   (scale_y is negative — no extra negation)
struct ViewUniform {
    scale_x  : f32,
    scale_y  : f32,
    offset_x : f32,
    offset_y : f32,
}
@group(0) @binding(0) var<uniform> view : ViewUniform;

struct InstanceIn {
    @location(0) pos_radii : vec4<f32>,  // (x, y, rx, ry) world px
    @location(1) color     : vec4<f32>,  // (r, g, b, alpha) straight, 0..1
}

struct VertexOut {
    @builtin(position) clip_pos : vec4<f32>,
    @location(0)       local_uv : vec2<f32>,  // 0..1 across the quad face
    @location(1)       color    : vec4<f32>,
}

// Quad corners (triangle-list, draw(6, N)) — same scheme as particle.wgsl:
//   vertex_index: 0 1 2  1 3 2
//   0 = top-left  1 = top-right  2 = bottom-left  3 = bottom-right
@vertex
fn vs_main(
    @builtin(vertex_index) vertex_index : u32,
    inst : InstanceIn,
) -> VertexOut {
    let corner_idx = array<u32, 6>(0u, 1u, 2u, 1u, 3u, 2u)[vertex_index];

    let lx_sign = select(-1.0, 1.0, (corner_idx & 1u) != 0u);  // 0,2 → -1  1,3 → +1
    let ly_sign = select(-1.0, 1.0, (corner_idx & 2u) != 0u);  // 0,1 → -1  2,3 → +1

    let world_x = inst.pos_radii.x + lx_sign * inst.pos_radii.z;
    let world_y = inst.pos_radii.y + ly_sign * inst.pos_radii.w;

    let nx = world_x * view.scale_x + view.offset_x;
    let ny = world_y * view.scale_y + view.offset_y;

    var out : VertexOut;
    out.clip_pos = vec4<f32>(nx, ny, 0.0, 1.0);
    out.local_uv = vec2<f32>(
        select(0.0, 1.0, (corner_idx & 1u) != 0u),
        select(0.0, 1.0, (corner_idx & 2u) != 0u),
    );
    out.color = inst.color;
    return out;
}

// Ellipse coverage via the unit circle in local UV space (the quad already spans
// rx × ry, so a UV circle IS the world-space ellipse). fwidth() is called from
// uniform control flow — no data-dependent branching before it.
@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
    let d  = length(in.local_uv - vec2<f32>(0.5, 0.5)) - 0.5;
    let fw = fwidth(d);
    let coverage = clamp(1.0 - d / max(fw, 0.0001), 0.0, 1.0);

    if coverage <= 0.0 {
        discard;
    }

    let total_alpha = in.color.a * coverage;
    // Premultiplied output: with a black shadow color this is (0, 0, 0, a),
    // which the blend state turns into dst × (1 − a) — the Canvas2D multiply look.
    return vec4<f32>(in.color.rgb * total_alpha, total_alpha);
}
`;

export class ShadowBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  private stagingData: Float32Array;
  private instanceBuffer: GPUBuffer;
  private instanceCapacity: number;
  private cursor = 0;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx);
  }

  /** Reset the instance cursor for a new frame. */
  begin(): void {
    this.cursor = 0;
  }

  /** Pack one shadow ellipse. Color is runtime-parsed RGB floats (0..1). */
  add(x: number, y: number, rx: number, ry: number, r: number, g: number, b: number, alpha: number): void {
    const index = this.cursor;
    const neededFloats = (index + 1) * FLOATS_PER_INSTANCE;
    if (neededFloats > this.stagingData.length) {
      const grown = new Float32Array(this.stagingData.length * 2);
      grown.set(this.stagingData);
      this.stagingData = grown;
    }
    const base = index * FLOATS_PER_INSTANCE;
    this.stagingData[base + 0] = x;
    this.stagingData[base + 1] = y;
    this.stagingData[base + 2] = rx;
    this.stagingData[base + 3] = ry;
    this.stagingData[base + 4] = r;
    this.stagingData[base + 5] = g;
    this.stagingData[base + 6] = b;
    this.stagingData[base + 7] = alpha;
    this.cursor = index + 1;
  }

  /** One writeBuffer for the frame. Call BEFORE encoding the pass that draws it. */
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
   * Encode the single instanced draw for all shadows packed this frame.
   * Assumes group(0) is already set on the pass by the orchestrator.
   */
  draw(pass: GPURenderPassEncoder): void {
    if (this.cursor === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, this.cursor, 0, 0);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _createInstanceBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "ShadowBatch instance buffer",
      size: capacity * FLOATS_PER_INSTANCE * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private _createPipeline(ctx: GpuContext): GPURenderPipeline {
    const device = ctx.device;

    const shaderModule = device.createShaderModule({
      label: "shadow shader",
      code: SHADOW_WGSL,
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "shadow pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(), // group 0
      ],
    });

    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [
        // location 0: pos_radii (x, y, rx, ry) — float32x4 at offset 0
        { shaderLocation: 0, offset: 0,  format: "float32x4" },
        // location 1: color (r, g, b, alpha) — float32x4 at offset 16
        { shaderLocation: 1, offset: 16, format: "float32x4" },
      ],
    };

    // Premultiplied-alpha blend (identical to SpriteBatch / ParticleBatch).
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
      label: "shadow pipeline",
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
