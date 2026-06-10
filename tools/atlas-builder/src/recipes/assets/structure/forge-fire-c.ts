import { type PixelRecipe } from "../../types";

// Forge fire — frame C (leaning flicker). 2026-06-10 art pass — ramp
// y → o → f with a rust `r` bed at the bottom edge.
const recipe: PixelRecipe =
  {
    name: "structure/forge-fire-c",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "......f.f.......",
      ".....fof.f......",
      ".....oyofoo.....",
      ".....oyyyyo.....",
      ".....royoyr.....",
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
