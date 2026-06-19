

import shaderSrc from "./shaders/cloud.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import { rgbOf } from "../palette";

const CLOUD_UNIFORM_BYTES = 32;

export interface CloudOptions {

  color: string;

  coverage: number;

  driftSpeed: number;

  timeSec: number;
}

export class CloudShadowPass {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformScratch: Float32Array;
  private readonly bindGroupLayout: GPUBindGroupLayout;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    this.uniformBuffer = ctx.device.createBuffer({
      label: "CloudShadowPass uniform buffer",
      size: CLOUD_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformScratch = new Float32Array(8);

    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: "CloudShadowPass bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderModule = ctx.device.createShaderModule({
      label: "cloud shadow shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "CloudShadowPass pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(),  
        this.bindGroupLayout,       
      ],
    });

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
      label: "CloudShadowPass pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",

      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });
  }

  draw(pass: GPURenderPassEncoder, opts: CloudOptions): void {

    const [r255, g255, b255] = rgbOf(opts.color);
    const sr = (r255 ?? 0) / 255;
    const sg = (g255 ?? 0) / 255;
    const sb = (b255 ?? 0) / 255;

    this.uniformScratch[0] = sr;
    this.uniformScratch[1] = sg;
    this.uniformScratch[2] = sb;
    this.uniformScratch[3] = opts.coverage;
    this.uniformScratch[4] = opts.driftSpeed;
    this.uniformScratch[5] = opts.timeSec;
    this.uniformScratch[6] = 0;  
    this.uniformScratch[7] = 0;  

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformScratch.buffer,
      0,
      CLOUD_UNIFORM_BYTES,
    );

    const bg = this.device.createBindGroup({
      label: "CloudShadowPass bg",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    pass.setPipeline(this.pipeline);

    pass.setBindGroup(1, bg);

    pass.draw(3, 1, 0, 0);
  }
}
