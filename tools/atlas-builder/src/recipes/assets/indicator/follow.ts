import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Downward-pointing yellow arrow drawn above the head of the farmer the
    // camera is currently following (Pip or any clicked AI farmer). Bright
    // yellow body (y) with a dark outline (k) so it reads on any backdrop.
    name: "indicator/follow",
    size: 16,
    pixels: [
      "................",
      "................",
      ".....kkkkkk.....",
      ".....kyyyyk.....",
      ".....kyyyyk.....",
      ".....kyyyyk.....",
      "...kkkyyyykkk...",
      "...kyyyyyyyyk...",
      "....kyyyyyyk....",
      ".....kyyyyk.....",
      "......kyyk......",
      ".......kk.......",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
