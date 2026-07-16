import { type PixelRecipe } from "../../types";

// A proper farm windmill: four lattice sails radiating from a gold hub form a bold
// X silhouette up top, over a tapered timber tower (lit wood on the NW face,
// woodDark/bark on the SE) with a dark arched door. Silhouette-first — reads as a
// windmill even in solid black, unlike the old two-blob-on-a-pole.
const recipe: PixelRecipe =
  {
    name: "decoration/windmill",
    size: 16,
    pixels: [
      "..w.........w...",
      "..Ww.......wW...",
      "...Ww.....wW....",
      "....Ww...wW.....",
      ".....Ww.wW......",
      "......ooo.......",
      ".....Ww.wW......",
      "....Ww...wW.....",
      "...Ww.....wW....",
      "......dmM.......",
      ".....ddmMM......",
      ".....dmmMM......",
      "....ddmMMMM.....",
      "....dmNNMMM.....",
      "....dmNNMMM.....",
      "................",
    ],
  }
;

export default recipe;
