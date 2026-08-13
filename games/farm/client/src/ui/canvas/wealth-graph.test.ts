/**
 * Tests for the in-canvas wealth graph (wealth-graph.ts) — pure drawing, no real 2D context.
 *
 * The chart is now a {@link custom} escape-hatch node: bind the series with `setSeries`, lay the
 * node out with `computeLayout`, then `renderTree` invokes its draw callback against a `UISurface`.
 * Rather than standing up a real renderer (as `ui-surface.test.ts` does), we hand it a minimal fake
 * that records every `rect`/`push` call. This asserts the module never reaches for a Canvas2D
 * context (there isn't one) and emits the expected primitives for a sample series — mirroring the
 * geometry-only style of `minimap.test.ts` and the label style of `world-clock.test.ts`.
 */
import { describe, it, expect } from "vitest";
import type { UIQuad } from "@engine/core/render";
import { EDG } from "@engine/core";
import { computeLayout, renderTree } from "@engine/ui";
import type { ButtonNode, UINode } from "@engine/ui";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";
import { createWealthGraph, createWealthToggle } from "./wealth-graph";
import type { PanelId, PanelPrefs } from "./panel-prefs";

/** Bind `series`, lay the node out at (`x`,`y`), and render it into `surface` — the new draw path. */
function drawGraph(
  graph: ReturnType<typeof createWealthGraph>,
  surface: FakeSurface,
  series: SnapshotWealthSeries[],
  x = 0,
  y = 0,
): void {
  graph.setSeries(series);
  computeLayout(graph.root, x, y);
  renderTree(surface as never, graph.root);
}

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
  it("is a custom-draw node sized by its baked layout (width/height)", () => {
    const graph = createWealthGraph();
    expect(graph.root.kind).toBe("custom");
    computeLayout(graph.root, 0, 0);
    expect(graph.root.rect.width).toBeGreaterThan(0);
    expect(graph.root.rect.height).toBeGreaterThan(0);
  });

  it("draws a 'no data yet' label (via text quads) and nothing else when series is empty", () => {
    const graph = createWealthGraph();
    const surface = new FakeSurface();

    drawGraph(graph, surface, []);

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

    drawGraph(graph, surface, [s1, s2]);

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
    expect(() => drawGraph(graph, surface, [series([{ day: 1, gold: 5 }])], 10, 10)).not.toThrow();
  });
});

/** Minimal fake PanelPrefs — in-memory, records every toggle/setOpen call, defaults closed. */
function makeFakePrefs(): PanelPrefs & { calls: Array<{ op: string; id: PanelId; value?: boolean }> } {
  const open = new Set<PanelId>();
  const calls: Array<{ op: string; id: PanelId; value?: boolean }> = [];
  return {
    calls,
    isOpen(id) {
      return open.has(id);
    },
    setOpen(id, isOpen) {
      calls.push({ op: "setOpen", id, value: isOpen });
      if (isOpen) open.add(id);
      else open.delete(id);
    },
    toggle(id) {
      const next = !open.has(id);
      calls.push({ op: "toggle", id });
      if (next) open.add(id);
      else open.delete(id);
      return next;
    },
  };
}

function buttons(node: UINode, out: ButtonNode[] = []): ButtonNode[] {
  if (node.kind === "button") out.push(node);
  for (const c of node.children) buttons(c, out);
  return out;
}

describe("createWealthToggle", () => {
  it("defaults closed with a single Wealth button", () => {
    const prefs = makeFakePrefs();
    const toggle = createWealthToggle(prefs);

    expect(toggle.isOpen()).toBe(false);
    const btns = buttons(toggle.root);
    expect(btns.length).toBe(1);
    expect(btns[0]!.label).toBe("Wealth");
  });

  it("toggleOpen() flips prefs via toggle(\"wealth\") and refresh() reports true exactly once", () => {
    const prefs = makeFakePrefs();
    const toggle = createWealthToggle(prefs);

    toggle.toggleOpen();
    expect(prefs.calls).toEqual([{ op: "toggle", id: "wealth" }]);
    expect(toggle.isOpen()).toBe(true);

    expect(toggle.refresh()).toBe(true);
    expect(toggle.refresh()).toBe(false);
  });

  it("pressing the Wealth button has identical semantics to toggleOpen()", () => {
    const prefs = makeFakePrefs();
    const toggle = createWealthToggle(prefs);
    const btn = buttons(toggle.root)[0]!;

    btn.onActivate?.();
    expect(prefs.calls).toEqual([{ op: "toggle", id: "wealth" }]);
    expect(toggle.isOpen()).toBe(true);
    expect(toggle.refresh()).toBe(true);

    btn.onActivate?.();
    expect(toggle.isOpen()).toBe(false);
    expect(toggle.refresh()).toBe(true);
    expect(toggle.refresh()).toBe(false);
  });
});
