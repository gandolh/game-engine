import { type PixelRecipe } from "../../types";

// Stone-and-brick oven/hearth with a dark mouth. The fire overlay sits in the
// mouth (rows 6–9). Body uses stone (Q/q) + brick rust (r) + dark mouth (k).
const recipe: PixelRecipe =
  {
    name: "structure/forge-oven",
    size: 16,
    pixels: [
      "................",
      "....QQQQQQQQ....",
      "...QqqqqqqqqQ...",
      "...QqrqrqrqqQ...",
      "...QqqqqqqqqQ...",
      "...QkkkkkkkkQ...",
      "...Qkk....kkQ...",
      "...Qk......kQ...",
      "...Qk......kQ...",
      "...Qkk....kkQ...",
      "...QkkkkkkkkQ...",
      "...QqrqrqrqqQ...",
      "...QQQQQQQQQQ...",
      "....mm....mm....",
      "....MM....MM....",
      "................",
    ],
  }
;

export default recipe;
