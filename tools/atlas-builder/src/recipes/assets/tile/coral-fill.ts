import { type PixelRecipe } from "../../types";

// FILL (warm): interior reef. Rounded coral heads — pink, orange, gold, red —
// suspended in TRANSPARENT water (`.`) with navy `N` undershadows for depth, so
// the reef reads as colourful coral *under* clear water rather than a flat tile.
// No opaque background: neighbouring tiles' water merges seamlessly (no grid).
const recipe: PixelRecipe =
  {
    name: "tile/coral-fill",
    size: 16,
    pixels: [
      "................",
      ".PPPPP...fffff..",
      ".PPPPP...fffff..",
      ".PPuPP...ffoff..",
      ".PPPPP...fffff..",
      "..PPP.....fff...",
      "..N..i....N.i...",
      "................",
      "......i..i......",
      "..ooo.....RRR...",
      ".ooooo...RRRRR..",
      ".ooooo...RRRRR..",
      ".ooyoo...RRxRR..",
      ".ooooo...RRRRR..",
      "..ooo.....RRR...",
      "...N.......N....",
    ],
  }
;

export default recipe;
