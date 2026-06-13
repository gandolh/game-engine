import type { Camera2D } from "./camera";
import type { RendererLike } from "./renderer";
import { Canvas2dRenderer } from "./canvas2d/renderer";

export interface CreateRendererOptions {

  backend?: "auto" | "webgpu" | "canvas2d";

  onBackend?: (backend: "webgpu" | "canvas2d") => void;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
  opts?: CreateRendererOptions,
): Promise<RendererLike> {
  const backend = opts?.backend ?? "auto";
  const onBackend = opts?.onBackend;

  if (backend === "canvas2d") {
    onBackend?.("canvas2d");
    return new Canvas2dRenderer(canvas, camera);
  }

  if (backend === "webgpu" || (backend === "auto" && typeof navigator !== "undefined" && navigator.gpu)) {
    try {
      const { tryCreateWebGpuRenderer } = await import("./webgpu/renderer");
      const renderer = await tryCreateWebGpuRenderer(canvas, camera);
      onBackend?.("webgpu");
      return renderer;
    } catch (err) {
      if (backend === "webgpu") {
        throw err;
      }

    }
  }

  onBackend?.("canvas2d");
  return new Canvas2dRenderer(canvas, camera);
}
