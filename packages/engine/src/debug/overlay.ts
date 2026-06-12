import { EDG } from "../render";
import type { ProfileReport } from "./profiler";

export interface OverlayStats {
  fps: number;
  tick: number;
  alpha: number;
  entityCount: number;
}

/** Snapshot of everything the overlay currently knows — for the dev-only profile export. */
export interface OverlayExport {
  fps: number;
  frameMs: number;
  tick: number;
  entityCount: number;
  worker: ProfileReport | null;
  frame: ProfileReport | null;
}

export class DebugOverlay {
  private readonly element: HTMLElement;
  private lastWallMs = performance.now();
  private frameCount = 0;
  private fps = 0;
  private accumulatedMs = 0;
  private frameMs = 0; // EMA of wall-clock frame time → always-on ms readout

  private workerReport: ProfileReport | null = null;
  private frameReport: ProfileReport | null = null;
  private lastTick = 0;
  private lastEntityCount = 0;

  constructor(parent: HTMLElement) {
    const el = document.createElement("div");
    el.style.cssText = [
      "position: absolute",
      "top: 8px",
      "left: 8px",
      "padding: 6px 8px",
      "font: 12px/1.4 ui-monospace, monospace",
      `color: ${EDG.silver}`,
      "background: rgba(24, 20, 37, 0.55)", // EDG.black
      "border: 1px solid rgba(255, 255, 255, 0.08)", // EDG.white
      "border-radius: 4px",
      "pointer-events: none",
      "white-space: pre",
    ].join(";");
    parent.appendChild(el);
    this.element = el;
  }

  update(stats: Omit<OverlayStats, "fps">): void {
    this.lastTick = stats.tick;
    this.lastEntityCount = stats.entityCount;
    const now = performance.now();
    const dt = now - this.lastWallMs;
    this.lastWallMs = now;
    this.accumulatedMs += dt;
    this.frameCount += 1;
    // EMA so the ms readout is responsive but not jittery (seed on first frame).
    this.frameMs = this.frameMs === 0 ? dt : this.frameMs * 0.9 + dt * 0.1;
    if (this.accumulatedMs >= 500) {
      this.fps = (this.frameCount * 1000) / this.accumulatedMs;
      this.frameCount = 0;
      this.accumulatedMs = 0;
    }
    let text =
      `fps   ${this.fps.toFixed(1)}\n` +
      `ms    ${this.frameMs.toFixed(1)}\n` +
      `tick  ${stats.tick}\n` +
      `alpha ${stats.alpha.toFixed(3)}\n` +
      `ents  ${stats.entityCount}`;

    const fmt = (label: string, report: ProfileReport | null, key: string, unit: "ms" | "kb"): string => {
      const s = report?.[key];
      if (s === undefined) return "";
      return unit === "kb"
        ? `\n${label} ${(s.mean / 1024).toFixed(1)}KB`
        : `\n${label} ${s.mean.toFixed(2)}/${s.p95.toFixed(2)}ms`;
    };
    if (this.workerReport !== null || this.frameReport !== null) {
      text += "\n— mean/p95 —";
      text += fmt("tick ", this.workerReport, "tick", "ms");
      text += fmt("snap ", this.workerReport, "snapshot.build", "ms");
      text += fmt("snapKB", this.workerReport, "snapshot.bytes", "kb");
      text += fmt("frame", this.frameReport, "frame", "ms");
      text += fmt("interp", this.frameReport, "interp", "ms");
    }
    this.element.textContent = text;
  }

  /** Current fps/frame-time + the latest worker & frame profiler reports.
   *  Dev-only; reads display timing, never sim state → zero determinism impact. */
  exportReport(): OverlayExport {
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      tick: this.lastTick,
      entityCount: this.lastEntityCount,
      worker: this.workerReport,
      frame: this.frameReport,
    };
  }

  setWorkerReport(report: ProfileReport): void {
    this.workerReport = report;
  }

  setFrameReport(report: ProfileReport): void {
    this.frameReport = report;
  }

  destroy(): void {
    this.element.remove();
  }
}
