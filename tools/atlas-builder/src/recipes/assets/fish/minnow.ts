import { type PixelRecipe } from "../../types";

// Fish — three kinds, ascending value. minnow (small/grey), bass (green),
// salmon (red/pink). Used for inventory/feed flavour; the catch flow itself
// banks gold directly. 2026-06-10 art pass — `s` back, `w` belly, and a tiny
// cyan `i` scale glint: even the cheap fish catches the light.
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
      ".....sss.....Q..",
      "...sqqqqqq..QQ..",
      "..sqqqqqqqqQQ...",
      "..qqqkqiqqqQ....",
      "...wwqqqqq..Q...",
      ".....www........",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
