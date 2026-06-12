import { EDG } from "@engine/core";
import type { Camera2D, DebugOverlay, ProfileReport } from "@engine/core";

// Dev-only profile exporter (gated by `?profile`). Bundles the overlay readout
// (fps / frame-ms) + the live frame-profiler report + render context + a GPU
// identity probe into one JSON file the user can hand back for the brief-84
// FPS-regression analysis. Wall-clock only; never reads sim state.

export interface ProfileExportDeps {
  parent: HTMLElement;
  overlay: DebugOverlay;
  camera: Camera2D;
  canvas: HTMLCanvasElement;
  /** Live frame-profiler report (fresher than the overlay's ~60-frame cache). */
  frameReport: () => ProfileReport;
  context: { seed: number; maxDays: number; ticksPerDay: number };
}

/** Probe the GPU identity via WebGL's debug-renderer-info. The string distinguishes
 *  a real GPU from software raster (e.g. "SwiftShader" / "llvmpipe"), which is the
 *  single most important piece of context for interpreting the fps numbers. */
function probeGpu(): { vendor: string; renderer: string } | null {
  try {
    const c = document.createElement("canvas");
    const gl =
      (c.getContext("webgl") as WebGLRenderingContext | null) ??
      (c.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl === null) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext === null) return null;
    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
    };
  } catch {
    return null;
  }
}

function collect(deps: ProfileExportDeps): unknown {
  const { overlay, camera, canvas, frameReport, context } = deps;
  const ov = overlay.exportReport();
  return {
    schema: "farm-valley-profile/1",
    // Browser-side wall clock — diagnostic label only, never feeds the sim.
    collectedAt: new Date().toISOString(),
    backend: "webgpu",
    run: context,
    display: {
      fps: Number(ov.fps.toFixed(2)),
      frameMs: Number(ov.frameMs.toFixed(2)),
      tick: ov.tick,
      entityCount: ov.entityCount,
    },
    camera: {
      zoom: camera.zoom,
      worldUnitsX: camera.worldUnitsX,
      worldUnitsY: camera.worldUnitsY,
      centerX: Math.round(camera.centerX),
      centerY: Math.round(camera.centerY),
    },
    canvas: {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    },
    gpu: probeGpu(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    // The headline number: `frame` JS mean/p95 ≪ 16.6ms while fps is low ⇒ GPU-raster bound.
    frameProfile: frameReport(),
    workerProfile: ov.worker,
  };
}

function download(data: unknown, seed: number): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `farm-valley-profile-seed-${seed.toString(16)}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Mount a dev-only "Export profile" button (bottom-left) and expose
 *  window.__exportProfile(). Returns a teardown fn. */
export function setupProfileExport(deps: ProfileExportDeps): () => void {
  (window as unknown as { __exportProfile?: () => unknown }).__exportProfile = () => {
    const data = collect(deps);
    download(data, deps.context.seed);
    return data;
  };

  const btn = document.createElement("button");
  btn.textContent = "⤓ Export profile";
  btn.style.cssText = [
    "position: fixed",
    "bottom: 8px",
    "left: 8px",
    "z-index: 50",
    "padding: 6px 10px",
    "font: 12px/1 ui-monospace, monospace",
    `color: ${EDG.white}`,
    "background: rgba(24, 20, 37, 0.78)", // EDG.black, translucent
    `border: 1px solid ${EDG.silver}`,
    "border-radius: 4px",
    "cursor: pointer",
  ].join(";");

  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  btn.addEventListener("click", () => {
    download(collect(deps), deps.context.seed);
    btn.textContent = "✓ Saved";
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      btn.textContent = "⤓ Export profile";
    }, 1200);
  });

  deps.parent.appendChild(btn);

  return () => {
    if (flashTimer !== null) clearTimeout(flashTimer);
    btn.remove();
    delete (window as unknown as { __exportProfile?: () => unknown }).__exportProfile;
  };
}
