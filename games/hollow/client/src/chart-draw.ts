/**
 * `chart-draw.ts` — the actual canvas-2D line-chart draw call for the
 * metrics dashboard (chunk hollow-10b). Kept separate from the pure
 * data-shaping in `metrics-data.ts` (which IS unit-tested) — per the brief,
 * the draw calls themselves aren't required to be unit-tested, but this
 * module still narrows to `ChartCtx` (a structural subset of
 * `CanvasRenderingContext2D`, same idiom as `render3d/overlay.ts`'s
 * `OverlayCtx`) so a plain recording mock CAN drive it under jsdom (which
 * has no real 2D canvas rendering) for a basic call-shape sanity check —
 * see `chart-draw.test.ts`.
 *
 * Each series is scaled to ITS OWN `chartScale` (not a shared axis) — panels
 * mix columns of very different units/magnitudes (e.g. `community_count`
 * vs. `community_mean_size`), and a shared linear scale would flatten the
 * smaller-magnitude line to a near-flat smear. The tradeoff is that this
 * chart shows SHAPE (trend), not absolute cross-series comparison — the
 * DOM legend (`dashboard-panel.ts`) carries the actual current values for
 * that.
 */
import { HOLLOW_PAL } from "./render/hollow-palette";
import { chartScale } from "./metrics-data";

export interface ChartSeries {
  readonly values: readonly number[];
  readonly colorRole: keyof typeof HOLLOW_PAL;
}

export interface ChartDrawOptions {
  readonly width: number;
  readonly height: number;
}

/** Structural subset of `CanvasRenderingContext2D` this module draws with —
 *  see this file's header for why. A real `CanvasRenderingContext2D`
 *  satisfies this interface structurally, no cast needed at the real call
 *  site (`dashboard-panel.ts`). */
export interface ChartCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

const LINE_WIDTH = 1.5;

/**
 * Draws every series in `series` as an independently-scaled polyline over
 * `opts.width x opts.height`, on a flat `HOLLOW_PAL.ink` background. Clears
 * the full canvas first (this function owns the whole canvas, same
 * "clear-then-draw" contract as `drawAgentOverlay`). A series with fewer
 * than 2 points draws no line (nothing to connect) but doesn't throw.
 */
export function drawLineChart(ctx: ChartCtx, series: readonly ChartSeries[], opts: ChartDrawOptions): void {
  ctx.clearRect(0, 0, opts.width, opts.height);
  ctx.fillStyle = HOLLOW_PAL.ink;
  ctx.fillRect(0, 0, opts.width, opts.height);

  for (const s of series) {
    if (s.values.length < 2) continue;
    const scale = chartScale(s.values);
    const span = scale.max - scale.min;
    ctx.strokeStyle = HOLLOW_PAL[s.colorRole];
    ctx.lineWidth = LINE_WIDTH;
    ctx.beginPath();
    const last = s.values.length - 1;
    s.values.forEach((v, i) => {
      const x = (i / last) * opts.width;
      const y = opts.height - ((v - scale.min) / span) * opts.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
