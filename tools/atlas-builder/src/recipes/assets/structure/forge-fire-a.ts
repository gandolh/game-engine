import { type PixelRecipe } from "../../types";

// Forge fire — frame A. Transparent base; drawn over forge-oven's mouth.
// 2026-06-10 art pass — forge burns HOTTER than the campfire: licks in flame
// orange `f` over a gold/yellow heart. Ramp y → o → f. Cycled A→B→C.
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
