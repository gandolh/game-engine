import { type PixelRecipe } from "../../types";

// Fish — three kinds, ascending value. minnow (small/grey), bass (green),
// salmon (red/orange). Used for inventory/feed flavour; the catch flow itself
// banks gold directly.
const recipe: PixelRecipe =
  {
    name: "fish/minnow",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      ".....qqq.....Q..",
      "...qqqqqqq..QQ..",
      "..qqqqqqqqqQQ...",
      "..qqqkqqqqqQ....",
      "...qqqqqqq..Q...",
      ".....qqq........",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
