import { type PixelRecipe } from "../../types";

// Spring variant of structure/fruit-tree — SAME canopy+trunk silhouette as fruit-tree.ts,
// the green canopy heavily covered in blossom (P petal, w cream, n white) instead of fruit.
const recipe: PixelRecipe =
  {
    name: "structure/fruit-tree-blossom",
    size: 16,
    pixels: [
      "................",
      "....gPwPg.......",
      "...gPGwPGnl.....",
      "..gPwGGPGwPl....",
      "..gGPnGGwGGl....",
      ".gGwGPGGnGPwl...",
      ".gPGGwGGPGGPl...",
      ".gGPGGnGwGGwl...",
      "..lGwGPGnPll....",
      "..llPGwGGll.....",
      "...lltGtllt.....",
      ".....mMmM.......",
      ".....mMmM.......",
      "....mmMMMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
