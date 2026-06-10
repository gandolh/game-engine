import { type PixelRecipe } from "../../types";

// Frame C — bubbles reach the top and POP into foam crests (w); a fresh small
// bubble starts again at the bottom so the loop reads as continuous.
const recipe: PixelRecipe =
  {
    name: "structure/fishing-spot-c",
    size: 16,
    pixels: [
      "...w........w...",
      "..wew......wew..",
      "...w........w...",
      "................",
      "................",
      "................",
      "................",
      ".......w........",
      "......wew.......",
      ".......w........",
      "................",
      "................",
      "................",
      "...q.......qq...",
      "..qeq.....qewq..",
      "...q.......qq...",
    ],
  }
;

export default recipe;
