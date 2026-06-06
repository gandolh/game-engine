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
import { createEl, applyStyles } from "../dom";
import { personalityColor } from "../colors";
import type { SnapshotWealthSeries } from "../../worker/snapshot";
import { computePoints, detectCrossings } from "./compute";
import type { ChartBounds } from "./compute";
import {
  PANEL_STYLES,
  HEADER_STYLES,
  HEADER_TITLE_STYLES,
  TOGGLE_STYLES,
  CANVAS_WRAPPER_STYLES,
  CHART_WIDTH,
  CHART_HEIGHT,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  PAD_BOTTOM,
} from "./styles";

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
