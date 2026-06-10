import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — texture clusters, not noise: lone speckles replaced by
// small grass TUFTS (a 2px `C` blade with a `g` light tip) and 2px clumps, so
// the ground reads as grass instead of static. Marks stay off systematic rows
// so the tile repeats without a visible seam.
const recipe: PixelRecipe =
  {
    name: "tile/grass",
    size: 16,
    pixels: [
      "cccccccccccccccc",
      "ccCgcccccccccccc",
      "ccCCccccccCgcccc",
      "ccccccccccCCcccc",
      "cccccccccccccccc",
      "cCccccccgccccccc",
      "cCcccccCCccccCcc",
      "ccccccccccccCCcc",
      "cccccccccccccccc",
      "ccccCgcccccccccc",
      "ccccCCccccccCccc",
      "ccccccccccccCccc",
      "cgcccccccccccccc",
      "cCccccccCCcccccc",
      "cccccccccccccccc",
      "ccccccccCccccccc",
    ],
  }
;

export default recipe;
