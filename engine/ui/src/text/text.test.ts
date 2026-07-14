import { describe, expect, it } from "vitest";
import { EDG } from "@engine/core/render";
import type { UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { bakeFontAtlas, frameNameFor } from "./font";
import { allChars, BODY_FONT, DISPLAY_FONT, fontAtlasId, glyphRows } from "./fonts";
import { measureText, layoutText } from "./layout";
import { drawText, layoutTextQuads } from "./draw";

const M = BODY_FONT.metrics;

describe("measureText", () => {
  it("is empty for the empty string", () => {
    expect(measureText("")).toBe(0);
  });

  it("measures n glyphs as n*glyphWidth + (n-1)*tracking", () => {
    // "Hi" = 2 glyphs: 2*8 + 1*1 = 17 at scale 1 (body font: unscii-8, 8px wide).
    expect(measureText("Hi")).toBe(2 * M.glyphWidth + 1 * M.tracking);
    expect(measureText("Hi")).toBe(17);
  });

  it("scales linearly with an integer scale", () => {
    expect(measureText("Hello", { scale: 3 })).toBe(measureText("Hello") * 3);
  });

  it("counts spaces as glyph cells (monospaced advance)", () => {
    expect(measureText("a b")).toBe(measureText("abc"));
  });

  it("measures against the display font when passed explicitly", () => {
    // Same advance metrics (8w/1 tracking) as body — unscii-8 and unscii-16 share glyph
    // width, only the cell height differs — so the width formula is identical.
    expect(measureText("Hi", { font: DISPLAY_FONT })).toBe(measureText("Hi", { font: BODY_FONT }));
  });
});

describe("layoutText word-wrap", () => {
  it("returns the whole string as one line when no maxWidth", () => {
    const l = layoutText("the quick brown fox");
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]!.text).toBe("the quick brown fox");
    expect(l.width).toBe(measureText("the quick brown fox"));
  });

  it("breaks on explicit newlines", () => {
    const l = layoutText("ab\ncd");
    expect(l.lines.map((x) => x.text)).toEqual(["ab", "cd"]);
    expect(l.height).toBe(2 * M.lineHeight);
  });

  it("greedily wraps words to maxWidth", () => {
    // Each word "aaa" = 3 glyphs = 26px; "aaa aaa" = 7 cells = 62px.
    // maxWidth 30 fits one word per line.
    const l = layoutText("aaa aaa aaa", { maxWidth: 30 });
    expect(l.lines.map((x) => x.text)).toEqual(["aaa", "aaa", "aaa"]);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(30);
  });

  it("packs as many words as fit per line", () => {
    // "aa bb" = 5 cells = 41px fits in 45; adding " cc" (8 cells) does not.
    const l = layoutText("aa bb cc", { maxWidth: 45 });
    expect(l.lines.map((x) => x.text)).toEqual(["aa bb", "cc"]);
  });

  it("hard-breaks a single word longer than maxWidth", () => {
    // "wwwwww" with maxWidth ~ 2 glyphs (17px) must break, never overflow.
    const l = layoutText("wwwwww", { maxWidth: 17 });
    expect(l.lines.length).toBeGreaterThan(1);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(17);
    expect(l.lines.map((x) => x.text).join("")).toBe("wwwwww");
  });

  it("reports the widest line as the block width", () => {
    const l = layoutText("aaaa\nb", { maxWidth: Infinity });
    expect(l.width).toBe(measureText("aaaa"));
  });

  it("defaults to the body font, and threads an explicit font through to the layout result", () => {
    expect(layoutText("hi").font).toBe(BODY_FONT);
    const l = layoutText("hi", { font: DISPLAY_FONT });
    expect(l.font).toBe(DISPLAY_FONT);
    expect(l.lineHeight).toBe(DISPLAY_FONT.metrics.lineHeight);
  });
});

