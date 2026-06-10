import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — worked soil: 2px clods of lit `d` with an occasional
// `H` sun-catch on a clod's top-left and `M` shadow pits, instead of lone
// pixels. Reads as turned earth rather than brown static.
const recipe: PixelRecipe =
  {
    name: "tile/dirt",
    size: 16,
    pixels: [
      "DDDDDDDDDDDDDDDD",
      "DDHdDDDDDDddDDDD",
      "DDDdDDDDDDDDDDDD",
      "DDDDDDDMDDDDDDdD",
      "DDDDDDDDDDDDDDDD",
      "DDdHDDDDDDDMDDDD",
      "DDddDDDDddDDDDDD",
      "DDDDDDDDDdDDDDDD",
      "DMDDDDDDDDDDDDDD",
      "DDDDDDDDDDDDHdDD",
      "DDDDddDDDDDDdDDD",
      "DDDDDdDDDDDDDDDD",
      "DdDDDDDDDDMDDDDD",
      "DddDDDDDDDDDDDDD",
      "DDDDDDDDddDDDDDD",
      "DDDDDDDDDDDDDDDD",
    ],
  }
;

export default recipe;
