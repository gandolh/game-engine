/**
 * Shared glyph-row type for `@engine/ui`'s bitmap fonts.
 *
 * Kept in its own leaf module (no imports) so both the generated glyph tables
 * (`./glyphs/unscii8.ts`, `./glyphs/unscii16.ts`) and `./fonts.ts` (which assembles them
 * into `UiFont` records) can depend on it without a cycle.
 */

/**
 * One row bitmask per glyph row (length === the font's `metrics.glyphHeight`), MSB-first
 * across `metrics.glyphWidth` bits: bit `1 << (glyphWidth - 1 - col)` set means that column
 * is lit on that row.
 */
export type GlyphRows = readonly number[];
