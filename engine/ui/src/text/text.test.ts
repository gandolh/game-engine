import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EDG } from "@engine/core/render";
import type { UIQuad } from "@engine/core/render";
import { UISurface } from "../render/ui-surface";
import { bakeFontAtlas, frameNameFor } from "./font";
import { allChars, BODY_FONT, DISPLAY_FONT, fontAtlasId, glyphRows, setMissingGlyphReporter } from "./fonts";
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
  it("covers every allChars() glyph (printable ASCII + Romanian diacritics) with a frame each", () => {
    const baked = bakeFontAtlas(font);
    for (const ch of allChars()) {
      expect(baked.manifest.frames[frameNameFor(ch)]).toBeDefined();
    }
    // One frame per covered char, no more, no fewer — guards the codepoint→frame mapping against
    // the contiguous-range assumption that broke when diacritics were appended after ASCII.
    expect(Object.keys(baked.manifest.frames)).toHaveLength(allChars().length);
    // The Romanian diacritics specifically must be present (comma-below ș/ț included).
    for (const ch of ["ă", "â", "î", "ș", "ț", "Ă", "Â", "Î", "Ș", "Ț"]) {
      expect(baked.manifest.frames[frameNameFor(ch)], `missing frame for ${ch}`).toBeDefined();
    }
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
  // The fallback now REPORTS (playtest-08); silence it so these deliberate misses stay quiet.
  beforeEach(() => setMissingGlyphReporter(null));
  afterEach(() => setMissingGlyphReporter((m) => console.warn(m)));

  it("falls back to '?' for a character outside printable ASCII", () => {
    expect(glyphRows(BODY_FONT, "é")).toBe(glyphRows(BODY_FONT, "?"));
    expect(glyphRows(DISPLAY_FONT, "é")).toBe(glyphRows(DISPLAY_FONT, "?"));
  });
});

/**
 * playtest-08 (2026-09-20) — a missing glyph must SAY so.
 *
 * Three drawn strings in two games used code points the font never baked, and the substitution was
 * silent, so MateQuest's map-pan hints rendered nothing for the whole life of the feature. This is
 * the choke point every drawn character passes through, so reporting here catches the class exactly
 * when it happens and needs no source scan or allowlist.
 */
describe("missing-glyph reporting", () => {
  afterEach(() => setMissingGlyphReporter((m) => console.warn(m)));

  it("reports an uncovered code point once, naming it and how to fix it", () => {
    const seen: string[] = [];
    setMissingGlyphReporter((m) => seen.push(m));

    // U+2039 is the guillemet MateQuest used for its scroll hints; UNSCII has no such glyph.
    glyphRows(BODY_FONT, "\u2039");
    glyphRows(BODY_FONT, "\u2039"); // again: must NOT warn twice
    glyphRows(BODY_FONT, "\u2039");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("U+2039");
    expect(seen[0]).toContain("EXTRA_CODEPOINTS");
  });

  it("says nothing for a covered code point", () => {
    const seen: string[] = [];
    setMissingGlyphReporter((m) => seen.push(m));
    // The glyphs the games actually draw, including the three baked for playtest-08.
    for (const ch of ["A", "×", "†", "★", "♥", "✓", "◆", "←", "→", "·", "—", "…", "ș", "ț", "Ă"]) {
      glyphRows(BODY_FONT, ch);
    }
    expect(seen).toEqual([]);
  });

  it("every character the repo's covered set claims is genuinely baked in BOTH fonts", () => {
    const seen: string[] = [];
    setMissingGlyphReporter((m) => seen.push(m));
    for (const ch of allChars()) {
      glyphRows(BODY_FONT, ch);
      glyphRows(DISPLAY_FONT, ch);
    }
    // A code point listed in EXTRA_CODEPOINTS but absent from the vendored .hex would surface here
    // rather than as a "?" on someone's screen.
    expect(seen).toEqual([]);
  });
});
