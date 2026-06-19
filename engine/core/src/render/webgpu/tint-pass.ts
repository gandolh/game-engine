

import shaderSrc from "./shaders/tint.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import { rgbOf } from "../palette";

const TINT_UNIFORM_BYTES = 16;

export class TintPass {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformScratch: Float32Array;
  private readonly bindGroupLayout: GPUBindGroupLayout;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    this.uniformBuffer = ctx.device.createBuffer({
      label: "TintPass uniform buffer",
      size: TINT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformScratch = new Float32Array(4);

    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: "TintPass bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderModule = ctx.device.createShaderModule({
      label: "tint shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "TintPass pipeline layout",
      bindGroupLayouts: [
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
      label: "TintPass pipeline",
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

  draw(pass: GPURenderPassEncoder, color: string, alpha: number): void {

    const [r255, g255, b255] = rgbOf(color);
    this.uniformScratch[0] = (r255 ?? 0) / 255;
    this.uniformScratch[1] = (g255 ?? 0) / 255;
    this.uniformScratch[2] = (b255 ?? 0) / 255;
    this.uniformScratch[3] = alpha;

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformScratch.buffer,
      0,
      TINT_UNIFORM_BYTES,
    );

    const bg = this.device.createBindGroup({
      label: "TintPass bg",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);

    pass.draw(3, 1, 0, 0);
  }
}
