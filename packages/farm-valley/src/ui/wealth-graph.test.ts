import { describe, it, expect, beforeEach } from "vitest";
import {
  computePoints,
  detectCrossings,
  WealthGraphPanel,
} from "./wealth-graph";
import type { ChartBounds, WealthCrossing } from "./wealth-graph";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";

function makeSeries(
  entries: Array<{
    farmerId: number;
    name?: string;
    personality?: string;
    rows: Array<{ day: number; gold: number }>;
  }>,
): SnapshotWealthSeries[] {
  return entries.map((e) => ({
    farmerId: e.farmerId,
    name: e.name ?? `Farmer${e.farmerId}`,
    personality: e.personality ?? "conservative",
    rows: e.rows.map((r) => ({
      day: r.day,
      gold: r.gold,
      rank: 1,
      farmerId: e.farmerId,
    })),
  }));
}

const BOUNDS: ChartBounds = {
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
};

describe("computePoints", () => {
  it("returns empty array when series is empty", () => {
    expect(computePoints([], BOUNDS)).toEqual([]);
  });

  it("returns one empty array per farmer when all farmers have no rows", () => {
    const series = makeSeries([{ farmerId: 1, rows: [] }, { farmerId: 2, rows: [] }]);
    const pts = computePoints(series, BOUNDS);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual([]);
    expect(pts[1]).toEqual([]);
  });

  it("maps day 0 to x = bounds.left", () => {
    const series = makeSeries([{ farmerId: 1, rows: [{ day: 0, gold: 50 }] }]);
    const pts = computePoints(series, BOUNDS);
    expect(pts[0]![0]!.x).toBe(BOUNDS.left);
  });

  it("maps the max day to x = bounds.right", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 0, gold: 10 }, { day: 10, gold: 50 }] },
    ]);
    const pts = computePoints(series, BOUNDS);
    // Day 10 is maxDay → x = bounds.right
    expect(pts[0]![1]!.x).toBe(BOUNDS.right);
  });

  it("maps gold 0 to y = bounds.bottom", () => {
    const series = makeSeries([{ farmerId: 1, rows: [{ day: 1, gold: 0 }] }]);
    const pts = computePoints(series, BOUNDS);
    expect(pts[0]![0]!.y).toBe(BOUNDS.bottom);
  });

  it("maps the max gold to y = bounds.top", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }, { day: 2, gold: 50 }] },
    ]);
    const pts = computePoints(series, BOUNDS);
    // Day 1 gold=100 = maxGold → y = bounds.top
    expect(pts[0]![0]!.y).toBe(BOUNDS.top);
  });

  it("maps a mid-range gold to y between top and bottom", () => {
    // gold 50 with maxGold 100 → y = bottom - (50/100)*(bottom-top) = 50
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 50 }, { day: 2, gold: 100 }] },
    ]);
    const pts = computePoints(series, BOUNDS);
    // Day 1 gold=50 = half max → y = 50 (midpoint of 0–100)
    expect(pts[0]![0]!.y).toBeCloseTo(50, 5);
  });

  it("maps a mid-range day to x between left and right", () => {
    // day 5 out of maxDay 10 → x = left + 0.5 * (right - left) = 50
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 5, gold: 10 }, { day: 10, gold: 20 }] },
    ]);
    const pts = computePoints(series, BOUNDS);
    // Day 5 = half max → x = 50
    expect(pts[0]![0]!.x).toBeCloseTo(50, 5);
  });

  it("handles multiple farmers independently using the shared domain", () => {
    // Two farmers: A has [day1 g10, day5 g100], B has [day3 g50]
    // maxDay=5, maxGold=100
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 10 }, { day: 5, gold: 100 }] },
      { farmerId: 2, rows: [{ day: 3, gold: 50 }] },
    ]);
    const pts = computePoints(series, BOUNDS);
    expect(pts).toHaveLength(2);
    // Farmer B at day 3: x = (3/5)*100 = 60
    expect(pts[1]![0]!.x).toBeCloseTo(60, 5);
    // Farmer B at gold 50: y = 100 - (50/100)*100 = 50
    expect(pts[1]![0]!.y).toBeCloseTo(50, 5);
  });
});

