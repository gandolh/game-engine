/**
 * Public GPU facade for the 3D render layer. Thin orchestration over the pure
 * packing in `buffers.ts` — math/layout logic is delegated there and unit
 * tested; this file's job is strictly "own the GPU objects and issue the draw
 * calls", so it is typecheck-only (see the 08b brief's un-verifiable-here
 * constraint: WebGPU cannot run headless here).
 */
import type { Vec3 } from "../types";
import type { Mat4 } from "../mat4";
import type { Mesh } from "../types";
import type { Device3d } from "./device3d";
import { PipelineCache, type Pipeline3d } from "./pipeline-cache";
import { FLOATS_PER_INSTANCE, packMaterials, packMesh, type Material } from "./buffers";

/**
 * An opaque GPU handle for one uploaded mesh (returned by
 * `SceneRenderer3D.uploadMesh`). Treat as opaque — the only public field is
 * `indexCount` (useful for debugging/HUD text); the GPU buffers backing it
 * are only ever touched by `SceneRenderer3D` itself.
 */
export class MeshHandle {
  readonly indexCount: number;
  /** @internal */
  readonly vertexBuffer: GPUBuffer;
  /** @internal */
  readonly indexBuffer: GPUBuffer;

  constructor(vertexBuffer: GPUBuffer, indexBuffer: GPUBuffer, indexCount: number) {
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    this.indexCount = indexCount;
  }
}

/** One instanced draw call: a mesh + a packed instance buffer (see
 *  `packInstance`/`packInstances` in `buffers.ts` — the caller builds this
 *  Float32Array with those pure functions before calling `render`). */
export interface DrawCall3d {
  readonly mesh: MeshHandle;
  readonly instances: Float32Array;
  readonly instanceCount: number;
}

/** Everything needed to render one frame. */
export interface Frame3d {
  readonly viewProj: Mat4;
  readonly sunDir: Vec3;
  /** 0 = full night, 1 = full day. */
  readonly dayNight: number;
  readonly ambient: number;
  /** Render/wall clock seconds (e.g. `performance.now() / 1000`) — NEVER a
   *  sim tick. Currently unused by the shipped shader beyond being threaded
   *  through the uniform, reserved for future time-based effects (foliage
   *  sway, water ripple). */
  readonly time: number;
  readonly draws: readonly DrawCall3d[];
}

// FrameUniform std140-ish layout: viewProj (16) + sunDir (vec3, padded to 4)
// + dayNight (1) + ambient (1) + time (1) + 1 pad = 24 floats. sunDir must
// start on a 16-byte (4-float) boundary per WGSL's vec3 alignment rule, and
// with viewProj occupying the first 16 floats it already does.
const FRAME_UNIFORM_FLOATS = 24;

export interface SceneRendererOptions {
  /** rgba clear color, straight floats (the engine ships no palette — the
   *  caller resolves its own palette role to floats before passing this in).
   *  Defaults to transparent black. */
  readonly clearColor?: readonly [number, number, number, number];
}

/**
 * Owns the GPU pipeline, material table, per-mesh vertex/index buffers, and
 * per-frame uniform for the 3D scene. One instance per canvas/`Device3d`.
 */
export class SceneRenderer3D {
  private readonly device3d: Device3d;
  private readonly pipelineCache: PipelineCache;
  private readonly clearColor: readonly [number, number, number, number];
  private readonly frameScratch = new Float32Array(FRAME_UNIFORM_FLOATS);
  private readonly frameBuffer: GPUBuffer;

  private pipelineInfo: Pipeline3d | null = null;
  private frameBindGroup: GPUBindGroup | null = null;

  private materialsBuffer: GPUBuffer | null = null;
  private materialsBindGroup: GPUBindGroup | null = null;

  private depthTexture: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;

  private readonly instanceBuffers = new Map<MeshHandle, { buffer: GPUBuffer; capacityBytes: number }>();

