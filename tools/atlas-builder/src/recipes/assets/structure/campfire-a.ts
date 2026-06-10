import { type PixelRecipe } from "../../types";

// Campfire flame — frame A. TRANSPARENT base; drawn OVER structure/campfire by
// the render loop (wall-clock overlay, no sim/determinism impact), like the
// forge fire over the oven. 2026-06-10 art pass — four-step EDG32 fire ramp:
// y (tip) → o (gold) → f (flame orange) → r (rust base). Same shape/position
// per frame so the overlay anchoring is untouched; only the ramp got richer.
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
