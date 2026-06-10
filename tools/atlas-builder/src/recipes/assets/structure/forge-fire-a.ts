import { type PixelRecipe } from "../../types";

// Transparent base; drawn over forge-oven's mouth (no sim/determinism impact). Cycled A→B→C.
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
      ".....f..f.f.....",
      ".....fo.fof.....",
      ".....oyooyo.....",
      ".....foyyof.....",
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
