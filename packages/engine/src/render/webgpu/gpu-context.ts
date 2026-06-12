/// <reference types="@webgpu/types" />
/**
 * GpuContext — Wave 1a
 *
 * Owns:
 *  - WebGPU adapter/device bootstrap
 *  - Canvas configuration (format, alphaMode)
 *  - Per-frame view uniform buffer (world → clip space)
 *  - Render-pass creation helper
 *
 * ViewUniform shape (collapsed clip-space):
 *   The caller (Wave 2 orchestrator) computes these from camera + canvas dims:
 *     sx = canvasW / camera.worldUnitsX;
 *     sy = canvasH / camera.worldUnitsY;
 *     left = camera.centerX - camera.worldUnitsX / 2;
 *     top  = camera.centerY - camera.worldUnitsY / 2;
 *     ox = pixelSnap ? Math.round(-left * sx) : -left * sx;
 *     oy = pixelSnap ? Math.round(-top  * sy) : -top  * sy;
 *     // pixel → clip:  clipX = px/W*2-1,  clipY = 1-py/H*2
 *     scaleX  =  sx * 2 / canvasW          // world-px → clip X scale
 *     scaleY  = -sy * 2 / canvasH          // world-px → clip Y scale (Y flip)
 *     offsetX =  ox * 2 / canvasW - 1      // world origin in clip X
 *     offsetY =  1 - oy * 2 / canvasH      // world origin in clip Y (flipped)
 *   Shader computes: clipPos.x = worldX * scaleX + offsetX
 *                    clipPos.y = worldY * scaleY + offsetY
 *
 * This file is only reached via the dynamic-import factory branch — browser globals
 * and WebGPU types are safe here.
 */

export interface ViewUniform {
  /** See file header for the derivation from camera + canvas dims. */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Wall-clock time in seconds, for vertex-shader animation (e.g. foliage wind sway). */
  timeSec: number;
  /**
   * Global wind-strength multiplier applied to all per-instance sway amplitudes in the vertex
   * shader. 1.0 = full amp (calm breeze); 0.0 = no sway (all rigid). Allows whole-map gust
   * waves by animating this value from the render loop. Default 1.0 if not set.
   */
  windStrength: number;
}

/**
 * Size of the view UBO in bytes: 5 × f32 payload + 3 × f32 padding = 8 × f32 = 32 bytes.
 * Padded to the next 16-byte boundary so the struct can be safely extended later and
 * meets WebGPU minUniformBufferOffsetAlignment requirements.
 */
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

    // Uniform buffer: 16 bytes (vec4<f32>: scaleX, scaleY, offsetX, offsetY).
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

  /**
   * Bootstrap a GpuContext from an HTMLCanvasElement.
   * Throws on any failure (no navigator.gpu, no adapter, configure error).
   * The factory (createRenderer) catches this and falls back to Canvas2D.
   */
  static async create(canvas: HTMLCanvasElement): Promise<GpuContext> {
    if (!navigator.gpu) {
      throw new Error("webgpu: navigator.gpu unavailable");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("webgpu: no GPU adapter found");
    }

    const device = await adapter.requestDevice();

    // Log device loss so browser console shows when the GPU context is reset.
    device.lost.then((info: GPUDeviceLostInfo) => {
      console.warn(`webgpu: device lost — reason: ${info.reason}, message: ${info.message}`);
    }).catch(() => {
      // Promise rejection is not expected here; swallow to avoid unhandled-rejection noise.
    });

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

  /**
   * Resize the configured canvas to (width, height) device pixels if either
   * dimension has changed. In WebGPU v1, reconfiguring the canvas context on
   * resize is NOT required — setting canvas.width/height is sufficient for the
   * swap chain. (Depth/MSAA targets are not used in Wave 1.)
   */
  resize(width: number, height: number): void {
    const canvas = this.context.canvas;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /**
   * Upload the per-frame world→clip view transform.
   * Call once per frame, before beginning the render pass.
   * See the file header for how the caller (Wave 2) derives the four values.
   */
  setView(view: ViewUniform): void {
    this._scratch[0] = view.scaleX;
    this._scratch[1] = view.scaleY;
    this._scratch[2] = view.offsetX;
    this._scratch[3] = view.offsetY;
    this._scratch[4] = view.timeSec;
    this._scratch[5] = view.windStrength;
    // [6], [7] are padding — leave as 0 (Float32Array initialises to zero).
    this.queue.writeBuffer(this._viewBuffer, 0, this._scratch);
  }

  /** The bind group layout for the view uniform (binding 0, VERTEX stage). */
  viewBindGroupLayout(): GPUBindGroupLayout {
    return this._viewBindGroupLayout;
  }

  /**
   * The bind group holding the view uniform buffer.
   * Stable for the lifetime of GpuContext (buffer is never recreated).
   */
  viewBindGroup(): GPUBindGroup {
    return this._viewBindGroup;
  }

  /**
   * Begin a render pass that clears the swap-chain texture to `clear` (rgba, each 0–1).
   * Returns the open GPURenderPassEncoder; caller must call pass.end() before submitting.
   */
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
