/**
 * Tests for the in-canvas wealth graph (wealth-graph.ts) — pure drawing, no real 2D context.
 *
 * `createWealthGraph().render()` takes a `UISurface`; rather than standing up a real
 * renderer (as `ui-surface.test.ts` does), we hand it a minimal fake that just records every
 * `rect`/`push` call. This asserts the module never reaches for a Canvas2D context (there
 * isn't one to reach for) and that it emits the expected primitives for a sample series —
 * mirroring the geometry-only style of `minimap.test.ts` and the label style of
 * `world-clock.test.ts`.
 */
import { describe, it, expect } from "vitest";
import type { UIQuad } from "@engine/core/render";
import { EDG } from "@engine/core";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";
import { createWealthGraph } from "./wealth-graph";

/** Records every `rect`/`push` submission. Matches the subset of `UISurface`'s API used here. */
class FakeSurface {
  readonly rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  readonly quads: UIQuad[] = [];

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.rects.push({ x, y, w: width, h: height, color });
  }
  push(quad: UIQuad): void {
    this.quads.push(quad);
  }
}

function series(rows: { day: number; gold: number }[], overrides: Partial<SnapshotWealthSeries> = {}): SnapshotWealthSeries {
  return {
    farmerId: 1,
    name: "Pip",
    personality: "conservative",
    rows: rows.map((r) => ({ day: r.day, gold: r.gold, farmerId: 1, rank: 1 })),
    ...overrides,
  };
}

describe("createWealthGraph", () => {
  it("draws a 'no data yet' label (via text quads) and nothing else when series is empty", () => {
    const graph = createWealthGraph();
    const surface = new FakeSurface();

    graph.render(surface as never, 0, 0, 200, 100, []);

    // Backing panel only.
    expect(surface.rects.length).toBe(1);
    expect(surface.rects[0]!.color).toBe(EDG.black);
    // "no data yet" drawn via bitmap-font text quads, not a 2D context fillText.
    expect(surface.quads.length).toBeGreaterThan(0);
  });

  it("draws axes, a line for each farmer with data, and an endpoint initial", () => {
    const graph = createWealthGraph();
    const surface = new FakeSurface();

    const s1 = series([{ day: 1, gold: 10 }, { day: 5, gold: 50 }]);
    const s2 = series(
      [{ day: 1, gold: 20 }, { day: 5, gold: 5 }],
      { farmerId: 2, name: "Amara", personality: "aggressive" },
    );

    graph.render(surface as never, 0, 0, 200, 100, [s1, s2]);

    // Backing panel + 2 axis rects + many line-dot rects + 2 crossing markers (lines cross).
    expect(surface.rects.length).toBeGreaterThan(3);
    // At least one rect drawn in each farmer's colour (line dots).
    const colors = new Set(surface.rects.map((r) => r.color));
    expect(colors.has(EDG.skyBlue)).toBe(true); // conservative
    expect(colors.has(EDG.orange)).toBe(true); // aggressive
    // A crossing marker in yellow (the two series' gold values cross between day 1 and 5).
    expect(colors.has(EDG.yellow)).toBe(true);

    // Endpoint initials + axis labels drawn as bitmap-font glyph quads.
    expect(surface.quads.length).toBeGreaterThan(0);
  });

  it("renders without a 2D canvas context (surface is the only draw target)", () => {
    const graph = createWealthGraph();
    const surface = new FakeSurface();
    expect(() => graph.render(surface as never, 10, 10, 276, 120, [series([{ day: 1, gold: 5 }])])).not.toThrow();
  });
});
