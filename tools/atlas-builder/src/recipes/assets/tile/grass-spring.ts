import { type PixelRecipe } from "../../types";

// ── brief 45 — seasonal grass variants ────────────────────────────────────────
// 2026-06-10 art pass — spring: the base-grass tuft texture plus three tiny
// blossoms (a petal-pink `P` + white `n` pixel pair) so spring reads as the
// flowering season at a glance.
const recipe: PixelRecipe =
  {
    name: "tile/grass-spring",
    size: 16,
    pixels: [
      "cccccccccccccccc",
      "ccCgccccccPncccc",
      "ccCCcccccccccccc",
      "cccccccccccCgccc",
      "cccccccccccCCccc",
      "cCccccccgccccccc",
      "cCcccccCCccccCcc",
      "ccccccccccccCCcc",
      "cccnPccccccccccc",
      "ccccCgcccccccccc",
      "ccccCCccccccCccc",
      "ccccccccccccCccc",
      "cgccccccccPncccc",
      "cCccccccCCcccccc",
      "cccccccccccccccc",
      "ccccccccCccccccc",
    ],
  }
;

export default recipe;
