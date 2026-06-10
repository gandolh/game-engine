import { type PixelRecipe } from "../../types";

// Campfire flame — frame A. TRANSPARENT base; drawn OVER structure/campfire by
// the render loop (wall-clock overlay, no sim/determinism impact), like the
// forge fire over the oven. Flames: r (rust/base) → o (gold) → y (yellow tip).
// Across A→B→C the flame shape + brightness vary so the fire flickers.
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
      ".....rooor......",
      ".....rooor......",
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
