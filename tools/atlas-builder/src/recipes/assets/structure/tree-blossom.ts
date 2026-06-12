import { type PixelRecipe } from "../../types";

// Spring variant of structure/tree — IDENTICAL canopy+trunk silhouette to tree.ts,
// with pink/white blossom specks (P petal, n white, w cream) dotted across the green
// canopy so a season swap reads as the same tree blooming, not a different tree.
const recipe: PixelRecipe =
  {
    name: "structure/tree-blossom",
    size: 16,
    pixels: [
      "................",
      ".....gGPG.......",
      "....ggPGGnl.....",
      "...ggGGPGwGl....",
      "..gGnGGGGGPGl...",
      "..gGGGGlGGwGl...",
      ".gGPGlGGnGGGll..",
      ".gGGGGwGGlGGPl..",
      "..GGlGGnGGGll...",
      "...llGPGGlll....",
      "....tllmMlt.....",
      ".......mM.......",
      ".......mM.......",
      "......mmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
