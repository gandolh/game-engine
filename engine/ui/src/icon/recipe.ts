/**
 * Icon source format for `@engine/ui`'s icon pipeline.
 *
 * An {@link IconRecipe} is an ASCII pixel grid, in the spirit of Citadel's
 * `PixelRecipe` (`games/citadel/client/src/render/sprites/types.ts`) — but where a Citadel
 * recipe char indexes a *palette* (baked-in colour), an icon recipe char indexes a **shade**
 * (`.`/`1`/`2`/`3`). Colour never appears in an icon: `@engine/ui` is shared by two games
 * with different palettes (EDG32 for the engine + Farm, Apollo-46 for Citadel), and the
 * repo-wide palette guard forbids a raw hex literal here anyway. The CONSUMER supplies a
 * 3-colour ramp from its own palette at draw time (see `./draw`); this module only ever
 * emits shade *indices*.
 *
 * `pixels[row]` is a string whose characters must each be one of {@link SHADE_CHARS}; every
 * row must be exactly `width` chars and there must be `height` rows — {@link validateIconRecipe}
 * checks both and throws loudly (a typo must fail at boot/test, never render garbage), mirroring
 * `rasterizeRecipe`'s rectangular-grid check in the Citadel sprite pipeline.
 */

/** One shade cell in an icon recipe. `.` = transparent; `1`/`2`/`3` = dark/mid/light. */
export const SHADE_CHARS = [".", "1", "2", "3"] as const;
export type ShadeChar = (typeof SHADE_CHARS)[number];

/** Numeric shade index: 0 = transparent (no pixel), 1/2/3 = dark/mid/light ramp slot. */
export type ShadeIndex = 0 | 1 | 2 | 3;
/** The three *paintable* shade indices (excludes transparent) — one per ramp colour. */
export type PaintedShade = 1 | 2 | 3;
export const PAINTED_SHADES: readonly PaintedShade[] = [1, 2, 3];

const SHADE_INDEX: Readonly<Record<ShadeChar, ShadeIndex>> = { ".": 0, "1": 1, "2": 2, "3": 3 };

/** An ASCII-grid icon source: a name + a rectangular grid of shade chars. */
export interface IconRecipe {
  /** Icon name, used as the atlas frame key stem (see `frameNameForIcon`). */
  readonly name: string;
  /** Grid width in pixels (= chars per row). */
  readonly width: number;
  /** Grid height in pixels (= number of rows). */
  readonly height: number;
  /** One string per row, top to bottom; each char is a {@link ShadeChar}. */
  readonly pixels: readonly string[];
}

/** Look up the shade index for one character of `recipe`, throwing on an unknown char. */
export function shadeIndexOf(recipe: IconRecipe, ch: string): ShadeIndex {
  const idx = SHADE_INDEX[ch as ShadeChar];
  if (idx === undefined) {
    throw new Error(
      `icon recipe "${recipe.name}": invalid shade char "${ch}" ` +
        `(expected one of ${SHADE_CHARS.map((c) => `"${c}"`).join(", ")})`,
    );
  }
  return idx;
}

/**
 * Validate that `recipe`'s grid is well-formed: exactly `height` rows, every row exactly
 * `width` chars, every char a known {@link ShadeChar}. Throws with a precise row/column on
 * the first violation — called eagerly at module load for every built-in icon (see
 * `./icons`) so a malformed recipe fails at import time, not at draw time.
 */
export function validateIconRecipe(recipe: IconRecipe): void {
  const { name, width, height, pixels } = recipe;
  if (pixels.length !== height) {
    throw new Error(`icon recipe "${name}": expected ${height} rows, got ${pixels.length}`);
  }
  for (let y = 0; y < height; y += 1) {
    const row = pixels[y]!;
    if (row.length !== width) {
      throw new Error(`icon recipe "${name}": row ${y} has ${row.length} chars, expected ${width}`);
    }
    for (let x = 0; x < width; x += 1) {
      shadeIndexOf(recipe, row[x]!); // throws on an unknown shade char
    }
  }
}
