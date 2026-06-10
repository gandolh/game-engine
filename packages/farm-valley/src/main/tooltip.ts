import { Camera2D, EDG } from "@engine/core";
import { TILE } from "./config";
import { mousePos } from "./camera";
import type { SnapshotSprite } from "@farm/sim-core/snapshot";

export function createTooltip(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "position: absolute",
    "padding: 3px 8px",
    "font: 11px/1.4 ui-monospace, monospace",
    `color: ${EDG.cream}`,
    "background: rgba(24, 20, 37, 0.88)", // EDG.black
    "border: 1px solid rgba(228, 166, 114, 0.6)", // EDG.tan
    "border-radius: 4px",
    "pointer-events: none",
    "z-index: 180",
    "display: none",
    "white-space: nowrap",
  ].join(";");
  parent.appendChild(el);
  return el;
}

export function updateTooltip(
  tooltip: HTMLElement,
  canvas: HTMLCanvasElement,
  sprites: SnapshotSprite[],
  camera: Camera2D | null,
): void {
  if (camera === null || mousePos.x < 0) {
    tooltip.style.display = "none";
    return;
  }

  // CSS pixel mouse → world pixels; cap dpr at 2 to match Canvas2dRenderer.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
  const wx = mousePos.x * scaleX + (camera.centerX - camera.worldUnitsX / 2);
  const wy = mousePos.y * scaleY + (camera.centerY - camera.worldUnitsY / 2);

  const HALF_TILE = TILE / 2;
  let bestLabel: string | null = null;
  let bestDescription: string | null = null;
  let bestDist = HALF_TILE * HALF_TILE;

  for (const s of sprites) {
    if (!s.label) continue;
    const dx = s.x - wx;
    const dy = s.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestLabel = s.label;
      bestDescription = s.description ?? null;
    }
  }

  if (bestLabel !== null) {
    tooltip.replaceChildren();
    const title = document.createElement("div");
    title.textContent = bestLabel;
    title.style.fontWeight = "700";
    tooltip.appendChild(title);
    if (bestDescription !== null) {
      const desc = document.createElement("div");
      desc.textContent = bestDescription;
      desc.style.fontWeight = "400";
      desc.style.opacity = "0.85";
      desc.style.marginTop = "2px";
      desc.style.maxWidth = "220px";
      desc.style.whiteSpace = "normal";
      tooltip.appendChild(desc);
    }
    tooltip.style.display = "block";
    tooltip.style.left = `${mousePos.x + 12}px`;
    tooltip.style.top = `${mousePos.y - 20}px`;
  } else {
    tooltip.style.display = "none";
  }
}
