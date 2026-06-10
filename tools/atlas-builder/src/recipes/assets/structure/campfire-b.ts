import { type PixelRecipe } from "../../types";

// Campfire flame — frame B (tallest, with spark pixels). 2026-06-10 art pass —
// four-step fire ramp y → o → f → r; shape unchanged.
const recipe: PixelRecipe =
  {
    name: "structure/campfire-b",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      ".......y........",
      "......y.y.......",
      ".......o........",
      "......yoy.......",
      ".....yooooy.....",
      ".....fooyof.....",
      ".....rfooofr....",
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
