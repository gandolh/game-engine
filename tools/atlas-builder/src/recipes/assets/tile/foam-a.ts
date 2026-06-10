import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Animated foam overlay, frame A. Drawn over ocean tiles by the main-thread
    // render loop, cycling A→B→C for a gentle shimmer. Transparent base (.) so
    // the static ocean shows through; e=highlight, w=white foam crest.
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
