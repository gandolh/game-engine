import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Transparent base; drawn over ocean tiles (wall-clock overlay). Cycled A→B→C.
    name: "tile/foam-a",
    size: 16,
    pixels: [
      "................",
      "..e.........e...",
      "................",
      ".......w........",
      "................",
      "............e...",
      "...e............",
      "................",
      ".........w......",
      "................",
      "..e.........e...",
      "................",
      "......w.........",
      "................",
      ".............e..",
      "................",
    ],
  }
;

export default recipe;
