import { type PixelRecipe } from "../../types";

// Forge fire — frame A. Transparent base; drawn over forge-oven's mouth.
// Flames: r (rust/base) → o (gold) → y (yellow tip). Cycled A→B→C.
const recipe: PixelRecipe =
  {
    name: "structure/forge-fire-a",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".....r..r.r.....",
      ".....ro.ror.....",
      ".....oyooyo.....",
      ".....royyor.....",
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
