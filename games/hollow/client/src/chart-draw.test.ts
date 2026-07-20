/**
 * Light call-shape sanity coverage for `drawLineChart` — the brief only
 * requires the DATA-shaping (`metrics-data.ts`) to be unit-tested, not the
 * canvas draw calls themselves, but a plain recording mock (same idiom as
 * `render3d/overlay.test.ts`'s `RecordingCtx`) catches obvious breakage
 * (e.g. a series that never gets drawn, or a crash on a short series)
 * cheaply.
 */
import { describe, it, expect } from "vitest";
import { drawLineChart, type ChartCtx, type ChartSeries } from "./chart-draw";
import { HOLLOW_PAL } from "./render/hollow-palette";

class RecordingCtx implements ChartCtx {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  readonly calls: string[] = [];
  readonly strokeStyles: (string | CanvasGradient | CanvasPattern)[] = [];

  clearRect(): void {
    this.calls.push("clearRect");
  }
  fillRect(): void {
    this.calls.push("fillRect");
  }
  beginPath(): void {
    this.calls.push("beginPath");
    this.strokeStyles.push(this.strokeStyle);
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
}

describe("drawLineChart", () => {
  it("always clears then fills the background first", () => {
    const ctx = new RecordingCtx();
    drawLineChart(ctx, [], { width: 100, height: 40 });
    expect(ctx.calls.slice(0, 2)).toEqual(["clearRect", "fillRect"]);
  });

  it("draws one beginPath/stroke pair per series with >= 2 points", () => {
    const ctx = new RecordingCtx();
    const series: ChartSeries[] = [
      { values: [1, 2, 3], colorRole: "green" },
      { values: [4, 5, 6], colorRole: "red" },
    ];
    drawLineChart(ctx, series, { width: 100, height: 40 });
    expect(ctx.calls.filter((c) => c === "beginPath")).toHaveLength(2);
    expect(ctx.calls.filter((c) => c === "stroke")).toHaveLength(2);
    expect(ctx.strokeStyles).toEqual([HOLLOW_PAL.green, HOLLOW_PAL.red]);
  });

  it("skips a series with fewer than 2 points without throwing", () => {
    const ctx = new RecordingCtx();
    expect(() =>
      drawLineChart(ctx, [{ values: [1], colorRole: "green" }], { width: 100, height: 40 }),
    ).not.toThrow();
    expect(ctx.calls.filter((c) => c === "beginPath")).toHaveLength(0);
  });

  it("does not throw for an empty series list", () => {
    expect(() => drawLineChart(new RecordingCtx(), [], { width: 100, height: 40 })).not.toThrow();
  });
});
