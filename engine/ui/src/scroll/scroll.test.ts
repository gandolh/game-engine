import { describe, expect, it, beforeEach } from "vitest";
import type { RendererLike, UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { DEFAULT_THEME } from "../theme/theme";
import { label, resetNodeIds } from "../widget/node";
import { clampScroll, scroll, scrollBy, resetScrollNodeIds } from "./node";
import { computeScrollContent } from "./layout";
import { renderScrollViewport } from "./render";

/**
 * Minimal recording renderer — captures every pushed quad so tests can inspect
 * which children were emitted and at what translated positions.
 */
class RecordingRenderer implements Partial<RendererLike> {
  quads: UIQuad[] = [];
  private open = false;
  beginUI(): void {
    this.open = true;
    this.quads = [];
  }
  pushUI(q: UIQuad): void {
    if (!this.open) throw new Error("pushUI outside begin/end");
    this.quads.push({ ...q });
  }
  endUI(): void {
    this.open = false;
  }
}

function makeSurface(): { surface: UISurface; rec: RecordingRenderer } {
  const rec = new RecordingRenderer();
  const surface = new UISurface(rec as unknown as RendererLike);
  return { surface, rec };
}

beforeEach(() => {
  resetNodeIds();
  resetScrollNodeIds();
});

// ---------------------------------------------------------------------------
// computeScrollContent
// ---------------------------------------------------------------------------

describe("computeScrollContent — content sizing", () => {
  it("measures a single child and stores it as contentSize", () => {
    // A label "A" = 8w × 10h (body font, unscii-8 — matches the metrics used in widget tests).
    const child = label("A");
    const vp = scroll({ width: 200, height: 80 }, [child]);
    computeScrollContent(vp, DEFAULT_THEME);

    expect(vp.contentSize.width).toBe(8);
    expect(vp.contentSize.height).toBe(10);
    // Child rect is content-space (relative to 0,0).
    expect(child.rect.x).toBe(0);
    expect(child.rect.y).toBe(0);
  });

  it("stacks multiple children in a column and accumulates height", () => {
    // 3 labels of 1 line each → 3 × 10 = 30h (no gap by default).
    const children = [label("A"), label("B"), label("C")];
    const vp = scroll({ width: 200, height: 20 }, children);
    computeScrollContent(vp, DEFAULT_THEME);

    expect(vp.contentSize.height).toBe(30);
    expect(children[0]!.rect.y).toBe(0);
    expect(children[1]!.rect.y).toBe(10);
    expect(children[2]!.rect.y).toBe(20);
  });

  it("returns zero contentSize for an empty viewport", () => {
    const vp = scroll({ width: 100, height: 100 });
    computeScrollContent(vp, DEFAULT_THEME);
    expect(vp.contentSize).toEqual({ width: 0, height: 0 });
  });
});

// ---------------------------------------------------------------------------
// clampScroll
// ---------------------------------------------------------------------------

describe("clampScroll — prevents overscroll", () => {
  it("clamps offset to zero when content fits within viewport", () => {
    const vp = scroll({ width: 200, height: 100 });
    vp.rect = { x: 0, y: 0, width: 200, height: 100 };
    vp.contentSize = { width: 200, height: 100 };
    vp.scrollOffset = { x: 50, y: 50 };
    clampScroll(vp);
    expect(vp.scrollOffset.x).toBe(0);
    expect(vp.scrollOffset.y).toBe(0);
  });

  it("clamps to max when offset exceeds content overflow", () => {
    const vp = scroll({ width: 100, height: 50 });
    vp.rect = { x: 0, y: 0, width: 100, height: 50 };
    vp.contentSize = { width: 100, height: 200 };
    vp.scrollOffset = { x: 0, y: 999 };
    clampScroll(vp);
    // maxY = contentHeight - viewportHeight = 200 - 50 = 150
    expect(vp.scrollOffset.y).toBe(150);
  });

  it("allows partial scroll within range", () => {
    const vp = scroll({ width: 100, height: 50 });
    vp.rect = { x: 0, y: 0, width: 100, height: 50 };
    vp.contentSize = { width: 100, height: 200 };
    vp.scrollOffset = { x: 0, y: 80 };
    clampScroll(vp);
    expect(vp.scrollOffset.y).toBe(80); // within [0, 150]
  });
});

// ---------------------------------------------------------------------------
// scrollBy
// ---------------------------------------------------------------------------

describe("scrollBy — adjusts offset and clamps", () => {
  it("adds delta and clamps at once", () => {
    const vp = scroll({ width: 100, height: 50 });
    vp.rect = { x: 0, y: 0, width: 100, height: 50 };
    vp.contentSize = { width: 100, height: 200 };
    vp.scrollOffset = { x: 0, y: 0 };

    scrollBy(vp, 0, 60);
    expect(vp.scrollOffset.y).toBe(60);

    // Scroll past the end — should clamp to maxY = 150.
    scrollBy(vp, 0, 999);
    expect(vp.scrollOffset.y).toBe(150);

    // Scroll backward past zero.
    scrollBy(vp, 0, -999);
    expect(vp.scrollOffset.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// renderScrollViewport — culling + translation
// ---------------------------------------------------------------------------

describe("renderScrollViewport — child culling and translation", () => {
  /**
   * Build a viewport at screen position (10, 10) with size 100×50.
   * Content has 6 children each 20px tall, laid out from y=0..120 (total 120px).
   * Viewport shows 50px at a time → at offset 0 we see children 0-2 (y=0..60).
   */
  function buildTallViewport(scrollOffsetY: number): {
    surface: UISurface;
    rec: RecordingRenderer;
    vp: ReturnType<typeof scroll>;
    children: ReturnType<typeof label>[];
  } {
    const children = [
      label("A"),
      label("B"),
      label("C"),
      label("D"),
      label("E"),
      label("F"),
    ];

    const vp = scroll({ width: 100, height: 50 }, children);
    // Manually lay out children in content-space (each 20px tall, stacked).
    for (let i = 0; i < children.length; i++) {
      children[i]!.rect = { x: 0, y: i * 20, width: 50, height: 20 };
    }
    vp.contentSize = { width: 50, height: 120 };
    // Place viewport at screen (10, 10).
    vp.rect = { x: 10, y: 10, width: 100, height: 50 };
    vp.scrollOffset = { x: 0, y: scrollOffsetY };

    const { surface, rec } = makeSurface();
    return { surface, rec, vp, children };
  }

  it("at offset 0: renders children whose content-y is within [0,50)", () => {
    const { surface, rec, vp } = buildTallViewport(0);

    surface.begin();
    renderScrollViewport(surface, vp, DEFAULT_THEME);
    surface.end();

    // Children at content-y 0,20,40 (partially visible) should emit quads.
    // Children at content-y 60,80,100 are fully below the viewport (translated y ≥ 60).
    // At offset 0: translated y = content-y + vpY - offsetY = content-y + 10 - 0.
    // Viewport screen-rect = [10, 10+50) = [10, 60).
    // Child 0: translated y=10, height=20 → [10,30) overlaps [10,60) ✓
    // Child 1: translated y=30, height=20 → [30,50) overlaps [10,60) ✓
    // Child 2: translated y=50, height=20 → [50,70) overlaps [10,60) ✓ (partially)
    // Child 3: translated y=70, height=20 → starts at 70 ≥ 60 ✗
    // Child 4,5: same ✗
    // Each label "A","B",..."F" has 1 glyph quad each (single character).
    const glyphFrames = rec.quads.filter((q) => q.atlasId !== undefined).map((q) => q.frame);
    // glyphs for A, B, C = 3 glyphs
    expect(glyphFrames.length).toBe(3);
  });

  it("at offset 40: children A,B are scrolled out; D,E enter view", () => {
    const { surface, rec, vp } = buildTallViewport(40);

    surface.begin();
    renderScrollViewport(surface, vp, DEFAULT_THEME);
    surface.end();

    // At offset 40: translated y = content-y + 10 - 40 = content-y - 30.
    // Viewport screen-rect y ∈ [10, 60).
    // Child 0 (content-y=0):  translated y=-30, bottom=-10 → fully above vpY=10 ✗
    // Child 1 (content-y=20): translated y=-10, bottom=10 → bottom=10 == vpY=10 → NOT overlapping (< not <=) ✗
    // Child 2 (content-y=40): translated y=10, bottom=30 → overlaps [10,60) ✓
    // Child 3 (content-y=60): translated y=30, bottom=50 → overlaps [10,60) ✓
    // Child 4 (content-y=80): translated y=50, bottom=70 → overlaps [10,60) ✓ (straddles)
    // Child 5 (content-y=100): translated y=70, bottom=90 → fully below 60 ✗
    const glyphCount = rec.quads.filter((q) => q.atlasId !== undefined).length;
    expect(glyphCount).toBe(3); // C, D, E
  });

  it("content-space rects are restored after render (frame-safe)", () => {
    const { surface, vp, children } = buildTallViewport(0);
    const originalY = children.map((c) => c.rect.y);

    surface.begin();
    renderScrollViewport(surface, vp, DEFAULT_THEME);
    surface.end();

    // Rects must be back to content-space values.
    for (let i = 0; i < children.length; i++) {
      expect(children[i]!.rect.y).toBe(originalY[i]);
    }
  });

  it("translated rects during render are offset by (vpX - scrollX, vpY - scrollY)", () => {
    // We verify that children emitted rects correctly by checking glyph x/y positions.
    // At offset (0,0), viewport at (20,30): child[0] content-rect = (0,0,50,20)
    // → translated to (20,30,50,20).
    const children = [label("A")];
    const vp = scroll({ width: 100, height: 50 }, children);
    children[0]!.rect = { x: 0, y: 0, width: 50, height: 20 };
    vp.contentSize = { width: 50, height: 20 };
    vp.rect = { x: 20, y: 30, width: 100, height: 50 };
    vp.scrollOffset = { x: 0, y: 0 };

    const { surface, rec } = makeSurface();
    surface.begin();
    renderScrollViewport(surface, vp, DEFAULT_THEME);
    surface.end();

    const glyphs = rec.quads.filter((q) => q.atlasId !== undefined);
    expect(glyphs.length).toBeGreaterThan(0);
    // Label "A" is drawn at its node.rect position which is (20,30) translated.
    // The label draws at rect.x, rect.y (see render.ts drawLabel).
    expect(glyphs[0]!.x).toBe(20);
    expect(glyphs[0]!.y).toBe(30);
  });
});
