import { EDG } from "../render";

export interface OverlayStats {
  fps: number;
  tick: number;
  alpha: number;
  entityCount: number;
}

export class DebugOverlay {
  private readonly element: HTMLElement;
  private lastWallMs = performance.now();
  private frameCount = 0;
  private fps = 0;
  private accumulatedMs = 0;

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
    const now = performance.now();
    const dt = now - this.lastWallMs;
    this.lastWallMs = now;
    this.accumulatedMs += dt;
    this.frameCount += 1;
    if (this.accumulatedMs >= 500) {
      this.fps = (this.frameCount * 1000) / this.accumulatedMs;
      this.frameCount = 0;
      this.accumulatedMs = 0;
    }
    this.element.textContent =
      `fps   ${this.fps.toFixed(1)}\n` +
      `tick  ${stats.tick}\n` +
      `alpha ${stats.alpha.toFixed(3)}\n` +
      `ents  ${stats.entityCount}`;
  }

  destroy(): void {
    this.element.remove();
  }
}
