

import shaderSrc from "./shaders/particle.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import type { ParticleSystem } from "../particles";

const FLOATS_PER_INSTANCE = 8;

const INITIAL_CAPACITY = 256;

const SHAPE_ID_CIRCLE = 0.0;
const SHAPE_ID_RECT   = 1.0;
const SHAPE_ID_STAR   = 2.0;

export class ParticleBatch {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  private stagingData: Float32Array;

  private instanceBuffer: GPUBuffer;
  private instanceCapacity: number;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;
    this.instanceCapacity = INITIAL_CAPACITY;
    this.stagingData = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
    this.instanceBuffer = this._createInstanceBuffer(INITIAL_CAPACITY);
    this.pipeline = this._createPipeline(ctx);
  }

  draw(pass: GPURenderPassEncoder, particles: ParticleSystem): void {
    if (particles.count === 0) return;

    const count = particles.count;

    if (count > this.instanceCapacity) {
      let newCap = this.instanceCapacity;
      while (newCap < count) newCap *= 2;
      this.instanceBuffer.destroy();
      this.instanceBuffer = this._createInstanceBuffer(newCap);
      this.stagingData = new Float32Array(newCap * FLOATS_PER_INSTANCE);
      this.instanceCapacity = newCap;
    }

    let i = 0;
    particles.forEachParticle((v) => {
      const base = i * FLOATS_PER_INSTANCE;
      this.stagingData[base + 0] = v.x;
      this.stagingData[base + 1] = v.y;
      this.stagingData[base + 2] = v.size;
      this.stagingData[base + 3] =
        v.shape === "circle" ? SHAPE_ID_CIRCLE :
        v.shape === "rect"   ? SHAPE_ID_RECT   :
                   SHAPE_ID_STAR;

      this.stagingData[base + 4] = v.r / 255;
      this.stagingData[base + 5] = v.g / 255;
      this.stagingData[base + 6] = v.b / 255;
      this.stagingData[base + 7] = v.alpha;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    const byteLength = writtenCount * FLOATS_PER_INSTANCE * 4;
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.stagingData.buffer,
      0,
      byteLength,
    );

    pass.setPipeline(this.pipeline);

    pass.setVertexBuffer(0, this.instanceBuffer);

    pass.draw(6, writtenCount, 0, 0);
  }

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

    const pipelineLayout = device.createPipelineLayout({
      label: "particle pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(), 
      ],
    });

    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: FLOATS_PER_INSTANCE * 4,
      stepMode: "instance",
      attributes: [

        { shaderLocation: 0, offset: 0,  format: "float32x2" },

        { shaderLocation: 1, offset: 8,  format: "float32" },

        { shaderLocation: 2, offset: 12, format: "float32" },

        { shaderLocation: 3, offset: 16, format: "float32x4" },
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
