import { type PixelRecipe } from "../../types";

// A rounded granite boulder. NW sun: a bright silver cap top-left ramps through
// steel -> slate -> navy to an ink shadow pooled lower-right, with a soft cluster
// break between bands so the face reads round rather than banded. Baked contact
// shadow anchors it to the ground.
const recipe: PixelRecipe =
  {
    name: "structure/stone",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "......qqqq......",
      ".....qQQQQs.....",
      "....qQQQQQSs....",
      "...qQQQQSSSSs...",
      "...QQQqSSSSVs...",
      "..qQQSSSSSSVVs..",
      "..QQSSSSSVVVNN..",
      "..sSSSSVVVVNNN..",
      "...SSVVVVNNNN...",
      "...NNVVNNNNNN...",
      "....NNNNNN......",
      "................",
      "................",
    ],
  }
;

export default recipe;
