import { type PixelRecipe } from "../../types";

// Forest mushroom cluster — a little ring of red-capped toadstools.
// 2026-06-10 art pass — caps in bright `R` with deep-red `x` shade on the
// right edge and white `w` spots; stems white with a wicker `H` shadow side.
const recipe: PixelRecipe =
  {
    name: "decoration/mushroom-cluster",
    size: 16,
    pixels: [
      "................",
      "................",
      "......RRR.......",
      ".....RwRwx......",
      ".....RRRRx......",
      "..RRR.wwH.......",
      ".RwRwx.wH.RRR...",
      ".RRRRx..RwRwx...",
      "..wwH...RRRRx...",
      "...w.....wwH....",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
