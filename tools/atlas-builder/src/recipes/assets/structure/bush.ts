import { type PixelRecipe } from "../../types";

// Forageable berry-bush (tileFeature kind "bush"): a full green shrub dotted with
// red berries so it reads as "collectible", distinct from the flat decoration/bush
// scenery prop. Collecting one yields a random seed (see handleGatherBush).
const recipe: PixelRecipe =
  {
    name: "structure/bush",
    size: 16,
    pixels: [
      "................",
      "................",
      ".....llll.......",
      "...llLLLLll.....",
      "..lLLLLLLLLl....",
      ".lLLRxLLLRxLl...",
      ".lLLLLLLLLLLl...",
      ".lLRxLLLLRxLl...",
      ".lLLLLLLLLLLl...",
      ".lLLLRxLLLLLl...",
      "..lLLLLLLLLl....",
      "...llLLLLll.....",
      "....tllllt......",
      ".......mm.......",
      "................",
      "................",
    ],
  }
;

export default recipe;
