import { type PixelRecipe } from "../../types";

// A scarecrow on a cross frame: a straw sun-hat (gold brim, yellow crown), a
// burlap head, and a red tunic shaded NW->SE (red lit face, crimson shadow) with
// straw tufts poking from the sleeves. Cleaner read and proper shading.
const recipe: PixelRecipe =
  {
    name: "decoration/scarecrow",
    size: 16,
    pixels: [
      "................",
      "......yyy.......",
      ".....yyyoo......",
      "....ooooooo.....",
      "......hhH.......",
      ".....hNhNH......",
      "......hhH.......",
      "..yy.RRRR.yy....",
      ".yy.RRRRRx.yy...",
      "....RRxRRx......",
      "....RRRRxx......",
      "....RRRxxx......",
      ".....mMM........",
      ".....mMM........",
      "....mmMMM.......",
      "................",
    ],
  }
;

export default recipe;
