import { type PixelRecipe } from "../../types";

// ── Extra decorations & detail props ─────────────────────────────────────────
// A small library of static dressing the world can scatter for visual
// interest. All EDG32-palette, 16×16, layer 40 (below NPCs/farmers).
const recipe: PixelRecipe =
  {
    // Wooden barrel with metal hoops.
    name: "decoration/barrel",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "....dddddd......",
      "...dDDDDDDd.....",
      "...dddddddd.....",
      "...kkkkkkkk.....",
      "...dddddddd.....",
      "...dDDDDDDd.....",
      "...dddddddd.....",
      "...kkkkkkkk.....",
      "...dddddddd.....",
      "...dDDDDDDd.....",
      "....dddddd......",
      "................",
      "................",
    ],
  }
;

export default recipe;
