import { type PixelRecipe } from "../../types";

// Waterfall cascade — frame A. TRANSPARENT base; drawn OVER structure/waterfall
// by the render loop as a wall-clock overlay (no determinism impact), exactly
// like the forge-fire over the oven. Bright water-blue streaks (ocean foam `e`,
// light `s`) occupy the cliff's central channel; across A→B→C the streak rows
// STEP DOWN one row so the column reads as continuously falling water, with a
// little lighter foam (`w`/`n`) at the plunge-pool base. EDG palette only.
const recipe: PixelRecipe =
  {
    name: "structure/waterfall-a",
    size: 16,
    pixels: [
      "......see.......",
      "......ees.......",
      "......see.......",
      "......ees.......",
      "......see.......",
      "......ees.......",
      "......see.......",
      "......ees.......",
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
