import { type PixelRecipe } from "../../types";

// Anvil on a wooden stump. Steel face (q) + dark body (Q), horn to the left,
// mounted on a brown stump (m/M). The NPC hammers facing this.
const recipe: PixelRecipe =
  {
    name: "structure/anvil",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "......qqqqq.....",
      "....qqQQQQQq....",
      "...QQQQQQQQQ....",
      "....QQQQQQQ.....",
      ".....QQQ........",
      ".....QQQQ.......",
      "....QQQQQQ......",
      "....mmmmmm......",
      "....mMMMMm......",
      "....mMMMMm......",
      "....MMMMMM......",
      "................",
    ],
  }
;

export default recipe;
