import { describe, expect, it, beforeEach, vi } from "vitest";
import { EDG } from "@engine/core/render";
import type { RendererLike, UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { FONT_ATLAS_ID } from "../text/font";
import { DEFAULT_THEME, makeTheme } from "../theme/theme";
import { computeLayout } from "../layout/layout";
import {
  panel,
  box,
  label,
  button,
  slider,
  checkbox,
  toggle,
  resetNodeIds,
  SLIDER_DEFAULT_HEIGHT,
  SLIDER_DEFAULT_WIDTH,
} from "./node";
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

  it("with no explicit padding, uses the theme padding (measure matches the render walk)", () => {
    // Regression: paddingOf must give a button the theme padding by default, the same value
    // the render walk centres the label within. If they disagree the bg is text-tight and
    // the label overflows / adjacent buttons merge (the Citadel HUD speed/pause bug).
    const btn = button("OK"); // "OK" = 11w, 9h text; theme.padding default = 6
    computeLayout(btn, 0, 0, DEFAULT_THEME);
    const p = DEFAULT_THEME.padding;
    expect(btn.rect.width).toBe(11 + 2 * p);
    expect(btn.rect.height).toBe(9 + 2 * p);
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

  it("node.opacity multiplies down the subtree (container fades children too)", () => {
    const { surface, rec } = makeSurface();
    const lbl = label("A", { color: EDG.yellow });
    const root = panel({ direction: "column", padding: 2, gap: 0 }, [lbl]);
    root.opacity = 0.5; // fade the whole panel
    lbl.opacity = 0.5;  // ...and the label half again ⇒ 0.25 on its glyphs
    computeLayout(root, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, root, DEFAULT_THEME);
    surface.end();

    // Panel border+bg quads carry the panel's 0.5.
    expect(rec.quads[0]).toMatchObject({ color: DEFAULT_THEME.panelBorder });
    expect(rec.quads[0]!.alpha).toBeCloseTo(0.5);
    expect(rec.quads[1]!.alpha).toBeCloseTo(0.5);
    // Glyph quads carry the multiplied 0.5 × 0.5 = 0.25.
    const glyphs = rec.quads.filter((q) => q.atlasId === FONT_ATLAS_ID);
    expect(glyphs.length).toBe(1);
    expect(glyphs[0]!.alpha).toBeCloseTo(0.25);
  });

  it("a fully-transparent node (opacity 0) emits nothing for its subtree", () => {
    const { surface, rec } = makeSurface();
    const root = panel({ padding: 2 }, [label("A")]);
    root.opacity = 0;
    computeLayout(root, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, root, DEFAULT_THEME);
    surface.end();
    expect(rec.quads.length).toBe(0);
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

describe("slider — construction, value mapping + layout", () => {
  it("clamps + snaps the initial value into [min,max]", () => {
    const s = slider({ min: 0, max: 10, value: 99, step: 2 });
    expect(s.value).toBe(10); // clamped
    const s2 = slider({ min: 0, max: 10, value: 3, step: 2 });
    expect(s2.value).toBe(4); // snapped to nearest multiple of 2
  });

  it("intrinsic size: default width/height when not pinned, fixed width overrides", () => {
    const s = slider({ min: 0, max: 1, value: 0.5 });
    computeLayout(s, 0, 0, DEFAULT_THEME);
    expect(s.rect.width).toBe(SLIDER_DEFAULT_WIDTH);
    expect(s.rect.height).toBe(SLIDER_DEFAULT_HEIGHT);

    resetNodeIds();
    const wide = slider({ min: 0, max: 1, value: 0, layout: { width: 200, height: 20 } });
    computeLayout(wide, 0, 0, DEFAULT_THEME);
    expect(wide.rect.width).toBe(200);
    expect(wide.rect.height).toBe(20);
  });

  it("maps pointer x across the track to a value (and back to a matching thumb x)", () => {
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, layout: { width: 100 } });
    computeLayout(s, 10, 0, DEFAULT_THEME); // track spans x=[10,110]
    // Half-way along the 100px track → 50.
    expect(s.valueFromPointerX(60)).toBe(50);
    // setValue writes + fires onChange with the new value.
    s.setValueFromPointerX(60);
    expect(s.value).toBe(50);
    expect(onChange).toHaveBeenCalledWith(50);
    // Beyond the ends clamps.
    expect(s.valueFromPointerX(-999)).toBe(0);
    expect(s.valueFromPointerX(9999)).toBe(100);
  });

  it("nudge moves by one step (or 1/100 of the range when continuous)", () => {
    const stepped = slider({ min: 0, max: 10, value: 4, step: 2 });
    stepped.nudge(1);
    expect(stepped.value).toBe(6);
    stepped.nudge(-1);
    expect(stepped.value).toBe(4);

    const cont = slider({ min: 0, max: 100, value: 50 });
    cont.nudge(1);
    expect(cont.value).toBe(51); // 1/100 of [0,100]
  });

  it("disabled slider ignores pointer + keyboard input", () => {
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, state: "disabled", layout: { width: 100 } });
    computeLayout(s, 0, 0, DEFAULT_THEME);
    s.setValueFromPointerX(50);
    s.nudge(1);
    expect(s.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("setValue clamps and snaps, returns true only when value changes", () => {
    const s = slider({ min: 0, max: 10, value: 4, step: 2 });
    // Snapping: 3 rounds to 4 (no change).
    expect(s.setValue(3)).toBe(false);
    expect(s.value).toBe(4);
    // Snapping: 5 rounds to 6 (change).
    expect(s.setValue(5)).toBe(true);
    expect(s.value).toBe(6);
    // Clamping above max.
    expect(s.setValue(999)).toBe(true);
    expect(s.value).toBe(10);
    // Clamping below min.
    expect(s.setValue(-5)).toBe(true);
    expect(s.value).toBe(0);
    // No-op when already at that snapped value.
    expect(s.setValue(0)).toBe(false);
  });

  it("setValue is a no-op on a disabled slider", () => {
    const s = slider({ min: 0, max: 10, value: 4, state: "disabled" });
    expect(s.setValue(8)).toBe(false);
    expect(s.value).toBe(4);
  });
});

describe("slider — render (track + fill + thumb)", () => {
  it("paints a track, a fill up to the thumb, and a state-coloured thumb", () => {
    const { surface, rec } = makeSurface();
    const s = slider({ min: 0, max: 100, value: 50, state: "hover", layout: { width: 100, height: 12 } });
    computeLayout(s, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, s, DEFAULT_THEME);
    surface.end();

    // Track (full width), then fill (half width at value 50), then the thumb in the hover colour.
    expect(rec.quads[0]).toMatchObject({ color: DEFAULT_THEME.sliderTrack, width: 100 });
    expect(rec.quads[1]).toMatchObject({ color: DEFAULT_THEME.sliderFill, width: 50 });
    const thumb = rec.quads[rec.quads.length - 1]!;
    expect(thumb.color).toBe(DEFAULT_THEME.sliderThumb.hover);
  });

  it("thumb rect stays within track bounds at value=min", () => {
    const { surface, rec } = makeSurface();
    const w = 100;
    const h = 12;
    const s = slider({ min: 0, max: 100, value: 0, layout: { width: w, height: h } });
    computeLayout(s, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, s, DEFAULT_THEME);
    surface.end();

    const thumb = rec.quads[rec.quads.length - 1]!;
    // Thumb must start at or after the track left edge (x=0).
    expect(thumb.x).toBeGreaterThanOrEqual(0);
    // Thumb right edge must not exceed the track right edge.
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(w);
  });

  it("thumb rect stays within track bounds at value=max", () => {
    const { surface, rec } = makeSurface();
    const w = 100;
    const h = 12;
    const s = slider({ min: 0, max: 100, value: 100, layout: { width: w, height: h } });
    computeLayout(s, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, s, DEFAULT_THEME);
    surface.end();

    const thumb = rec.quads[rec.quads.length - 1]!;
    expect(thumb.x).toBeGreaterThanOrEqual(0);
    expect(thumb.x + thumb.width).toBeLessThanOrEqual(w);
  });
});

describe("checkbox / toggle — construction, layout + render", () => {
  it("toggle is an alias of checkbox", () => {
    expect(toggle).toBe(checkbox);
  });

  it("toggle() flips checked and fires onChange with the next value", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange });
    expect(c.toggle()).toBe(true);
    expect(c.checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    c.toggle();
    expect(c.checked).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("disabled checkbox does not toggle", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange, state: "disabled" });
    c.toggle();
    expect(c.checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("intrinsic size grows by gap + label width when labelled", () => {
    const bare = checkbox({});
    computeLayout(bare, 0, 0, DEFAULT_THEME);
    const boxOnly = bare.rect.width;

    resetNodeIds();
    const labelled = checkbox({ label: "On" }); // "On" = 11w
    computeLayout(labelled, 0, 0, DEFAULT_THEME);
    expect(labelled.rect.width).toBe(boxOnly + DEFAULT_THEME.gap + 11);
  });

  it("renders box + border and a check mark only when checked", () => {
    const { surface, rec } = makeSurface();
    const checked = checkbox({ checked: true, label: "X" });
    computeLayout(checked, 0, 0, DEFAULT_THEME);
    surface.begin();
    renderTree(surface, checked, DEFAULT_THEME);
    surface.end();
    // border, box fill, check mark, then the label glyph(s).
    expect(rec.quads[0]).toMatchObject({ color: DEFAULT_THEME.checkboxBorder });
    expect(rec.quads[1]).toMatchObject({ color: DEFAULT_THEME.checkboxBox.normal });
    expect(rec.quads.some((q) => q.color === DEFAULT_THEME.checkboxCheck)).toBe(true);

    resetNodeIds();
    const { surface: s2, rec: rec2 } = makeSurface();
    const unchecked = checkbox({ checked: false });
    computeLayout(unchecked, 0, 0, DEFAULT_THEME);
    s2.begin();
    renderTree(s2, unchecked, DEFAULT_THEME);
    s2.end();
    expect(rec2.quads.some((q) => q.color === DEFAULT_THEME.checkboxCheck)).toBe(false);
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
