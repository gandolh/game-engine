import { type PixelRecipe } from "../../types";

// A bound straw bale: rounded rectangle with a sunlit top ridge (yellow), a gold
// body shading to tan on the SE underside, horizontal straw striations, and two
// clay binding straps. Warm and volumetric instead of the old yellow noise.
const recipe: PixelRecipe =
  {
    name: "decoration/hay-bale",
    size: 16,
    pixels: [
      "................",
      "................",
      "...yyyyyyyyyy...",
      "..yooooooooooW..",
      "..yopooooopooW..",
      "..yopooooopooW..",
      "..yoooooooopoW..",
      "..yopooooopooW..",
      "..yopooooopooW..",
      "..yoooooooppoW..",
      "..WWWWWWWWWWWW..",
      "...WppWWWWppW...",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
