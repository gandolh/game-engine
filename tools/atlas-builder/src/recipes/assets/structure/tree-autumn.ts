import { type PixelRecipe } from "../../types";

// brief 45 — autumn tree, redrawn in the 2026-06-10 art pass. Same silhouette
// as structure/tree so the seasonal swap doesn't pop, but the canopy uses the
// warm EDG32 ramp: highlight `y`, body `a` (gold), shade `f` (flame orange),
// and a deep red `x` core shadow — hue-shifted, not just darkened.
const recipe: PixelRecipe =
  {
    name: "structure/tree-autumn",
    size: 16,
    pixels: [
      "................",
      ".....yaaa.......",
      "....yyaaaaf.....",
      "...yyaaaaaaf....",
      "..yaaaaaaaaaf...",
      "..yaaaafaaaaf...",
      ".yaaafaaaaaaff..",
      ".yaaaaaaafaaaf..",
      "..aafaaaaaaff...",
      "...ffaaaafff....",
      "....xffmMfx.....",
      ".......mM.......",
      ".......mM.......",
      "......mmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