  constructor(device3d: Device3d, options: SceneRendererOptions = {}) {
    this.device3d = device3d;
    this.pipelineCache = new PipelineCache(device3d.device);
    this.clearColor = options.clearColor ?? [0, 0, 0, 0];
    this.frameBuffer = device3d.device.createBuffer({
      label: "scene3d frame uniform",
      size: FRAME_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Upload the material table. The caller is responsible for keeping the
   *  ORDER of `materials` in sync with whatever `materialIndexOf` resolver
   *  (see `buffers.ts#materialIndexMap`) it used to build meshes with
   *  `uploadMesh` — index `i` here == material index `i` in the shader. */
  setMaterials(materials: readonly Material[]): void {
    const device = this.device3d.device;
    const packed = packMaterials(materials);

    this.materialsBuffer?.destroy();
    this.materialsBuffer = device.createBuffer({
      label: "scene3d materials",
      size: Math.max(packed.byteLength, 32),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.materialsBuffer, 0, packed);
    this.materialsBindGroup = null; // rebuilt lazily once the pipeline layout exists
  }

  /** Pack (via `packMesh`) and upload a mesh's vertex/index buffers.
   *  `materialIndexOf` resolves each triangle's material-key string to an
   *  index into the table uploaded by `setMaterials` — build it with
   *  `materialIndexMap` over the SAME ordered key list. */
  uploadMesh(mesh: Mesh, materialIndexOf: (key: string) => number): MeshHandle {
    const device = this.device3d.device;
    const packed = packMesh(mesh, materialIndexOf);

    const vertexBuffer = device.createBuffer({
      label: "scene3d mesh vertices",
      size: Math.max(packed.vertices.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, packed.vertices);

    const indexBuffer = device.createBuffer({
      label: "scene3d mesh indices",
      size: Math.max(packed.indices.byteLength, 4),
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, packed.indices);

    return new MeshHandle(vertexBuffer, indexBuffer, packed.indexCount);
  }

  /** (Re)create the depth texture to match the current swapchain size. Call
   *  whenever the canvas resizes. */
  resize(width: number, height: number): void {
    this.depthTexture?.destroy();
    this.depthTexture = this.device3d.device.createTexture({
      label: "scene3d depth",
      size: [Math.max(1, width), Math.max(1, height)],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();
  }

  render(frame: Frame3d): void {
    if (this.device3d.lost) return;
    if (!this.materialsBuffer) {
      throw new Error("render3d: SceneRenderer3D.render called before setMaterials");
    }

    const device = this.device3d.device;
    const info = this.pipelineCache.getOrCreate(this.device3d.format);
    this.pipelineInfo = info;

    if (!this.frameBindGroup) {
      this.frameBindGroup = device.createBindGroup({
        label: "scene3d frame bind group",
        layout: info.frameBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.frameBuffer } }],
      });
    }
    if (!this.materialsBindGroup) {
      this.materialsBindGroup = device.createBindGroup({
        label: "scene3d materials bind group",
        layout: info.materialsBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.materialsBuffer } }],
      });
    }
    if (!this.depthView) {
      this.resize(this.device3d.canvas.width, this.device3d.canvas.height);
    }

    this._writeFrameUniform(frame);

    const encoder = device.createCommandEncoder({ label: "scene3d frame" });
    const colorView = this.device3d.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      label: "scene3d pass",
      colorAttachments: [
        {
          view: colorView,
          clearValue: {
            r: this.clearColor[0],
            g: this.clearColor[1],
            b: this.clearColor[2],
            a: this.clearColor[3],
          },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        // Guaranteed non-null: the branch above calls `resize()` if unset.
        view: this.depthView as GPUTextureView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    pass.setPipeline(info.pipeline);
    pass.setBindGroup(0, this.frameBindGroup);
    pass.setBindGroup(1, this.materialsBindGroup);

    for (const draw of frame.draws) {
      if (draw.instanceCount === 0) continue;
      const instanceBuffer = this._instanceBufferFor(draw.mesh, draw.instances);
      pass.setVertexBuffer(0, draw.mesh.vertexBuffer);
      pass.setVertexBuffer(1, instanceBuffer);
      pass.setIndexBuffer(draw.mesh.indexBuffer, "uint32");
      pass.drawIndexed(draw.mesh.indexCount, draw.instanceCount);
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  private _writeFrameUniform(frame: Frame3d): void {
    const s = this.frameScratch;
    s.set(frame.viewProj, 0);
    s[16] = frame.sunDir[0];
    s[17] = frame.sunDir[1];
    s[18] = frame.sunDir[2];
    // s[19] left as pad (vec3 -> vec4 alignment).
    s[20] = frame.dayNight;
    s[21] = frame.ambient;
    s[22] = frame.time;
    // s[23] left as pad (struct rounds to a 16-byte/4-float multiple).
    this.device3d.queue.writeBuffer(this.frameBuffer, 0, s);
  }

  private _instanceBufferFor(mesh: MeshHandle, data: Float32Array): GPUBuffer {
    const device = this.device3d.device;
    const neededBytes = Math.max(data.byteLength, FLOATS_PER_INSTANCE * 4);
    let entry = this.instanceBuffers.get(mesh);
    if (!entry || entry.capacityBytes < neededBytes) {
      entry?.buffer.destroy();
      entry = {
        buffer: device.createBuffer({
          label: "scene3d instances",
          size: neededBytes,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        }),
        capacityBytes: neededBytes,
      };
      this.instanceBuffers.set(mesh, entry);
    }
    device.queue.writeBuffer(entry.buffer, 0, data);
    return entry.buffer;
  }
}
