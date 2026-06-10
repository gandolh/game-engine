import { type PixelRecipe } from "../../types";

// Transparent base; drawn over structure/waterfall (wall-clock overlay, no determinism impact). Rows step down A→B→C.
const recipe: PixelRecipe =
  {
    name: "structure/waterfall-a",
    size: 16,
    pixels: [
      "......see.......",
      "......ees.......",
      "......sie.......",
      "......ees.......",
      "......see.......",
      "......ees.......",
      "......see.......",
      "......eis.......",
      "......see.......",
      "......ees.......",
      "......see.......",
      "......ees.......",
      ".....nwwwn......",
      "......nwn.......",
      "................",
      "................",
    ],
  }
;

export default recipe;
