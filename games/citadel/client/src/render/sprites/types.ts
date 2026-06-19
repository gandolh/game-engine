/**
 * Citadel-local pixel-art recipe type.
 *
 * Mirrors Farm Valley's `PixelRecipe` shape but is intentionally NOT imported
 * from `@farm/atlas-recipes` — the dependency rule forbids one game importing
 * the other. A recipe is an ASCII pixel grid: `pixels[row]` is a string whose
 * characters index the EDG-derived `SWATCH` map (`palette.ts`); `.` is
 * transparent. Each row must be exactly `width` chars; there must be `height`
 * rows.
 */
export interface PixelRecipe {
  /** Frame name in the generated atlas, e.g. `bld/house`, `vil/person`. */
  readonly name: string;
  /** Grid width in pixels (= chars per row). */
  readonly width: number;
  /** Grid height in pixels (= number of rows). */
  readonly height: number;
  /** One string per row, top to bottom; each char is a SWATCH key. */
  readonly pixels: readonly string[];
}
