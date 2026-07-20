/**
 * Lazily creates + memoizes the scene3d render pipeline (and its shader
 * module + bind group layouts), keyed by swapchain format (+ a reserved
 * toon-steps knob — see the DEFERRED SEAM note in `scene3d.wgsl`; there is
 * only one ramp shipped today so the knob does not yet change anything
 * observable, but the cache key already accounts for it so adding a real
 * variant later doesn't require touching call sites).
 *
 * Thin GPU orchestration, typecheck-only — see `buffers.ts` for the tested
 * pure core this pipeline's vertex layout mirrors byte-for-byte.
 */
import shaderSrc from "./shaders/scene3d.wgsl?raw";
import { FLOATS_PER_INSTANCE, FLOATS_PER_VERTEX } from "./buffers";

/** Everything a frame needs to draw with the scene3d pipeline. */
export interface Pipeline3d {
  readonly pipeline: GPURenderPipeline;
  readonly frameBindGroupLayout: GPUBindGroupLayout;
  readonly materialsBindGroupLayout: GPUBindGroupLayout;
}

const DEFAULT_TOON_STEPS = 3;

export class PipelineCache {
  private readonly device: GPUDevice;
  private readonly cache = new Map<string, Pipeline3d>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  getOrCreate(format: GPUTextureFormat, toonSteps: number = DEFAULT_TOON_STEPS): Pipeline3d {
    const key = `${format}:${toonSteps}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const built = this._build(format);
    this.cache.set(key, built);
    return built;
  }

  private _build(format: GPUTextureFormat): Pipeline3d {
    const device = this.device;

    const shaderModule = device.createShaderModule({ label: "scene3d shader", code: shaderSrc });

    const frameBindGroupLayout = device.createBindGroupLayout({
      label: "scene3d frame bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const materialsBindGroupLayout = device.createBindGroupLayout({
      label: "scene3d materials bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "scene3d pipeline layout",
      bindGroupLayouts: [frameBindGroupLayout, materialsBindGroupLayout],
    });

    // Buffer 0: per-vertex — position.xyz (loc0) + materialIndex (loc1).
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_VERTEX * 4,
      stepMode: "vertex",
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32" },
      ],
    };

    // Buffer 1: per-instance — model matrix as 4 columns (loc2..5) + tint
    // (loc6). Matches `packInstance`'s 20-float row exactly.
    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [
        { shaderLocation: 2, offset: 0, format: "float32x4" },
        { shaderLocation: 3, offset: 16, format: "float32x4" },
        { shaderLocation: 4, offset: 32, format: "float32x4" },
        { shaderLocation: 5, offset: 48, format: "float32x4" },
        { shaderLocation: 6, offset: 64, format: "float32x4" },
      ],
    };

    const pipeline = device.createRenderPipeline({
      label: "scene3d pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [vertexBufferLayout, instanceBufferLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
        frontFace: "ccw",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    return { pipeline, frameBindGroupLayout, materialsBindGroupLayout };
  }
}
