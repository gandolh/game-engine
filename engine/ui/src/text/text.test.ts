import { describe, expect, it } from "vitest";
import { EDG } from "@engine/core/render";
import type { UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { DEFAULT_FONT_METRICS, bakeFontAtlas, FONT_ATLAS_ID, frameNameFor } from "./font";
import { allChars } from "./glyphs";
import { measureText, layoutText } from "./layout";
import { drawText, layoutTextQuads } from "./draw";

const M = DEFAULT_FONT_METRICS;

describe("measureText", () => {
  it("is empty for the empty string", () => {
    expect(measureText("")).toBe(0);
  });

  it("measures n glyphs as n*glyphWidth + (n-1)*tracking", () => {
    // "Hi" = 2 glyphs: 2*5 + 1*1 = 11 at scale 1.
    expect(measureText("Hi")).toBe(2 * M.glyphWidth + 1 * M.tracking);
    expect(measureText("Hi")).toBe(11);
  });

  it("scales linearly with an integer scale", () => {
    expect(measureText("Hello", { scale: 3 })).toBe(measureText("Hello") * 3);
  });

  it("counts spaces as glyph cells (monospaced advance)", () => {
    expect(measureText("a b")).toBe(measureText("abc"));
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
    // Each word "aaa" = 3 glyphs = 17px; "aaa aaa" = 7 cells = 41px.
    // maxWidth 20 fits one word per line.
    const l = layoutText("aaa aaa aaa", { maxWidth: 20 });
    expect(l.lines.map((x) => x.text)).toEqual(["aaa", "aaa", "aaa"]);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(20);
  });

  it("packs as many words as fit per line", () => {
    // "aa bb" = 5 cells = 29px fits in 30; adding " cc" (8 cells) does not.
    const l = layoutText("aa bb cc", { maxWidth: 30 });
    expect(l.lines.map((x) => x.text)).toEqual(["aa bb", "cc"]);
  });

  it("hard-breaks a single word longer than maxWidth", () => {
    // "wwwwww" with maxWidth ~ 2 glyphs (11px) must break, never overflow.
    const l = layoutText("wwwwww", { maxWidth: 11 });
    expect(l.lines.length).toBeGreaterThan(1);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(11);
    expect(l.lines.map((x) => x.text).join("")).toBe("wwwwww");
  });

  it("reports the widest line as the block width", () => {
    const l = layoutText("aaaa\nb", { maxWidth: Infinity });
    expect(l.width).toBe(measureText("aaaa"));
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
      atlasId: FONT_ATLAS_ID,
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
    expect(pushed.every((q) => q.color === EDG.green && q.atlasId === FONT_ATLAS_ID)).toBe(true);
  });
});

describe("bakeFontAtlas determinism + coverage", () => {
  it("covers all printable ASCII with a frame each", () => {
    const baked = bakeFontAtlas();
    for (const ch of allChars()) {
      expect(baked.manifest.frames[frameNameFor(ch)]).toBeDefined();
    }
    expect(Object.keys(baked.manifest.frames)).toHaveLength(0x7e - 0x20 + 1);
  });

  it("produces a byte-identical raster on repeated bakes", () => {
    const a = bakeFontAtlas();
    const b = bakeFontAtlas();
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.rgba.length).toBe(b.rgba.length);
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it("bakes glyphs as opaque white masks (alpha 255, white RGB where lit)", () => {
    const baked = bakeFontAtlas();
    // The 'A' glyph (frame g41) has its top-row middle pixels lit; sample a known lit pixel.
    // Row 0 of 'A' is 0b01110 — columns 1..3 lit. Cell x for 'A' = (0x41-0x20)*glyphWidth.
    const cellX = (0x41 - 0x20) * baked.metrics.glyphWidth;
    const litX = cellX + 2; // a lit column on row 0
    const o = (0 * baked.width + litX) * 4;
    expect(baked.rgba[o]).toBe(255);
    expect(baked.rgba[o + 1]).toBe(255);
    expect(baked.rgba[o + 2]).toBe(255);
    expect(baked.rgba[o + 3]).toBe(255);
    // A space glyph (g20) is fully transparent.
    const spaceO = (0 * baked.width + 2) * 4; // first cell is ' '
    expect(baked.rgba[spaceO + 3]).toBe(0);
  });
});
