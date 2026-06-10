import { type PixelRecipe } from "../../types";

// ── Workshop props — carpenter ───────────────────────────────────────────────
// Sturdy workbench with a plank top (W) on dark legs (M), a saw (q) resting on
// it, and a couple of pegs.
const recipe: PixelRecipe =
  {
    name: "structure/workbench",
    size: 16,
    pixels: [
      "................",
      "................",
      ".....qqqqqq.....",
      "....q......q....",
      "..WWWWWWWWWWWW..",
      "..WWWWWWWWWWWW..",
      "..MWWWWWWWWWWM..",
      "..M..........M..",
      "..M..........M..",
      "..MM........MM..",
      "..MM........MM..",
      "..MM........MM..",
      "..MM........MM..",
      "..MM........MM..",
      "................",
      "................",
    ],
  }
;

export default recipe;
