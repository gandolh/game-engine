export interface GpuContext {
  readonly device: GPUDevice;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
}

export interface GpuInitOptions {
  canvas: HTMLCanvasElement;
  powerPreference?: GPUPowerPreference;
}

export async function initWebGpu(opts: GpuInitOptions): Promise<GpuContext> {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU not supported in this browser");
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: opts.powerPreference ?? "high-performance",
  });
  if (!adapter) throw new Error("No GPU adapter available");

  const device = await adapter.requestDevice();
  const context = opts.canvas.getContext("webgpu");
  if (!context) throw new Error("Failed to acquire webgpu canvas context");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  return { device, canvas: opts.canvas, context, format };
}

export function resizeToDisplay(ctx: GpuContext): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const desiredW = Math.max(1, Math.floor(ctx.canvas.clientWidth * dpr));
  const desiredH = Math.max(1, Math.floor(ctx.canvas.clientHeight * dpr));
  if (ctx.canvas.width !== desiredW || ctx.canvas.height !== desiredH) {
    ctx.canvas.width = desiredW;
    ctx.canvas.height = desiredH;
    return true;
  }
  return false;
}
