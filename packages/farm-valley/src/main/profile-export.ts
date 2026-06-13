import { EDG } from "@engine/core";
import type { Camera2D, DebugOverlay, ProfileReport } from "@engine/core";

export interface ProfileExportDeps {
  parent: HTMLElement;
  overlay: DebugOverlay;
  camera: Camera2D;
  canvas: HTMLCanvasElement;

  frameReport: () => ProfileReport;
  context: { seed: number; maxDays: number; ticksPerDay: number };
}

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
    "background: rgba(24, 20, 37, 0.78)", 
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
