import type { AtlasManifest } from "@engine/core/assets";
import { EDG, rgbOf } from "@engine/core/render";
import {
  FIRST_CODEPOINT,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  allChars,
  glyphRows,
} from "./glyphs";

/**
 * Deterministic bitmap-font definition for `@engine/ui`.
 *
 * The font is the built-in 5×7 ASCII raster in {@link ./glyphs}. {@link bakeFontAtlas}
 * turns that raster into an `AtlasManifest` + RGBA pixel buffer (white/alpha mask),
 * which {@link makeBakedFontAtlas} wraps as a `LoadedAtlasImage`-shaped handle that the
 * renderer's textured-quad path can blit + tint. Because the source raster is a code
 * literal and the bake is pure, the same input yields a byte-identical buffer on every
 * machine and run — there is no platform font measurement and no binary asset to ship.
 */

/** Atlas id under which the baked font sheet is registered with the renderer. */
export const FONT_ATLAS_ID = "ui-font";

/** Glyph cell size and layout metrics (screen pixels at scale 1). */
export interface FontMetrics {
  /** Lit-cell width of a glyph, in source pixels. */
  readonly glyphWidth: number;
  /** Lit-cell height of a glyph, in source pixels. */
  readonly glyphHeight: number;
  /** Horizontal gap between adjacent glyphs, in source pixels. */
  readonly tracking: number;
  /** Advance = glyphWidth + tracking. Width contributed by one char + its trailing gap. */
  readonly advance: number;
  /** Baseline-to-baseline line height, in source pixels. */
  readonly lineHeight: number;
}

export const DEFAULT_FONT_METRICS: FontMetrics = {
  glyphWidth: GLYPH_WIDTH,
  glyphHeight: GLYPH_HEIGHT,
  tracking: 1,
  advance: GLYPH_WIDTH + 1,
  lineHeight: GLYPH_HEIGHT + 2,
};

/** Frame name for a single character in the baked atlas. */
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
  readonly metrics: FontMetrics;
}

/**
 * Deterministically bake the built-in font into an RGBA raster + manifest.
 *
 * Layout: all printable-ASCII glyphs are packed left-to-right into a single row of
 * `glyphWidth × glyphHeight` cells. Lit pixels are written as opaque white
 * (`EDG.white`, alpha 255); everything else is transparent. The byte layout depends only
 * on the glyph table, so two bakes are identical.
 */
export function bakeFontAtlas(metrics: FontMetrics = DEFAULT_FONT_METRICS): BakedFont {
  const chars = allChars();
  const cols = chars.length;
  const width = cols * metrics.glyphWidth;
  const height = metrics.glyphHeight;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // White RGB from the palette (avoids a raw colour literal → palette guard stays clean).
  const [wr, wg, wb] = rgbOf(EDG.white);

  const frames: AtlasManifest["frames"] = {};
  for (let i = 0; i < cols; i += 1) {
    const char = chars[i]!;
    const cp = FIRST_CODEPOINT + i;
    const rows = glyphRows(char);
    const cellX = i * metrics.glyphWidth;
    for (let ry = 0; ry < metrics.glyphHeight; ry += 1) {
      const mask = rows[ry] ?? 0;
      for (let rx = 0; rx < metrics.glyphWidth; rx += 1) {
        const lit = (mask & (1 << (metrics.glyphWidth - 1 - rx))) !== 0;
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
      w: metrics.glyphWidth,
      h: metrics.glyphHeight,
    };
  }

  const manifest: AtlasManifest = {
    id: FONT_ATLAS_ID,
    imageUrl: "",
    width,
    height,
    frames,
  };

  return { manifest, rgba, width, height, metrics };
}
