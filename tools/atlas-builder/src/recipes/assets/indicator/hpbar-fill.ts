import { type PixelRecipe } from "../../types";

// HP bar fill (remaining health): a solid grass-light green (`g`) field, no border so it
// nests cleanly inside hpbar-bg's frame. The renderer scales its width by the farmer's
// current HP fraction; the red background shows through for the depleted portion. EDG32 only.
const recipe: PixelRecipe =
  {
    name: "indicator/hpbar-fill",
    size: 16,
    pixels: [
      "................",
      "................",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "................",
      "................",
    ],
  }
;

export default recipe;
