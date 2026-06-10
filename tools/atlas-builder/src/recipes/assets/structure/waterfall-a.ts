import { type PixelRecipe } from "../../types";

// Waterfall cascade — frame A. TRANSPARENT base; drawn OVER structure/waterfall
// by the render loop as a wall-clock overlay (no determinism impact), exactly
// like the forge-fire over the oven. Bright water-blue streaks (ocean foam `e`,
// light `s`) occupy the cliff's central channel; across A→B→C the streak rows
// STEP DOWN one row so the column reads as continuously falling water, with a
// little lighter foam (`w`/`n`) at the plunge-pool base. EDG palette only.
// 2026-06-10 art pass — two cyan `i` glints per frame that also step down one
// row across A→B→C, so sparkles travel with the falling water.
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
