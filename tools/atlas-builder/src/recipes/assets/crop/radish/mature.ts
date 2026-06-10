import { type PixelRecipe } from "../../../types";

// 2026-06-10 art pass — radish in pink-purple (`P` highlight, `U` body, `u`
// shade) so it no longer reads as a second tomato, with a white root tip.
const recipe: PixelRecipe =
  {
    name: "crop/radish/mature",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "......lll.......",
      ".....llLll......",
      "....lllllll.....",
      ".....llLll......",
      "......lll.......",
      ".....PUUUU......",
      "....PUUUUUu.....",
      "....UUUUUuu.....",
      ".....UUUuu......",
      "......Uuu.......",
      ".......w........",
      "................",
      "................",
    ],
  }
;

export default recipe;