describe("detectCrossings", () => {
  it("returns empty when series is empty", () => {
    expect(detectCrossings([])).toEqual([]);
  });

  it("returns empty for a single farmer", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 10 }, { day: 2, gold: 20 }] },
    ]);
    expect(detectCrossings(series)).toEqual([]);
  });

  it("detects a crossing when two farmers swap gold order", () => {
    // A: day1=100, day2=10  (A drops)
    // B: day1=10,  day2=100 (B rises)
    // → they cross between day 1 and day 2
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }, { day: 2, gold: 10 }] },
      { farmerId: 2, rows: [{ day: 1, gold: 10 }, { day: 2, gold: 100 }] },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.aId).toBe(1);
    expect(crossings[0]!.bId).toBe(2);
    expect(crossings[0]!.day).toBe(1); // crossing starts from day 1
  });

  it("does not report a crossing when lines do not swap order", () => {
    // A is always above B.
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }, { day: 2, gold: 80 }] },
      { farmerId: 2, rows: [{ day: 1, gold: 50 }, { day: 2, gold: 60 }] },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(0);
  });

  it("does not report a crossing for equal lines (no swap)", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 50 }, { day: 2, gold: 50 }] },
      { farmerId: 2, rows: [{ day: 1, gold: 50 }, { day: 2, gold: 50 }] },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(0);
  });

  it("reports crossing gold at the midpoint for symmetric swap", () => {
    // A: day1=100, day2=0  B: day1=0, day2=100 → crossing at t=0.5 → gold=50
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }, { day: 2, gold: 0 }] },
      { farmerId: 2, rows: [{ day: 1, gold: 0 }, { day: 2, gold: 100 }] },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.crossGold).toBeCloseTo(50, 5);
    expect(crossings[0]!.crossX).toBeCloseTo(1.5, 5); // midpoint of [1,2]
  });

  it("detects multiple crossings across multiple day pairs", () => {
    // A: day1=10, day2=90, day3=10   → A and B cross twice
    // B: day1=90, day2=10, day3=90
    const series = makeSeries([
      {
        farmerId: 1,
        rows: [
          { day: 1, gold: 10 },
          { day: 2, gold: 90 },
          { day: 3, gold: 10 },
        ],
      },
      {
        farmerId: 2,
        rows: [
          { day: 1, gold: 90 },
          { day: 2, gold: 10 },
          { day: 3, gold: 90 },
        ],
      },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(2);
  });

  it("crossing fields satisfy basic invariants", () => {
    const series = makeSeries([
      { farmerId: 3, rows: [{ day: 1, gold: 100 }, { day: 5, gold: 10 }] },
      { farmerId: 7, rows: [{ day: 1, gold: 10 }, { day: 5, gold: 100 }] },
    ]);
    const crossings = detectCrossings(series);
    expect(crossings).toHaveLength(1);
    const c: WealthCrossing = crossings[0]!;
    expect(c.day).toBe(1);
    expect(c.crossX).toBeGreaterThan(1);
    expect(c.crossX).toBeLessThan(5);
    expect(c.crossGold).toBeGreaterThan(0);
    expect(c.crossGold).toBeLessThan(100);
  });
});

describe("WealthGraphPanel", () => {
  let container: HTMLElement;
  let panel: WealthGraphPanel;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    panel = new WealthGraphPanel(container);
  });

  it("mounts into the parent", () => {
    expect(container.querySelector("div")).not.toBeNull();
  });

  it("starts collapsed (canvas wrapper hidden)", () => {
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const wrapper = canvas!.parentElement as HTMLElement;
    expect(wrapper.style.display).toBe("none");
  });

  it("toggling the header expands the panel", () => {
    const outerPanel = container.querySelector("div") as HTMLElement | null;
    expect(outerPanel).not.toBeNull();
    const header = outerPanel!.firstElementChild as HTMLElement | null;
    expect(header).not.toBeNull();
    header!.click();
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const wrapper = canvas!.parentElement as HTMLElement;
    expect(wrapper.style.display).not.toBe("none");
  });

  it("contains a canvas element", () => {
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });

  it("setVisible(false) hides the panel", () => {
    panel.setVisible(false);
    const root = container.querySelector("div") as HTMLElement;
    expect(root.style.display).toBe("none");
  });

  it("destroy removes the panel from the DOM", () => {
    panel.destroy();
    expect(container.querySelector("div")).toBeNull();
  });

  it("update does not throw with empty series", () => {
    expect(() => panel.update([], 1)).not.toThrow();
  });

  it("update does not throw with populated series", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }, { day: 2, gold: 80 }] },
      { farmerId: 2, rows: [{ day: 1, gold: 50 }, { day: 2, gold: 120 }] },
    ]);
    expect(() => panel.update(series, 2)).not.toThrow();
  });

  it("update is idempotent for the same day", () => {
    const series = makeSeries([
      { farmerId: 1, rows: [{ day: 1, gold: 100 }] },
    ]);
    expect(() => {
      panel.update(series, 1);
      panel.update(series, 1);
    }).not.toThrow();
  });
});
