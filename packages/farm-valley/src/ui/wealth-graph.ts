/**
 * WealthGraphPanel — a collapsible multi-line wealth-over-time chart.
 *
 * Draws one polyline per farmer (X = day, Y = gold) on a <canvas> element,
 * color-coded by personality via `personalityColor()`. Crossing events (where
 * two farmers swap gold ordering between consecutive days) are marked with a
 * small circle at the interpolated intersection point.
 *
 * The panel mounts in the right-column flex container (brief 25). It has a
 * collapse toggle so it doesn't crowd the observer / feed / relationship-matrix
 * panels that also live there — the graph is glanceable context, not the main view.
 *
 * Brief 39. Render-only: no sim state, no determinism surface.
 */

import { EDG } from "@engine/core/render";
import { createEl, applyStyles } from "./dom";
import { personalityColor } from "./colors";
import type { SnapshotWealthSeries } from "../worker/snapshot";

// ---- Pure layout helpers (exported for tests) ------------------------------

/** One {x,y} coordinate in canvas pixel space. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** Layout bounds for the chart's drawable area (inside padding). */
export interface ChartBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Compute canvas pixel coordinates for each farmer's data points.
 *
 * Maps:
 *   day 0      → x = bounds.left
 *   maxDay     → x = bounds.right
 *   gold 0     → y = bounds.bottom
 *   maxGold    → y = bounds.top
 *
 * Returns an array in the same order as `series`. If a farmer has no rows, their
 * entry is an empty array. Returns [] for all if `series` is empty.
 *
 * @param series   Per-farmer wealth rows (ascending day order assumed).
 * @param bounds   Pixel bounds of the drawable area.
 */
export function computePoints(
  series: SnapshotWealthSeries[],
  bounds: ChartBounds,
): ChartPoint[][] {
  if (series.length === 0) return [];

  // Compute data domain.
  let maxDay = 1;
  let maxGold = 1;
  for (const s of series) {
    for (const row of s.rows) {
      if (row.day > maxDay) maxDay = row.day;
      if (row.gold > maxGold) maxGold = row.gold;
    }
  }

  const rangeX = bounds.right - bounds.left;
  const rangeY = bounds.bottom - bounds.top;

  return series.map((s) =>
    s.rows.map((row) => ({
      x: bounds.left + (row.day / maxDay) * rangeX,
      y: bounds.bottom - (row.gold / maxGold) * rangeY,
    })),
  );
}

/** Describes a crossing between two farmers between consecutive days. */
export interface WealthCrossing {
  /** The day number of the EARLIER of the two rows forming the crossing. */
  day: number;
  /** Farmer id of the first participant. */
  aId: number;
  /** Farmer id of the second participant. */
  bId: number;
  /**
   * The interpolated x-coordinate (in data space: day fraction) where the
   * crossing occurs. In [day, day+1].
   */
  crossX: number;
  /**
   * The gold value at the crossing (same for both farmers by definition of
   * a crossing). In data gold units (not canvas pixels).
   */
  crossGold: number;
}

/**
 * Detect all pairwise crossings in the wealth series.
 *
 * A crossing is defined as: between consecutive days D and D+1, farmer A's
 * gold was higher (or equal) than farmer B's at day D, but lower (or equal)
 * at day D+1, AND the relative ordering actually SWAPPED (strict crossing —
 * equal-to-equal is not a crossing). The interpolated crossing point is
 * returned in data space.
 *
 * Runs in O(farmerCount² × maxDays) — fine for 4 farmers × 100 days = 400 ops.
 *
 * @param series  Per-farmer wealth rows (each sorted ascending by day).
 */
