import { EDG } from "../render";
import type { ProfileReport } from "./profiler";

export interface OverlayStats {
  fps: number;
  tick: number;
  alpha: number;
  entityCount: number;
}

/** Frame statistics the shared profile shows (corpus brief 05). `gpuMs` is `null` when the browser has no
 *  GPU timer. */
export interface OverlayFrameStats {
  p50: number;
  p95: number;
  p99: number;
  over16_7: number;
  over33_3: number;
  gpuMs: number | null;
}

export interface OverlayExport {
  fps: number;
  frameMs: number;
  tick: number;
  entityCount: number;
  worker: ProfileReport | null;
  frame: ProfileReport | null;
}

/**
 * Which screen corner the overlay is pinned to. Generic (no game import) — added because a
 * consuming game's own in-canvas HUD may already occupy the top-left corner Farm Valley uses by
 * default (e.g. Citadel's resource/siege HUD both anchor at (8,8) too). Defaults to "top-left" so
 * every existing caller (Farm) keeps its exact pixel position.
 */
export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OverlayOptions {
  corner?: OverlayCorner;
}

const CORNER_CSS: Record<OverlayCorner, string> = {
  "top-left": "top: 8px;left: 8px",
  "top-right": "top: 8px;right: 8px",
  "bottom-left": "bottom: 8px;left: 8px",
  "bottom-right": "bottom: 8px;right: 8px",
};

export class DebugOverlay {
  private readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private lastWallMs = performance.now();
  private frameCount = 0;
  private fps = 0;
  private accumulatedMs = 0;
  private frameMs = 0;

  private workerReport: ProfileReport | null = null;
  private frameReport: ProfileReport | null = null;
  private lastTick = 0;
  private lastEntityCount = 0;
  private frameStats: OverlayFrameStats | null = null;

  constructor(parent: HTMLElement, options?: OverlayOptions) {
    const corner = options?.corner ?? "top-left";
    const el = document.createElement("div");
    el.style.cssText = [
      "position: absolute",
      CORNER_CSS[corner],
      "padding: 6px 8px",
      "font: 12px/1.4 ui-monospace, monospace",
      `color: ${EDG.silver}`,
      "background: rgba(24, 20, 37, 0.55)",
      "border: 1px solid rgba(255, 255, 255, 0.08)",
      "border-radius: 4px",
      "pointer-events: none",
      "white-space: pre",
    ].join(";");
    const text = document.createElement("div");
    el.appendChild(text);
    parent.appendChild(el);
    this.element = el;
    this.text = text;
  }

  /**
   * Redraws the readout. A game without a sim tick (or an alpha, or an entity count) leaves the field out
   * and its line is not shown. Call once per frame drawn: the fps and ms lines time the calls.
   */
  update(stats: Partial<Omit<OverlayStats, "fps">> = {}): void {
    if (stats.tick !== undefined) this.lastTick = stats.tick;
    if (stats.entityCount !== undefined) this.lastEntityCount = stats.entityCount;
    const now = performance.now();
    const dt = now - this.lastWallMs;
    this.lastWallMs = now;
    this.accumulatedMs += dt;
    this.frameCount += 1;

    this.frameMs = this.frameMs === 0 ? dt : this.frameMs * 0.9 + dt * 0.1;
    if (this.accumulatedMs >= 500) {
      this.fps = (this.frameCount * 1000) / this.accumulatedMs;
      this.frameCount = 0;
      this.accumulatedMs = 0;
    }
    let text = `fps   ${this.fps.toFixed(1)}\n` + `ms    ${this.frameMs.toFixed(1)}`;
    if (stats.tick !== undefined) text += `\ntick  ${stats.tick}`;
    if (stats.alpha !== undefined) text += `\nalpha ${stats.alpha.toFixed(3)}`;
    if (stats.entityCount !== undefined) text += `\nents  ${stats.entityCount}`;

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
    const fs = this.frameStats;
    if (fs !== null) {
      const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
      text += "\n— frame interval —";
      text += `\np50/95/99 ${fs.p50.toFixed(1)}/${fs.p95.toFixed(1)}/${fs.p99.toFixed(1)}ms`;
      text += `\n>16.7 ${pct(fs.over16_7)}  >33.3 ${pct(fs.over33_3)}`;
      text += `\ngpu   ${fs.gpuMs === null ? "n/a" : `${fs.gpuMs.toFixed(2)}ms`}`;
    }
    this.text.textContent = text;
  }

  /** The frame-interval block (corpus brief 05). `null` hides it. */
  setFrameStats(stats: OverlayFrameStats | null): void {
    this.frameStats = stats;
  }

  /**
   * Adds a button under the readout, the one part of the overlay that takes the pointer (the shared
   * profile's export button, corpus brief 05). Returns the button so the caller can relabel it.
   */
  addButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = [
      "display: block",
      "margin-top: 6px",
      "padding: 4px 8px",
      "font: 12px/1 ui-monospace, monospace",
      `color: ${EDG.white}`,
      "background: rgba(24, 20, 37, 0.78)",
      `border: 1px solid ${EDG.silver}`,
      "border-radius: 4px",
      "cursor: pointer",
      "pointer-events: auto",
    ].join(";");
    btn.addEventListener("click", onClick);
    this.element.appendChild(btn);
    return btn;
  }

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

  /** Show or hide the overlay element without destroying it (keeps
   *  accumulating fps/frame stats while hidden, so re-showing is instant).
   *  Generic — a consuming game may want a hotkey to toggle the HUD. */
  setVisible(visible: boolean): void {
    this.element.style.display = visible ? "" : "none";
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
