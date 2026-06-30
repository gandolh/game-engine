import { describe, expect, it, beforeEach } from "vitest";
import { EDG } from "@engine/core/render";
import type { RendererLike, UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { FONT_ATLAS_ID } from "../text/font";
import { DEFAULT_THEME, makeTheme } from "../theme/theme";
import { computeLayout } from "../layout/layout";
import { panel, box, label, button, resetNodeIds } from "./node";
import { renderTree } from "./render";

/**
 * A recording `RendererLike` that captures every UI quad pushed between beginUI/endUI, so
 * tests can assert the exact quads/text the render walk emits. Only the UI seam is real;
 * world-render methods are inert stubs (the widget framework never calls them).
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
  // The surface only ever touches the UI seam, so the partial stub satisfies it at runtime.
  const surface = new UISurface(rec as unknown as RendererLike);
  return { surface, rec };
}

beforeEach(() => resetNodeIds());

describe("computeLayout — column with padding + gap", () => {
  it("places children stacked with gap, offset by padding", () => {
    const a = label("A"); // 1 glyph: 5w; one text line = lineHeight 9h
    const b = label("BB"); // 2 glyphs: 11w, 9h
    const root = panel({ direction: "column", padding: 10, gap: 4 }, [a, b]);
    computeLayout(root, 100, 200, DEFAULT_THEME);

    // Children sit at padding offset; second is below the first by (height + gap).
    expect(a.rect).toEqual({ x: 110, y: 210, width: 5, height: 9 });
    expect(b.rect).toEqual({ x: 110, y: 210 + 9 + 4, width: 11, height: 9 });

    // Root sizes to content: widest child (11) + 2*pad ; sum of heights + gap + 2*pad.
    expect(root.rect.x).toBe(100);
    expect(root.rect.y).toBe(200);
    expect(root.rect.width).toBe(11 + 20);
    expect(root.rect.height).toBe(9 + 4 + 9 + 20);
  });
});

describe("computeLayout — row direction", () => {
  it("places children left-to-right with gap", () => {
    const a = label("A");
    const b = label("BB");
    const root = box({ direction: "row", padding: 0, gap: 5 }, [a, b]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    expect(a.rect).toEqual({ x: 0, y: 0, width: 5, height: 9 });
    expect(b.rect).toEqual({ x: 5 + 5, y: 0, width: 11, height: 9 });
  });
});

describe("computeLayout — cross-axis align", () => {
  const build = (align: "start" | "center" | "end" | "stretch") =>
    box({ direction: "column", padding: 0, gap: 0, align }, [label("A"), label("BBBB")]);

  it("start keeps children at the cross-axis origin", () => {
    const root = build("start");
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const a = root.children[0]!;
    expect(a.rect.x).toBe(0);
  });

  it("center centers the narrower child in the content width", () => {
    const root = build("center");
    computeLayout(root, 0, 0, DEFAULT_THEME);
    // content width = widest child "BBBB" = 4 glyphs = 23. "A" = 5 wide.
    const a = root.children[0]!;
    expect(root.rect.width).toBe(23);
    expect(a.rect.x).toBe((23 - 5) / 2);
  });

  it("end right-aligns the narrower child", () => {
    const root = build("end");
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const a = root.children[0]!;
    expect(a.rect.x).toBe(23 - 5);
  });

  it("stretch expands children to the content width", () => {
    const root = build("stretch");
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const a = root.children[0]!;
    expect(a.rect.width).toBe(23);
  });
});

describe("computeLayout — grow distributes leftover main-axis space", () => {
  it("a grow child absorbs the slack to fill a fixed-height column", () => {
    const head = label("H"); // one text line = 9h
    const filler = box({ grow: 1, padding: 0 }); // empty container, intrinsic height 0
    const root = panel({ direction: "column", padding: 0, gap: 0, height: 100 }, [head, filler]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    // head keeps intrinsic 9; filler absorbs the leftover so the column fills height 100.
    expect(head.rect.height).toBe(9);
    expect(filler.rect.y).toBe(9);
    expect(filler.rect.height).toBe(91);
    expect(head.rect.height + filler.rect.height).toBe(100);
  });
});

describe("button intrinsic size + state", () => {
  it("sizes from label + padding and defaults to normal state", () => {
    const btn = button("OK", { layout: { padding: 4 } }); // "OK" = 2 glyphs = 11w, 7h
    computeLayout(btn, 0, 0, DEFAULT_THEME);
    expect(btn.state).toBe("normal");
    expect(btn.rect.width).toBe(11 + 8);
    expect(btn.rect.height).toBe(9 + 8);
  });
});

describe("renderTree — emits themed quads + text", () => {
  it("paints panel border+bg, then a label's glyph quads", () => {
    const { surface, rec } = makeSurface();
    const root = panel({ direction: "column", padding: 2, gap: 0 }, [
      label("A", { color: EDG.yellow }),
    ]);
    computeLayout(root, 0, 0, DEFAULT_THEME);

    surface.begin();
    renderTree(surface, root, DEFAULT_THEME);
    surface.end();

    // First quad: border rect (panelBorder). Second: inset bg (panelBg).
    expect(rec.quads[0]).toMatchObject({ color: DEFAULT_THEME.panelBorder, x: 0, y: 0 });
    expect(rec.quads[1]).toMatchObject({ color: DEFAULT_THEME.panelBg });
    // Then the glyph quad(s) for "A" — textured from the font atlas, tinted yellow.
    const glyphs = rec.quads.filter((q) => q.atlasId === FONT_ATLAS_ID);
    expect(glyphs.length).toBe(1);
    expect(glyphs[0]).toMatchObject({ atlasId: FONT_ATLAS_ID, color: EDG.yellow });
  });

  it("renders a button with state-selected fill + centered label", () => {
    const { surface, rec } = makeSurface();
    const btn = button("Go", { layout: { padding: 4 }, state: "hover" });
    computeLayout(btn, 10, 10, DEFAULT_THEME);

    surface.begin();
    renderTree(surface, btn, DEFAULT_THEME);
    surface.end();

    // First quad is the button fill in the HOVER colour.
    expect(rec.quads[0]).toMatchObject({
      color: DEFAULT_THEME.buttonBg.hover,
      x: 10,
      y: 10,
    });
    // Label glyphs tinted with the hover text colour.
    const glyphs = rec.quads.filter((q) => q.atlasId === FONT_ATLAS_ID);
    expect(glyphs.length).toBe(2); // "Go"
    for (const g of glyphs) expect(g.color).toBe(DEFAULT_THEME.buttonText.hover);
  });

  it("box with background:false paints no panel quad", () => {
    const { surface, rec } = makeSurface();
    const root = box({ padding: 0 }, [label("X")]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, root, DEFAULT_THEME);
    surface.end();
    // No solid panel quad — only the glyph for "X".
    expect(rec.quads.every((q) => q.atlasId === FONT_ATLAS_ID)).toBe(true);
  });
});

describe("theme swapping re-skins widgets", () => {
  it("a custom theme changes the panel bg colour", () => {
    const { surface, rec } = makeSurface();
    const theme = makeTheme({ panelBg: EDG.greenDark, borderWidth: 0 });
    const root = panel({ padding: 0 }, [label("Z")]);
    computeLayout(root, 0, 0, theme);
    surface.begin();
    renderTree(surface, root, theme);
    surface.end();
    expect(rec.quads[0]).toMatchObject({ color: EDG.greenDark });
  });
});

describe("retained-mode node identity", () => {
  it("assigns stable, unique ids usable for hit-test / a11y keying", () => {
    const a = label("a");
    const b = button("b");
    expect(a.id).not.toBe(b.id);
    expect(typeof a.id).toBe("number");
  });
});
