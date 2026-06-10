import { type PixelRecipe } from "../../types";

// Frame A of a 3-frame bubble animation (A→B→C). BubbleSystem spawns this frame; render loop swaps to -a/-b/-c.
const recipe: PixelRecipe =
  {
    name: "structure/fishing-spot",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...q........q...",
      "..qeq......qeq..",
      "...q...qq...q...",
      ".......qeq......",
      "........q.......",
      "................",
      "................",
    ],
  }
;

export default recipe;
