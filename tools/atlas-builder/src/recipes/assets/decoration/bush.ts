import { type PixelRecipe } from "../../types";

// Small bush / shrub. 2026-06-10 art pass — same round silhouette, now lit
// from the top-left: `g` highlight arc, `L` body, `l` shade, and a hue-shifted
// `t` under-shadow where it meets the ground.
const recipe: PixelRecipe =
  {
    name: "decoration/bush",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      ".....gLl........",
      "...gLLLLll......",
      "..gLLLLLLLl.....",
      ".gLLLLLLLLll....",
      ".gLLgLLLLlLl....",
      ".lLLLLLlLLll....",
      "..lLLLLLLll.....",
      "...llLLlll......",
      "....tllt........",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
