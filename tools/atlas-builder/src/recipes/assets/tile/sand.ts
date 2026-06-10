import { type PixelRecipe } from "../../types";

// Sandy beach floor for the fishing isle. 2026-06-10 art pass — wind RIPPLES:
// short diagonal runs of cream `w` over wet-sand `W`, with sparse `T` grains
// and one `H` shell speck, replacing the even speckle.
const recipe: PixelRecipe =
  {
    name: "tile/sand",
    size: 16,
    pixels: [
      "WWWWWWWWWWWWWWWW",
      "WWwwWWWWWWWWWWWW",
      "WWWWwwWWWWWwwWWW",
      "WWWWWWWWWWWWWwwW",
      "WTWWWWWWWWWWWWWW",
      "WWWWWWWWWWWWWWWW",
      "WWWwwWWWWWTWWWWW",
      "WWWWWwwWWWWWWWWW",
      "WWWWWWWwWWWWWWWW",
      "WWWWWWWWWWWwwWWW",
      "WWHWWWWWWWWWWwwW",
      "WWWWWWWWWWWWWWWW",
      "WWWWWWTWWWWWWWWW",
      "WwwWWWWWWWWWWWWW",
      "WWWwwWWWWWWTWWWW",
      "WWWWWWWWWWWWWWWW",
    ],
  }
;

export default recipe;
