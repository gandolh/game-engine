/** One sprite as a grid of characters, each a key of `SWATCH` (`palette.ts`). The cook's `AtlasRecipe`. */
export interface PixelRecipe {
  name: string;
  size: number;
  width?: number;
  height?: number;
  /** One string per row, top to bottom. The bottom row is the creature's ground line. */
  pixels: readonly string[];
}
