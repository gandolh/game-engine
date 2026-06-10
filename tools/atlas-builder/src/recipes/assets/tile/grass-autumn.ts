import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — autumn: fallen leaves as 2px LEAF PAIRS drifting in
// loose diagonal clusters (the wind blew them somewhere), not confetti. Gold
// `a`, orange `A`, tan `b`, plus a couple of hot `f` leaves for spice.
const recipe: PixelRecipe =
  {
    name: "tile/grass-autumn",
    size: 16,
    pixels: [
      "cccccccccccccccc",
      "ccaAcccccccccccc",
      "cccbAccccccAaccc",
      "ccccccccccccbccc",
      "cccccccccccccccc",
      "cfaccccccccccccc",
      "ccAbccccaAcccccc",
      "cccccccccbAccccc",
      "cccccccccccccccc",
      "ccccbacccccccccc",
      "cccccAacccccfAcc",
      "ccccccccccccAbcc",
      "caAccccccccccccc",
      "ccbcccccAacccccc",
      "cccccccccAbccccc",
      "cccccccccccccccc",
    ],
  }
;

export default recipe;
