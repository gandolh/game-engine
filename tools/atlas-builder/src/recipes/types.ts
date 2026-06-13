export interface PixelRecipe {
  name: string;

  size: number;

  width?: number;

  height?: number;
  pixels: readonly string[];
}
