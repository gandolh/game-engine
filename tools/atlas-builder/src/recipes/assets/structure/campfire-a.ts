import { type PixelRecipe } from "../../types";

// Transparent base; drawn over structure/campfire (wall-clock overlay, no sim/determinism impact). Cycled A→B→C.
const recipe: PixelRecipe =
  {
    name: "structure/campfire-a",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      ".......y........",
      ".......o........",
      "......yoy.......",
      "......oyo.......",
      ".....fooof......",
      ".....rfofr......",
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
