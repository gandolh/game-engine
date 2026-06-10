import { type PixelRecipe } from "../../types";

// Transparent base; drawn above forge-house (wall-clock overlay). Cycled A→B→C.
const recipe: PixelRecipe =
  {
    name: "structure/forge-smoke-a",
    size: 16,
    pixels: [
      "......ss........",
      ".....sSSs.......",
      ".....sSSs.......",
      "......ss........",
      "......s.........",
      "......s.........",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
