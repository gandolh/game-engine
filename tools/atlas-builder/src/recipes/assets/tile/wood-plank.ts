import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Darkened plank floor: face is wood-light (d) over near-black bark grout
    // (M), instead of the old tan-over-wood-dark. The new floor reads clearly
    // darker so the tan/wood carpenter tools and props pop against it rather
    // than blending in.
    name: "tile/wood-plank",
    size: 16,
    pixels: [
      "MMMMMMMMMMMMMMMM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MMMMMMMMMMMMMMMM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MMMMMMMMMMMMMMMM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MMMMMMMMMMMMMMMM",
      "MddddddddddddddM",
      "MddddddddddddddM",
      "MddddddddddddddM",
    ],
  }
;

export default recipe;
