import { type PixelRecipe } from "../../types";

// Static base; campfire-a/b/c flame layered on top (wall-clock overlay, no determinism impact).
const recipe: PixelRecipe =
  {
    name: "structure/campfire",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......ror.......",
      ".....rooor......",
      "....Q.dDd.Q.....",
      "...Qq.DdD.qQ....",
      "...Qq.dDd.qQ....",
      "....QqqqqqQ.....",
      ".....QQQQQ......",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
