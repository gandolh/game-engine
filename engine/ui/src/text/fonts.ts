import { UNSCII8_GLYPHS } from "./glyphs/unscii8";
import { UNSCII16_GLYPHS } from "./glyphs/unscii16";
import type { GlyphRows } from "./glyph-types";

export type { GlyphRows } from "./glyph-types";

/**
 * Font selection for `@engine/ui`'s text stack.
 *
 * `@engine/ui` ships two authored pixel fonts (UNSCII, public domain — see
 * `engine/ui/vendor/LICENSE.md`), generated from the vendored `.hex` sources by
 * `engine/ui/tools/hex-to-glyphs.ts` into `./glyphs/unscii8.ts` / `./glyphs/unscii16.ts`:
 *
 *  - {@link BODY_FONT} (unscii-8, 8x8 cell) — the DEFAULT everywhere `measureText`/
 *    `layoutText`/`drawText` are called without an explicit `font`.
 *  - {@link DISPLAY_FONT} (unscii-16, 8x16 cell) — opt in via `{ font: DISPLAY_FONT }` for
 *    headings/large text.
 *
 * Both cover printable ASCII (0x20..0x7e) only, with `"?"` as the fallback glyph for any
 * other character (see {@link glyphRows}). Glyph data is a white/alpha bitmask — colour
 * never appears here, so this module stays clean under the repo-wide palette guard; the
 * caller's `color` tints the mask at draw time (see `./draw`).
 */

/** First / last code points covered (inclusive) by every `@engine/ui` font. Printable ASCII. */
export const FIRST_CODEPOINT = 0x20;
export const LAST_CODEPOINT = 0x7e;

/** Character substituted for any code point outside a font's coverage. */
export const FALLBACK_CHAR = "?";

/** Glyph cell size and layout metrics (screen pixels at scale 1) for one {@link UiFont}. */
export interface FontMetrics {
  /** Glyph cell width, in source pixels. */
  readonly glyphWidth: number;
  /** Glyph cell height, in source pixels. */
  readonly glyphHeight: number;
  /** Horizontal gap between adjacent glyphs, in source pixels. */
  readonly tracking: number;
  /** Advance = glyphWidth + tracking. Width contributed by one char + its trailing gap. */
  readonly advance: number;
  /** Baseline-to-baseline line height, in source pixels. */
  readonly lineHeight: number;
}

/**
 * A selectable `@engine/ui` font: its glyph table + layout metrics, bundled together so a
 * caller passes one value (`{ font: DISPLAY_FONT }`) instead of juggling matching metrics
 * and glyphs by hand. `id` disambiguates the baked atlas each font gets (see
 * {@link fontAtlasId}) — two fonts never share one atlas since their cell sizes differ.
 */
export interface UiFont {
  readonly id: string;
  readonly metrics: FontMetrics;
  readonly glyphs: Record<string, GlyphRows>;
}

/** unscii-8: 8x8 cell. The default body-copy font. */
export const BODY_FONT: UiFont = {
  id: "body",
  metrics: {
    glyphWidth: 8,
    glyphHeight: 8,
    tracking: 1,
    advance: 9,
    lineHeight: 10,
  },
  glyphs: UNSCII8_GLYPHS,
};

/** unscii-16: 8x16 cell. For headings / large display text. */
export const DISPLAY_FONT: UiFont = {
  id: "display",
  metrics: {
    glyphWidth: 8,
    glyphHeight: 16,
    tracking: 1,
    advance: 9,
    lineHeight: 18,
  },
  glyphs: UNSCII16_GLYPHS,
};

/** The font every text API uses when the caller doesn't pass one explicitly. */
export const DEFAULT_FONT: UiFont = BODY_FONT;

/** Atlas id a given font's baked sheet is registered under (see `bakeFontAtlas`/`loadFontAtlas`). */
export function fontAtlasId(font: UiFont): string {
  return `ui-font-${font.id}`;
}

/** Rows for `char` in `font`, falling back to `FALLBACK_CHAR` for anything outside coverage. */
export function glyphRows(font: UiFont, char: string): GlyphRows {
  return font.glyphs[char] ?? font.glyphs[FALLBACK_CHAR]!;
}

/** Every covered character in code-point order — drives the deterministic atlas layout. */
export function allChars(): string[] {
  const out: string[] = [];
  for (let cp = FIRST_CODEPOINT; cp <= LAST_CODEPOINT; cp += 1) {
    out.push(String.fromCharCode(cp));
  }
  return out;
}
