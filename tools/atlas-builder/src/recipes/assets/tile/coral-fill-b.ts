import { type PixelRecipe } from "../../types";

// FILL-B (cool): companion interior reef — magenta, sky-blue, purple, green coral
// heads in transparent water with navy undershadows. Same head layout as the warm
// fill so the variants intermix into one organic, colourful, submerged reef.
const recipe: PixelRecipe =
  {
    name: "tile/coral-fill-b",
    size: 16,
    pixels: [
      "................",
      ".UUUUU...eeeee..",
      ".UUUUU...eeeee..",
      ".UUuUU...eeiee..",
      ".UUUUU...eeeee..",
      "..UUU.....eee...",
      "..N..i....N.i...",
      "................",
      "......i..i......",
      "..uuu.....LLL...",
      ".uuuuu...LLLLL..",
      ".uuuuu...LLLLL..",
      ".uuUuu...LLiLL..",
      ".uuuuu...LLLLL..",
      "..uuu.....LLL...",
      "...N.......N....",
    ],
  }
;

export default recipe;
