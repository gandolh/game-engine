import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — trodden path: pebbles as 2px `W` pairs with single `H`
// stones and the odd `q` rock, clustered like real gravel kicked to the sides,
// not an even sprinkle.
const recipe: PixelRecipe =
  {
    name: "tile/path",
    size: 16,
    pixels: [
      "TTTTTTTTTTTTTTTT",
      "TWWTTTTTTTTHTTTT",
      "TTTTTTTTTTTTTTTT",
      "TTTTTTTWWTTTTTWT",
      "TTHTTTTTWTTTTTTT",
      "TTTTTTTTTTTTTTTT",
      "TTTTqTTTTTTWWTTT",
      "TTTTTTTTTTTTTTTT",
      "TWTTTTTTTTTTTTTT",
      "TWWTTTTTHTTTTTTT",
      "TTTTTTTTTTTTWWTT",
      "TTTTTTTTTTTTTWTT",
      "TTTTTHTTTTTTTTTT",
      "TTTTTTTTqTTTTTTT",
      "TTWWTTTTTTTTTTTT",
      "TTTTTTTTTTTTTTTT",
    ],
  }
;

export default recipe;