describe("layoutTextQuads / drawText", () => {
  it("emits one quad per visible glyph at the right pen positions", () => {
    const { quads } = layoutTextQuads("Hi", 100, 50, { color: EDG.gold });
    expect(quads).toHaveLength(2);
    expect(quads[0]).toMatchObject({
      x: 100,
      y: 50,
      width: M.glyphWidth,
      height: M.glyphHeight,
      atlasId: fontAtlasId(BODY_FONT),
      frame: frameNameFor("H"),
      color: EDG.gold,
    });
    // Second glyph advances by glyphWidth + tracking.
    expect(quads[1]!.x).toBe(100 + M.advance);
    expect(quads[1]!.frame).toBe(frameNameFor("i"));
  });

  it("skips spaces (no quad) but still advances the pen", () => {
    const { quads } = layoutTextQuads("a b", 0, 0, { color: EDG.white });
    expect(quads).toHaveLength(2);
    expect(quads[0]!.x).toBe(0);
    // 'b' sits two advances along (after 'a' and the space).
    expect(quads[1]!.x).toBe(2 * M.advance);
  });

  it("places wrapped lines on successive baselines", () => {
    const { quads, layout } = layoutTextQuads("aa\nbb", 10, 20, { color: EDG.red });
    expect(layout.lines).toHaveLength(2);
    const line2 = quads.filter((q) => q.y === 20 + M.lineHeight);
    expect(line2).toHaveLength(2);
  });

  it("drawText pushes exactly the computed quads through the surface", () => {
    const pushed: UIQuad[] = [];
    const fakeRenderer = {
      beginUI() {},
      pushUI(q: UIQuad) {
        pushed.push(q);
      },
      endUI() {},
    };
    const surface = new UISurface(fakeRenderer as never);
    surface.begin();
    drawText(surface, "Go", 5, 5, { color: EDG.green });
    surface.end();
    expect(pushed).toHaveLength(2);
    expect(pushed.every((q) => q.color === EDG.green && q.atlasId === fontAtlasId(BODY_FONT))).toBe(true);
  });

  it("emits quads sized to the display font, on its own atlas, when selected", () => {
    const { quads } = layoutTextQuads("Hi", 0, 0, { color: EDG.white, font: DISPLAY_FONT });
    expect(quads).toHaveLength(2);
    expect(quads[0]).toMatchObject({
      width: DISPLAY_FONT.metrics.glyphWidth,
      height: DISPLAY_FONT.metrics.glyphHeight,
      atlasId: fontAtlasId(DISPLAY_FONT),
    });
    expect(fontAtlasId(DISPLAY_FONT)).not.toBe(fontAtlasId(BODY_FONT));
  });
});

describe.each([
  ["body (unscii-8)", BODY_FONT],
  ["display (unscii-16)", DISPLAY_FONT],
] as const)("bakeFontAtlas determinism + coverage — %s", (_label, font) => {
  it("covers all printable ASCII with a frame each", () => {
    const baked = bakeFontAtlas(font);
    for (const ch of allChars()) {
      expect(baked.manifest.frames[frameNameFor(ch)]).toBeDefined();
    }
    expect(Object.keys(baked.manifest.frames)).toHaveLength(0x7e - 0x20 + 1);
  });

  it("produces a byte-identical raster on repeated bakes", () => {
    const a = bakeFontAtlas(font);
    const b = bakeFontAtlas(font);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.rgba.length).toBe(b.rgba.length);
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it("bakes glyphs as opaque white masks (alpha 255, white RGB where lit), space fully transparent", () => {
    const baked = bakeFontAtlas(font);
    // The 'A' glyph (frame g41): sample its first lit pixel via the glyph table directly
    // (rather than hard-coding a row/column, which would silently drift if the source .hex
    // changes, or if a taller cell like unscii-16 pads blank rows above the glyph).
    const cellX = (0x41 - 0x20) * font.metrics.glyphWidth;
    const rows = glyphRows(font, "A");
    let litRow = -1;
    let litCol = -1;
    for (let r = 0; r < font.metrics.glyphHeight && litRow < 0; r += 1) {
      const mask = rows[r]!;
      for (let c = 0; c < font.metrics.glyphWidth; c += 1) {
        if ((mask & (1 << (font.metrics.glyphWidth - 1 - c))) !== 0) {
          litRow = r;
          litCol = c;
          break;
        }
      }
    }
    expect(litRow).toBeGreaterThanOrEqual(0); // sanity: 'A' does light something
    const o = (litRow * baked.width + cellX + litCol) * 4;
    expect(baked.rgba[o]).toBe(255);
    expect(baked.rgba[o + 1]).toBe(255);
    expect(baked.rgba[o + 2]).toBe(255);
    expect(baked.rgba[o + 3]).toBe(255);
    // A space glyph (g20) is fully transparent.
    const spaceO = (0 * baked.width + 2) * 4; // first cell is ' '
    expect(baked.rgba[spaceO + 3]).toBe(0);
  });

  it("bakes onto that font's own atlas id", () => {
    const baked = bakeFontAtlas(font);
    expect(baked.manifest.id).toBe(fontAtlasId(font));
    expect(baked.font).toBe(font);
  });
});

describe("glyphRows fallback", () => {
  it("falls back to '?' for a character outside printable ASCII", () => {
    expect(glyphRows(BODY_FONT, "é")).toBe(glyphRows(BODY_FONT, "?"));
    expect(glyphRows(DISPLAY_FONT, "é")).toBe(glyphRows(DISPLAY_FONT, "?"));
  });
});
