import type { GpuContext } from "./device";
import { SPRITE_WGSL } from "./sprite-shader";

export interface SpriteInstance {
  x: number;
  y: number;
  width: number;
  height: number;
  uvX: number;
  uvY: number;
  uvW: number;
  uvH: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintA: number;
  rotation: number;
  layer: number;
}

const FLOATS_PER_INSTANCE = 16;

export class SpriteBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly cameraBuffer: GPUBuffer;
  private readonly sampler: GPUSampler;
  private instanceCpu: Float32Array;
  private instanceBuffer: GPUBuffer;
  private capacity: number;
  private count = 0;
  private bindGroup: GPUBindGroup | null = null;
  private currentAtlas: GPUTextureView | null = null;

  constructor(private readonly gpu: GpuContext, initialCapacity = 1024) {
    this.device = gpu.device;
    this.capacity = initialCapacity;
    this.instanceCpu = new Float32Array(this.capacity * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this.createInstanceBuffer(this.capacity);

    this.cameraBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "nearest",
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });

    const module = this.device.createShaderModule({ code: SPRITE_WGSL });
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format: gpu.format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  private createInstanceBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      size: capacity * FLOATS_PER_INSTANCE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  setAtlas(view: GPUTextureView): void {
    if (this.currentAtlas === view && this.bindGroup) return;
    this.currentAtlas = view;
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: view },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.instanceBuffer } },
      ],
    });
  }

  setCamera(viewProj: Float32Array): void {
    this.device.queue.writeBuffer(this.cameraBuffer, 0, viewProj);
  }

  begin(): void {
    this.count = 0;
  }

  push(s: SpriteInstance): void {
    if (this.count >= this.capacity) this.grow(this.capacity * 2);
    const o = this.count * FLOATS_PER_INSTANCE;
    const a = this.instanceCpu;
    a[o + 0] = s.x;
    a[o + 1] = s.y;
    a[o + 2] = s.width;
    a[o + 3] = s.height;
    a[o + 4] = s.uvX;
    a[o + 5] = s.uvY;
    a[o + 6] = s.uvW;
    a[o + 7] = s.uvH;
    a[o + 8] = s.tintR;
    a[o + 9] = s.tintG;
    a[o + 10] = s.tintB;
    a[o + 11] = s.tintA;
    a[o + 12] = s.rotation;
    a[o + 13] = s.layer;
    a[o + 14] = 0;
    a[o + 15] = 0;
    this.count += 1;
  }

  private grow(newCapacity: number): void {
    const next = new Float32Array(newCapacity * FLOATS_PER_INSTANCE);
    next.set(this.instanceCpu);
    this.instanceCpu = next;
    this.instanceBuffer.destroy();
    this.instanceBuffer = this.createInstanceBuffer(newCapacity);
    this.capacity = newCapacity;
    if (this.currentAtlas) this.setAtlas(this.currentAtlas);
  }

  flush(pass: GPURenderPassEncoder): void {
    if (this.count === 0 || !this.bindGroup) return;
    const byteLen = this.count * FLOATS_PER_INSTANCE * 4;
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.instanceCpu.buffer,
      this.instanceCpu.byteOffset,
      byteLen,
    );
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, this.count, 0, 0);
  }
}
