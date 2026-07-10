

export interface ViewUniform {

  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;

  timeSec: number;

  windStrength: number;
}

const VIEW_UNIFORM_BYTES = 32;

export class GpuContext {
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly format: GPUTextureFormat;
  readonly context: GPUCanvasContext;

  private readonly _viewBuffer: GPUBuffer;
  private readonly _viewBindGroupLayout: GPUBindGroupLayout;
  private readonly _viewBindGroup: GPUBindGroup;
  private readonly _scratch: Float32Array;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
  ) {
    this.device = device;
    this.queue = device.queue;
    this.format = format;
    this.context = context;

    this._viewBuffer = device.createBuffer({
      label: "view-uniform",
      size: VIEW_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._scratch = new Float32Array(8);

    this._viewBindGroupLayout = device.createBindGroupLayout({
      label: "view-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this._viewBindGroup = device.createBindGroup({
      label: "view-bg",
      layout: this._viewBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this._viewBuffer },
        },
      ],
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<GpuContext> {
    if (!navigator.gpu) {
      throw new Error("webgpu: navigator.gpu unavailable");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("webgpu: no GPU adapter found");
    }

    const device = await adapter.requestDevice();

    // Review item 34: `device.lost` is handled by `WebGpuRenderer`'s constructor
    // (the only caller of `GpuContext.create`), which both logs AND flips
    // `_deviceLost` to gate further GPU calls. A second handler registered here
    // fired the same log line a second time on every loss with no extra effect
    // — removed rather than duplicated.

    const gpuCtx = canvas.getContext("webgpu");
    if (!gpuCtx) {
      throw new Error("webgpu: canvas.getContext(\"webgpu\") returned null");
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    gpuCtx.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });

    return new GpuContext(device, gpuCtx, format);
  }

  resize(width: number, height: number): void {
    const canvas = this.context.canvas;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  setView(view: ViewUniform): void {
    this._scratch[0] = view.scaleX;
    this._scratch[1] = view.scaleY;
    this._scratch[2] = view.offsetX;
    this._scratch[3] = view.offsetY;
    this._scratch[4] = view.timeSec;
    this._scratch[5] = view.windStrength;

    this.queue.writeBuffer(this._viewBuffer, 0, this._scratch);
  }

  viewBindGroupLayout(): GPUBindGroupLayout {
    return this._viewBindGroupLayout;
  }

  viewBindGroup(): GPUBindGroup {
    return this._viewBindGroup;
  }

  beginPass(
    encoder: GPUCommandEncoder,
    clear: [number, number, number, number],
  ): GPURenderPassEncoder {
    const view = this.context.getCurrentTexture().createView();
    return encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: clear[0], g: clear[1], b: clear[2], a: clear[3] },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
  }
}
