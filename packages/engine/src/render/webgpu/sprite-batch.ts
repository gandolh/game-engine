

import shaderSrc from "./shaders/sprite.wgsl?raw";
import type { GpuContext } from "./gpu-context";

export interface GpuSpriteInstance {
  x: number; y: number; w: number; h: number;     
  u0: number; v0: number; u1: number; v1: number; 
  rotation: number; flipX: 0 | 1;
  r: number; g: number; b: number; a: number;     

  swayPhase: number;

  swayAmp: number;
}

const FLOATS_PER_INSTANCE = 16;

const INITIAL_CAPACITY = 512;

export class SpriteBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  private stagingData: Float32Array;

  private instanceBuffer: GPUBuffer;
  private instanceCapacity: number;

  private cursor = 0;

  constructor(ctx: GpuContext, atlasBindGroupLayout: GPUBindGroupLayout) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx, atlasBindGroupLayout);
  }

  begin(): void {
    this.cursor = 0;
  }

  get count(): number {
    return this.cursor;
  }

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
    this.stagingData[base + 14] = inst.swayPhase;
    this.stagingData[base + 15] = inst.swayAmp;
    this.cursor = index + 1;
    return index;
  }

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

  drawRange(
    pass: GPURenderPassEncoder,
    atlasBindGroup: GPUBindGroup,
    first: number,
    count: number,
  ): void {
    if (count === 0) return;
    pass.setPipeline(this.pipeline);

    pass.setBindGroup(1, atlasBindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);

    pass.draw(6, count, 0, first);
  }

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

    const pipelineLayout = device.createPipelineLayout({
      label: "sprite pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(), 
        atlasBindGroupLayout,      
      ],
    });

    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [

        { shaderLocation: 0, offset: 0,  format: "float32x2" },

        { shaderLocation: 1, offset: 8,  format: "float32x2" },

        { shaderLocation: 2, offset: 16, format: "float32x2" },

        { shaderLocation: 3, offset: 24, format: "float32x2" },

        { shaderLocation: 4, offset: 32, format: "float32" },

        { shaderLocation: 5, offset: 36, format: "float32" },

        { shaderLocation: 6, offset: 40, format: "float32x4" },

        { shaderLocation: 7, offset: 56, format: "float32" },

        { shaderLocation: 8, offset: 60, format: "float32" },
      ],
    };

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
