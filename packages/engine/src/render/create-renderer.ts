import type { Camera2D } from "./camera";
import type { RendererLike } from "./renderer";
import { Canvas2dRenderer } from "./canvas2d/renderer";

export interface CreateRendererOptions {
  /** Force a backend (tests/debug). Default: auto = webgpu if available else canvas2d. */
  backend?: "auto" | "webgpu" | "canvas2d";
  /** Called once the backend is chosen, for logging/telemetry. */
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

  // "webgpu" or "auto": try WebGPU via a dynamic import so jsdom/tests never load
  // WebGPU code eagerly. On any failure, "auto" falls back to Canvas2D; "webgpu"
  // re-throws so the caller knows the GPU path was requested but unavailable.
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
      // auto: fall through to canvas2d
    }
  }

  onBackend?.("canvas2d");
  return new Canvas2dRenderer(canvas, camera);
}
