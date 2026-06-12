import { type PixelRecipe } from "../../types";

// Orchard fruit tree — SUMMER mature look (base of the 4-way seasonal set). A rounded
// green canopy (G dark / g light / l/L leaf, t under-shade) studded with a few round
// ripe fruits (o gold, R red), on a short stout trunk (m/M). The blossom/autumn/bare
// variants share this EXACT silhouette so the season swap reads as the same tree.
const recipe: PixelRecipe =
  {
    name: "structure/fruit-tree",
    size: 16,
    pixels: [
      "................",
      "....ggGGg.......",
      "...gGGGGGGl.....",
      "..gGoGGGGRGl....",
      "..gGGGGGGGGl....",
      ".gGGGoGGGGGGl...",
      ".gGGGGGGGRGGl...",
      ".gGGoGGGGGGGl...",
      "..lGGGGGRGll....",
      "..llGGGGGGll....",
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