export function detectCrossings(series: SnapshotWealthSeries[]): WealthCrossing[] {
  const crossings: WealthCrossing[] = [];
  const n = series.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = series[i]!;
      const b = series[j]!;
      // Build day-indexed maps for fast lookup.
      const aByDay = new Map<number, number>();
      const bByDay = new Map<number, number>();
      for (const row of a.rows) aByDay.set(row.day, row.gold);
      for (const row of b.rows) bByDay.set(row.day, row.gold);

      // Collect the union of days both farmers have recorded.
      const days = [...new Set([...aByDay.keys(), ...bByDay.keys()])].sort(
        (x, y) => x - y,
      );

      for (let k = 0; k + 1 < days.length; k++) {
        const d0 = days[k]!;
        const d1 = days[k + 1]!;
        const ag0 = aByDay.get(d0);
        const bg0 = bByDay.get(d0);
        const ag1 = aByDay.get(d1);
        const bg1 = bByDay.get(d1);
        if (
          ag0 === undefined ||
          bg0 === undefined ||
          ag1 === undefined ||
          bg1 === undefined
        ) {
          continue;
        }
        // Strict sign change: a was above (or equal) b at d0, a is below b at d1
        // OR a was below b at d0, a is above (or equal) b at d1 — but both sides
        // must be a genuine swap (a≠b at both endpoints for a visual crossing).
        const diff0 = ag0 - bg0;
        const diff1 = ag1 - bg1;
        if (diff0 === 0 || diff1 === 0) continue; // touching, not crossing
        if ((diff0 > 0 && diff1 > 0) || (diff0 < 0 && diff1 < 0)) continue; // no swap

        // Interpolate: find t in [0,1] where ag0 + t*(ag1-ag0) = bg0 + t*(bg1-bg0)
        // → t = (ag0 - bg0) / ((ag0 - bg0) - (ag1 - bg1))
        const denom = diff0 - diff1;
        const t = denom === 0 ? 0.5 : diff0 / denom;
        const crossX = d0 + t * (d1 - d0);
        const crossGold = ag0 + t * (ag1 - ag0);

        crossings.push({
          day: d0,
          aId: a.farmerId,
          bId: b.farmerId,
          crossX,
          crossGold,
        });
      }
    }
  }

  return crossings;
}

// ---- Panel styles ----------------------------------------------------------

const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "11px",
  boxSizing: "border-box",
  borderTop: `1px solid ${EDG.ink}`,
  pointerEvents: "auto",
  flexShrink: "0",
};

const HEADER_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  borderBottom: `1px solid ${EDG.ink}`,
  cursor: "pointer",
  userSelect: "none",
};

const HEADER_TITLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontWeight: "bold",
  fontSize: "12px",
  color: EDG.white,
};

const TOGGLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "10px",
  color: EDG.steel,
  marginLeft: "6px",
};

const CANVAS_WRAPPER_STYLES: Partial<CSSStyleDeclaration> = {
  padding: "4px 8px 6px",
};

/** Canvas size constants (fits the 300px right column). */
const CHART_WIDTH = 276;
const CHART_HEIGHT = 120;

/** Padding inside the canvas for axes/labels. */
const PAD_LEFT = 28;
const PAD_RIGHT = 6;
const PAD_TOP = 6;
const PAD_BOTTOM = 20;

// ---- Panel class -----------------------------------------------------------

/**
 * WealthGraphPanel — collapsible wealth-over-time line chart for the right column.
 *
 * Usage:
 *   const graph = new WealthGraphPanel(rightColumn);
 *   graph.update(client.wealthSeries, client.day);  // in the render loop
 */
export class WealthGraphPanel {
  private readonly panel: HTMLElement;
  private readonly canvasWrapper: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly toggleEl: HTMLElement;

  private collapsed = true; // default: collapsed so it doesn't crowd others
  private lastDayDrawn = -1;

  constructor(parent: HTMLElement) {
    this.panel = createEl("div");
    applyStyles(this.panel, PANEL_STYLES);

    // ── Header (click to collapse/expand) ──────────────────────────────────
    const header = createEl("div");
    applyStyles(header, HEADER_STYLES);

    const title = createEl("span", { text: "Wealth over time" });
    applyStyles(title, HEADER_TITLE_STYLES);

    this.toggleEl = createEl("span", { text: "▸ expand" });
    applyStyles(this.toggleEl, TOGGLE_STYLES);

    header.appendChild(title);
    header.appendChild(this.toggleEl);
    header.addEventListener("click", () => {
      this.collapsed = !this.collapsed;
      this.applyCollapse();
    });

    // ── Canvas wrapper ──────────────────────────────────────────────────────
    this.canvasWrapper = createEl("div");
    applyStyles(this.canvasWrapper, CANVAS_WRAPPER_STYLES);

    this.canvas = document.createElement("canvas");
    this.canvas.width = CHART_WIDTH;
    this.canvas.height = CHART_HEIGHT;
    applyStyles(this.canvas, { display: "block" });

    this.canvasWrapper.appendChild(this.canvas);

    this.panel.appendChild(header);
    this.panel.appendChild(this.canvasWrapper);
    parent.appendChild(this.panel);

    this.applyCollapse();
  }

