/**
 * Pip's-farm highlight at full zoom-out (corpus/todos/2026-07-15-pip-farm-zoom-out-highlight.md).
 *
 * At default/close zoom, Pip's home plot is easy to find (the player just walks there). The
 * problem is only at full zoom-out, where all 21 farms — Pip's plus the 20 AI farmers' — read as
 * identical tilled rectangles. This draws a small screen-space pin ABOVE Pip's farm ("farm-pip",
 * a stable `FixedRegionId` — see world/regions.ts) once the camera is zoomed out past a threshold,
 * so the player can spot their own farm at a glance without it obscuring the plot underneath.
 *
 * Screen-space (drawn via `UISurface.rect`/`drawText`, the same raw-quad seam
 * `hotbar.ts`/`inventory.ts` use for their icon passes) rather than a world-space sprite, so the
 * marker stays a constant, readable size on screen regardless of zoom. Purely cosmetic client-side
 * render state — reads static region geometry (generated once from the fixed `WORLD_GEN_SEED`,
 * identical on client and server) and the live camera/zoom; touches no sim state.
 */
import { EDG } from "@engine/core";
import type { Camera2D } from "@engine/core";
import { drawText, measureText, type UISurface } from "@engine/ui";
import { getRegion } from "@farm/sim-core/world/regions";
import { TILE } from "./config";
import { worldToCanvasCss } from "./screen-to-tile";

/**
 * Below this zoom, the camera shows the whole (or nearly the whole) map — `Camera2D.worldUnitsX`
 * is `baseUnitsX / zoom`, so zoom=1 already fits the full world width on screen. The small margin
 * above 1.0 covers "mostly zoomed out" without lighting up at `DEFAULT_ZOOM` (3, see ./config),
 * which is the normal play view.
 */
export const PIP_FARM_MARKER_ZOOM_THRESHOLD = 1.2;

/** Whether the Pip's-farm marker should be drawn at the given camera zoom. */
export function shouldShowPipFarmMarker(zoom: number): boolean {
  return zoom <= PIP_FARM_MARKER_ZOOM_THRESHOLD;
}

/**
 * World-space anchor for the marker: horizontally centred over Pip's farm plot, at its NORTH edge
 * (`bounds.minY`) — so the pin sits above the crop tiles/farmhouse instead of covering them. Pure
 * function of static region geometry (no live entity lookup needed — "farm-pip" never moves).
 */
export function pipFarmWorldAnchor(): { wx: number; wy: number } {
  const region = getRegion("farm-pip");
  const { minX, maxX, minY } = region.bounds;
  return {
    wx: ((minX + maxX + 1) / 2) * TILE,
    wy: minY * TILE,
  };
}

const MARKER_LABEL = "PIP'S FARM";
const DIAMOND_HALF = 5;
const DIAMOND_OUTLINE_HALF = DIAMOND_HALF + 1;
const POLE_HEIGHT = 10;
const POLE_WIDTH = 2;
const LABEL_GAP = 4;
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 3;
const BOB_AMPLITUDE = 2;
const BOB_PERIOD_MS = 300;
/** Off-screen slack (CSS px) before the marker is skipped entirely — a panned-away camera should
 * not keep submitting draw calls for a point nowhere near the viewport. */
const OFFSCREEN_MARGIN = 48;

/** One filled diamond of `color`, `half`*2+1 px tall, centred at `(cx, cyCenter)`. Built from 1px
 * rows (the UI surface only draws axis-aligned rects) — see `pip-farm-marker.test.ts` for the row
 * width math this is based on. */
function drawDiamond(
  surface: UISurface,
  cx: number,
  cyCenter: number,
  half: number,
  color: string,
  alpha: number,
): void {
  for (let i = -half; i <= half; i += 1) {
    const w = (half - Math.abs(i)) * 2 + 2;
    surface.rect(cx - w / 2, cyCenter + i, w, 1, color, alpha);
  }
}

/**
 * Draw the Pip's-farm marker for this frame, if `zoom` is past the threshold. A no-op when zoomed
 * in past the threshold, or when the (static) farm anchor is far outside the current viewport.
 * `nowMs` drives a small bob, matching the existing followed-farmer indicator in render-loop.ts.
 */
export function drawPipFarmMarker(
  surface: UISurface,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  zoom: number,
  nowMs: number,
): void {
  if (!shouldShowPipFarmMarker(zoom)) return;

  const anchor = pipFarmWorldAnchor();
  const screen = worldToCanvasCss(camera, canvas, anchor.wx, anchor.wy);

  if (
    screen.x < -OFFSCREEN_MARGIN ||
    screen.x > canvas.clientWidth + OFFSCREEN_MARGIN ||
    screen.y < -OFFSCREEN_MARGIN ||
    screen.y > canvas.clientHeight + OFFSCREEN_MARGIN
  ) {
    return;
  }

  const bob = Math.sin(nowMs / BOB_PERIOD_MS) * BOB_AMPLITUDE;
  const poleBottomY = screen.y + bob;
  const poleTopY = poleBottomY - POLE_HEIGHT;
  const diamondCenterY = poleTopY - DIAMOND_HALF;

  surface.rect(screen.x - POLE_WIDTH / 2, poleTopY, POLE_WIDTH, POLE_HEIGHT, EDG.black, 1);

  // Beacon pulse on the fill only — outline + pole + label stay fully opaque for readability.
  const pulseAlpha = 0.75 + 0.25 * Math.sin(nowMs / (BOB_PERIOD_MS * 1.5));
  drawDiamond(surface, screen.x, diamondCenterY, DIAMOND_OUTLINE_HALF, EDG.black, 1);
  drawDiamond(surface, screen.x, diamondCenterY, DIAMOND_HALF, EDG.gold, pulseAlpha);

  const labelWidth = measureText(MARKER_LABEL);
  const labelY = diamondCenterY - DIAMOND_HALF - LABEL_GAP - 8 - LABEL_PAD_Y * 2;
  const labelX = screen.x - labelWidth / 2;
  surface.rect(
    labelX - LABEL_PAD_X,
    labelY,
    labelWidth + LABEL_PAD_X * 2,
    8 + LABEL_PAD_Y * 2,
    EDG.ink,
    0.85,
  );
  drawText(surface, MARKER_LABEL, labelX, labelY + LABEL_PAD_Y, { color: EDG.cream });
}
