import { type PixelRecipe } from "../../types";

// REEF: the boat-fishing landmark tile. A round multi-hued bloom — pink, gold,
// orange, magenta, yellow, green, red — on TRANSPARENT water with cyan sparkles,
// so the fishing spot reads as a jewel of coral submerged in clear water (no
// opaque blue background, no hard tile edge).
const recipe: PixelRecipe =
  {
    name: "tile/coral-reef",
    size: 16,
    pixels: [
      "................",
      "......iooi......",
      "....PPooooUU....",
      "...PPfoooyUUU...",
      "..PPffoooyyUUU..",
      ".PPffooooyyyUUU.",
      ".PffoooooyyyUU..",
      "iffooooooooyyyyi",
      "iffooowwooooyyyi",
      ".RffoooooooyyLL.",
      ".RRffooooyyyLLL.",
      "..RRffooyyyLLL..",
      "...RRfyyyyLLL...",
      "....RRyyyLLL....",
      "......iLLi......",
      "................",
    ],
  }
;

export default recipe;
