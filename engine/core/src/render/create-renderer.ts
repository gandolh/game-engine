import type { Camera2D } from "./camera";
import type { RendererLike } from "./renderer";

export interface CreateRendererOptions {
  /**
   * Reports which backend was selected. There is only one — `"webgl2"` — but the
   * callback is kept because all four game clients log through it, and because a
   * one-line "which backend am I on?" signal in the console is worth keeping even
   * when the answer is never in doubt.
   */
  onBackend?: (backend: "webgl2") => void;
}

/**
 * Create the renderer. **WebGL2 only** — there is no backend choice and no fallback
 * ladder (decision 2026-08-18; see corpus `wiki/decisions.md`).
 *
 * The previous `backend: "auto" | "webgpu" | "canvas2d"` option is gone rather than
 * kept as an ignored no-op: an option that silently accepts `"webgpu"` and quietly
 * does something else is worse than a compile error pointing at the call site.
 *
 * Throws if a WebGL2 context cannot be created. Callers should catch it and show the
 * user something — WebGL2 has shipped in every browser since ~2017, so the realistic
 * cause is disabled hardware acceleration or a VM without a usable GPU, not a missing
 * browser feature.
 *
 * Async purely for call-site compatibility: every client already `await`s this, and
 * WebGL2 (unlike WebGPU) has no adapter/device negotiation to wait on.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
  opts?: CreateRendererOptions,
): Promise<RendererLike> {
  // DYNAMIC import, deliberately. The WebGL2 passes `import … from "*.glsl?raw"`,
  // which only a bundler can resolve — Node/tsx throws ERR_UNKNOWN_FILE_EXTENSION on
  // `.glsl`. A static import here (or a value export from the barrel) makes every
  // Node consumer — the Farm/Citadel servers, run-sim, world-preview, citadel-sim,
  // hollow-sim — crash on startup even though none of them ever renders. The WebGPU
  // backend was loaded this same way for this same reason; keep it that way.
  const { WebGl2Renderer } = await import("./webgl2/renderer");
  const renderer = WebGl2Renderer.create(canvas, camera);
  opts?.onBackend?.("webgl2");
  return renderer;
}
