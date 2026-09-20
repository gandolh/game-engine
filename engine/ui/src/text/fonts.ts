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
 * Both cover printable ASCII (0x20..0x7e) plus the Romanian diacritics in
 * {@link EXTRA_CODEPOINTS}, with `"?"` as the fallback glyph for any other character (see
 * {@link glyphRows}). Glyph data is a white/alpha bitmask — colour never appears here, so this
 * module stays clean under the repo-wide palette guard; the caller's `color` tints the mask at
 * draw time (see `./draw`).
 */

/** First / last code points of the base ASCII coverage (inclusive) for every `@engine/ui` font. */
export const FIRST_CODEPOINT = 0x20;
export const LAST_CODEPOINT = 0x7e;

/**
 * Non-ASCII code points also covered, in two groups (all present in the vendored UNSCII):
 *  - Romanian diacritics — the correct comma-below ș/ț (U+0218..U+021B), not cedilla: Ă ă Â â Î î Ș ș Ț ț.
 *  - Common UI symbols: × (mult), † (dagger), ★ (star), ♥ (heart), ♠ (spade), ✓ (check),
 *    ◆ (diamond), ← → (arrows), · (middot), — (em dash), … (ellipsis).
 * Kept in sync with `EXTRA_CODEPOINTS` in `engine/ui/tools/hex-to-glyphs.ts` (the generator that
 * bakes these into the glyph tables). Extending this list requires re-running that generator.
 */
export const EXTRA_CODEPOINTS: readonly number[] = [
  0x102, 0x103, 0x0c2, 0x0e2, 0x0ce, 0x0ee, 0x218, 0x219, 0x21a, 0x21b,
  0x0d7, 0x2020, 0x2605, 0x2665, 0x2660, 0x2713, 0x25c6, 0x2190, 0x2192,
  0x0b7, 0x2014, 0x2026,
];

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

/**
 * Uncovered code points already warned about, so the warning below is at most one line per glyph
 * for the life of the process rather than one per frame.
 */
const warnedMissing = new Set<string>();

/**
 * Silence (or capture) the missing-glyph warning — pass `null` to drop it, or a function to route it
 * somewhere else. Tests that deliberately exercise the fallback use this so a passing run stays
 * quiet. Default is `console.warn`.
 */
export function setMissingGlyphReporter(report: ((message: string) => void) | null): void {
  missingGlyphReporter = report;
}
let missingGlyphReporter: ((message: string) => void) | null = (message) => {
  console.warn(message);
};

/**
 * Rows for `char` in `font`, falling back to `FALLBACK_CHAR` for anything outside coverage.
 *
 * The fallback is also **reported, once per glyph** (playtest-08, 2026-09-20), because a silent
 * substitution is how three of these shipped. MateQuest drew its map-pan hints with `‹`/`›`, which
 * the vendored UNSCII does not carry at all, so the affordance existed and rendered *nothing* for
 * the whole life of the feature — a playtest read it as "the map gives no sign it pans". Citadel's
 * road-drag readout drew `—` and `·`, which UNSCII does have and the font simply had not baked.
 *
 * A source scan cannot catch this class reliably (the same literals appear in comments, DOM text and
 * test names, where any code point is fine), but this choke point can: it fires exactly when a glyph
 * is really drawn, so it has no false positives and needs no allowlist. Farm's `right-column.ts`
 * carries a comment warning the next person that non-ASCII "would render as `?`" — that knowledge is
 * now enforced instead of remembered.
 */
export function glyphRows(font: UiFont, char: string): GlyphRows {
  const rows = font.glyphs[char];
  if (rows !== undefined) return rows;
  const key = `${font.id}:${char}`;
  if (missingGlyphReporter !== null && !warnedMissing.has(key)) {
    warnedMissing.add(key);
    const cp = char.codePointAt(0) ?? 0;
    missingGlyphReporter(
      `@engine/ui: font "${font.id}" has no glyph for ${JSON.stringify(char)} ` +
        `(U+${cp.toString(16).toUpperCase().padStart(4, "0")}) — drawing "${FALLBACK_CHAR}" instead. ` +
        `Add the code point to EXTRA_CODEPOINTS and re-run tools/hex-to-glyphs.ts, or use a covered character.`,
    );
  }
  return font.glyphs[FALLBACK_CHAR]!;
}

/** Every covered character in code-point order — drives the deterministic atlas layout.
 * Printable ASCII followed by the Romanian {@link EXTRA_CODEPOINTS}, both ascending. */
export function allChars(): string[] {
  const cps = new Set<number>();
  for (let cp = FIRST_CODEPOINT; cp <= LAST_CODEPOINT; cp += 1) cps.add(cp);
  for (const cp of EXTRA_CODEPOINTS) cps.add(cp);
  return [...cps].sort((a, b) => a - b).map((cp) => String.fromCharCode(cp));
}
