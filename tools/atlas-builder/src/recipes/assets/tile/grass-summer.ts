import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — summer: the lushest variant. Same tuft texture as base
// grass but with more `g` light tips (high sun) and two gold `y` buttercup
// pixels. Deliberately the brightest of the four seasons.
const recipe: PixelRecipe =
  {
    name: "tile/grass-summer",
    size: 16,
    pixels: [
      "cccccccccccccccc",
      "ccCgccccccCgcccc",
      "ccCCccccccCCcccc",
      "ccccccccccccccyc",
      "cccccccccccccccc",
      "cCgcccccgccccccc",
      "cCCccccCCccccCgc",
      "ccccccccccccCCcc",
      "cccycccccccccccc",
      "ccccCgcccccccccc",
      "ccccCCccccccCgcc",
      "ccccccccccccCccc",
      "cgcccccccccccccc",
      "cCccccccCgcccccc",
      "ccccccccCCcccccc",
      "ccccccccCccccccc",
    ],
  }
;

export default recipe;
