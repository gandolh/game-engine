export interface PixelRecipe {
  name: string;
  /**
   * Square frame side in pixels for the common case. For non-square (big multi-
   * tile) sprites, set `width`/`height` explicitly and `size` is ignored for
   * layout; each pixels row must then be `width` chars and there must be
   * `height` rows. Defaults: width = height = size.
   */
  size: number;
  /** Optional explicit frame width (px). Defaults to `size`. */
  width?: number;
  /** Optional explicit frame height (px). Defaults to `size`. */
  height?: number;
  pixels: readonly string[];
}
