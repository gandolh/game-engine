import type { AtlasManifest } from "@engine/core/assets";
import { EDG, rgbOf } from "@engine/core/render";
import { allChars, DEFAULT_FONT, fontAtlasId, FIRST_CODEPOINT, glyphRows, type UiFont } from "./fonts";

/**
 * Deterministic bitmap-font baking for `@engine/ui`.
 *
 * {@link bakeFontAtlas} turns a {@link UiFont} (glyph table + metrics, see `./fonts`) into
 * an `AtlasManifest` + RGBA pixel buffer (white/alpha mask), which {@link makeBakedFontAtlas}
 * (in `./font-atlas`) wraps as a `LoadedAtlasImage`-shaped handle the renderer's
 * textured-quad path can blit + tint. Because the source glyph tables are code literals
 * and the bake is pure, the same input yields a byte-identical buffer on every machine and
 * run — there is no platform font measurement and no binary asset to ship.
 */

/** Frame name for a single character in the baked atlas. Same across every font's atlas. */
export function frameNameFor(char: string): string {
  // Code-point hex keeps frame names ASCII-safe and stable (e.g. " " → "g20").
  return `g${char.charCodeAt(0).toString(16)}`;
}

/** A baked font: the raw RGBA raster + the atlas manifest describing its glyph frames. */
export interface BakedFont {
  readonly manifest: AtlasManifest;
  /** Tightly-packed RGBA8 (width*height*4) pixel buffer. White where a glyph is lit. */
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** The font this raster was baked from (glyph table + metrics). */
  readonly font: UiFont;
}

/**
 * Deterministically bake `font` (default {@link DEFAULT_FONT}, i.e. the body font) into an
 * RGBA raster + manifest.
 *
 * Layout: all printable-ASCII glyphs are packed left-to-right into a single row of
 * `font.metrics.glyphWidth × glyphHeight` cells. Lit pixels are written as opaque white
 * (`EDG.white`, alpha 255); everything else is transparent. The byte layout depends only
 * on the glyph table, so two bakes of the same font are identical. Each font gets its own
 * atlas id (see {@link fontAtlasId}) so body and display atlases never collide.
 */
export function bakeFontAtlas(font: UiFont = DEFAULT_FONT): BakedFont {
  const chars = allChars();
  const cols = chars.length;
  const { glyphWidth, glyphHeight } = font.metrics;
  const width = cols * glyphWidth;
  const height = glyphHeight;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // White RGB from the palette (avoids a raw colour literal → palette guard stays clean).
  const [wr, wg, wb] = rgbOf(EDG.white);

  const frames: AtlasManifest["frames"] = {};
  for (let i = 0; i < cols; i += 1) {
    const char = chars[i]!;
    const cp = FIRST_CODEPOINT + i;
    const rows = glyphRows(font, char);
    const cellX = i * glyphWidth;
    for (let ry = 0; ry < glyphHeight; ry += 1) {
      const mask = rows[ry] ?? 0;
      for (let rx = 0; rx < glyphWidth; rx += 1) {
        const lit = (mask & (1 << (glyphWidth - 1 - rx))) !== 0;
        if (!lit) continue;
        const px = cellX + rx;
        const o = (ry * width + px) * 4;
        rgba[o] = wr;
        rgba[o + 1] = wg;
        rgba[o + 2] = wb;
        rgba[o + 3] = 255;
      }
    }
    frames[frameNameFor(String.fromCharCode(cp))] = {
      x: cellX,
      y: 0,
      w: glyphWidth,
      h: glyphHeight,
    };
  }

  const manifest: AtlasManifest = {
    id: fontAtlasId(font),
    imageUrl: "",
    width,
    height,
    frames,
  };

  return { manifest, rgba, width, height, font };
}