  private applyCollapse(): void {
    if (this.collapsed) {
      this.canvasWrapper.style.display = "none";
      this.toggleEl.textContent = "▸ expand";
    } else {
      this.canvasWrapper.style.display = "";
      this.toggleEl.textContent = "▾ collapse";
    }
  }

  /**
   * Update the chart. Redraws only when the in-game day changes (cheaper than
   * every animation frame). Pass the current snapshot day so the guard works.
   *
   * @param series  Per-farmer wealth time series from `client.wealthSeries`.
   * @param day     Current sim day from `client.day`.
   */
  update(series: SnapshotWealthSeries[], day: number): void {
    // Skip redraw if day unchanged (per-day redraw is sufficient and cheaper).
    if (day === this.lastDayDrawn) return;
    this.lastDayDrawn = day;

    this.draw(series);
  }

  private draw(series: SnapshotWealthSeries[]): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return;

    const W = CHART_WIDTH;
    const H = CHART_HEIGHT;

    const bounds: ChartBounds = {
      left: PAD_LEFT,
      top: PAD_TOP,
      right: W - PAD_RIGHT,
      bottom: H - PAD_BOTTOM,
    };

    // Clear.
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = EDG.black;
    ctx.fillRect(0, 0, W, H);

    // Empty state: show a muted placeholder.
    if (series.length === 0 || series.every((s) => s.rows.length === 0)) {
      ctx.fillStyle = EDG.steel;
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("no data yet", W / 2, H / 2);
      return;
    }

    // Compute domain.
    let maxDay = 1;
    let maxGold = 1;
    for (const s of series) {
      for (const row of s.rows) {
        if (row.day > maxDay) maxDay = row.day;
        if (row.gold > maxGold) maxGold = row.gold;
      }
    }

    // Helper: data → canvas pixels.
    const toX = (day: number): number =>
      bounds.left + (day / maxDay) * (bounds.right - bounds.left);
    const toY = (gold: number): number =>
      bounds.bottom - (gold / maxGold) * (bounds.bottom - bounds.top);

    // ── Axes ──────────────────────────────────────────────────────────────
    ctx.strokeStyle = EDG.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Y-axis.
    ctx.moveTo(bounds.left, bounds.top);
    ctx.lineTo(bounds.left, bounds.bottom);
    // X-axis.
    ctx.lineTo(bounds.right, bounds.bottom);
    ctx.stroke();

    // Axis labels (day range + gold range).
    ctx.fillStyle = EDG.slate;
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("0", bounds.left - 14, bounds.bottom + 2);
    ctx.fillText(String(maxDay), bounds.right - 8, bounds.bottom + 10);

    ctx.textAlign = "right";
    ctx.fillText(String(maxGold) + "g", bounds.left - 2, bounds.top + 8);
    ctx.fillText("0g", bounds.left - 2, bounds.bottom);

    // ── Farmer lines ──────────────────────────────────────────────────────
    const allPoints = computePoints(series, bounds);

    for (let i = 0; i < series.length; i++) {
      const s = series[i]!;
      const pts = allPoints[i]!;
      if (pts.length === 0) continue;

      const color = personalityColor(s.personality);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(pts[k]!.x, pts[k]!.y);
      }
      ctx.stroke();

      // End-of-line label (farmer initial) to the right of the last point.
      const last = pts[pts.length - 1]!;
      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      const initial = s.name.charAt(0).toUpperCase();
      ctx.fillText(initial, last.x + 2, last.y + 3);
    }

    // ── Crossing markers ──────────────────────────────────────────────────
    const crossings = detectCrossings(series);
    ctx.strokeStyle = EDG.yellow;
    ctx.fillStyle = EDG.yellow;
    ctx.lineWidth = 1;

    for (const c of crossings) {
      const cx = toX(c.crossX);
      const cy = toY(c.crossGold);
      // Small circle at the crossing.
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  setVisible(v: boolean): void {
    this.panel.style.display = v ? "" : "none";
  }

  destroy(): void {
    this.panel.remove();
  }
}
