import { type PixelRecipe } from "../../../types";

// 2026-06-10 art pass — ripe tomato in true bright red (`R` #e43b44) with a
// `w` glint top-left and deep-red `x` shading bottom-right, lit leaf crown.
const recipe: PixelRecipe =
  {
    name: "crop/tomato/mature",
    size: 16,
    pixels: [
      "................",
      "................",
      "......lLl.......",
      ".....lLlll......",
      "......lll.......",
      ".....RRRRR......",
      "....RwRRRRx.....",
      "....RRRRRRx.....",
      "....RRRRxxx.....",
      ".....RRRxx......",
      "......Rxx.......",
      "......dkd.......",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
