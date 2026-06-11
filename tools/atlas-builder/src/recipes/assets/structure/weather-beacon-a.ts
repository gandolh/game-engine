import { type PixelRecipe } from "../../types";

// Beacon tip LIT frame — yellow glow dot. Wall-clock overlay on antenna tip; no sim coupling.
const recipe: PixelRecipe = {
  name: "structure/weather-beacon-a",
  size: 16,
  pixels: [
    "................",
    "................",
    "................",
    "................",
    "......yyy.......",
    ".....yoyoy......",
    "......yyy.......",
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
};

export default recipe;
