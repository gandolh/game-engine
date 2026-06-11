// TODO(wave-1a): implement GpuContext body

export interface ViewUniform {
  // maps world px -> clip space; updated each beginFrame from camera
  scaleX: number; scaleY: number; offsetX: number; offsetY: number;
}

export class GpuContext {
  // Filled by Wave 1a
  readonly device!: GPUDevice;
  readonly queue!: GPUQueue;
  readonly format!: GPUTextureFormat;
  readonly context!: GPUCanvasContext;

  static async create(_canvas: HTMLCanvasElement): Promise<GpuContext> {
    throw new Error("GpuContext.create: not implemented (Wave 1a)");
  }

  /** Resize the configured canvas to (w,h) device px if changed. */
  resize(_width: number, _height: number): void {
    throw new Error("GpuContext.resize: not implemented (Wave 1a)");
  }

  /** Upload the per-frame view transform (world->clip). */
  setView(_view: ViewUniform): void {
    throw new Error("GpuContext.setView: not implemented (Wave 1a)");
  }

  viewBindGroupLayout(): GPUBindGroupLayout {
    throw new Error("GpuContext.viewBindGroupLayout: not implemented (Wave 1a)");
  }

  viewBindGroup(): GPUBindGroup {
    throw new Error("GpuContext.viewBindGroup: not implemented (Wave 1a)");
  }

  /** Begin a render pass that clears to clearColor (rgba 0..1). */
  beginPass(_encoder: GPUCommandEncoder, _clear: [number, number, number, number]): GPURenderPassEncoder {
    throw new Error("GpuContext.beginPass: not implemented (Wave 1a)");
  }
}
