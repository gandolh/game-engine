/**
 * GPU device/context acquisition for the 3D render layer — thin orchestration,
 * typecheck-only (WebGPU cannot run headless in this environment, so this
 * file has no unit tests; see `buffers.ts` for the tested core). Mirrors the
 * guard sequence used by the existing 2D `GpuContext`
 * (`../../render/webgpu/gpu-context.ts`) but is deliberately a SEPARATE,
 * standalone class — the 2D and 3D renderers do not share a `ViewUniform` or
 * bind-group layout, so entangling them here would just be indirection.
 */

/** GPU device + canvas surface, ready for `SceneRenderer3D` to draw into. */
export class Device3d {
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly format: GPUTextureFormat;
  readonly context: GPUCanvasContext;
  readonly canvas: HTMLCanvasElement;

  private _lost = false;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    canvas: HTMLCanvasElement,
  ) {
    this.device = device;
    this.queue = device.queue;
    this.format = format;
    this.context = context;
    this.canvas = canvas;

    // Log + gate on device loss rather than letting subsequent GPU calls
    // throw opaquely. `SceneRenderer3D.render` checks `.lost` and skips the
    // frame instead of calling into a dead device.
    device.lost
      .then((info) => {
        this._lost = true;
        console.error(`[render3d] WebGPU device lost (${info.reason}): ${info.message}`);
      })
      .catch(() => {
        // `GPUDeviceLostInfo` promises never reject per spec, but guard
        // anyway rather than leaving an unhandled rejection.
        this._lost = true;
      });
  }

  /** Whether the underlying `GPUDevice` has been lost (see `device.lost`
   *  above). Once true, further draws are silently skipped. */
  get lost(): boolean {
    return this._lost;
  }

  static async create(canvas: HTMLCanvasElement): Promise<Device3d> {
    if (!navigator.gpu) {
      throw new Error("render3d: navigator.gpu unavailable (WebGPU not supported in this browser)");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("render3d: no GPU adapter found");
    }

    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error('render3d: canvas.getContext("webgpu") returned null');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });

    return new Device3d(device, context, format, canvas);
  }
}

/** Convenience wrapper around `Device3d.create` — the public entry point
 *  documented in the 08b brief. */
export async function createDevice3d(canvas: HTMLCanvasElement): Promise<Device3d> {
  return Device3d.create(canvas);
}
