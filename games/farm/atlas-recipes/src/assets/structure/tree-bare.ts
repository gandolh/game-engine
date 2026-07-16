import { type PixelRecipe } from "../../types";

// Bare winter tree: a solid tapering trunk that forks into branches, each limb
// lit on its NW edge (wood) and shadowed on the SE (bark), with a few pale snow
// caps on the upper twigs. Reads as a structured tree, not scattered sticks.
const recipe: PixelRecipe =
  {
    name: "structure/tree-bare",
    size: 16,
    pixels: [
      "................",
      "....n....n......",
      "...dm...dm......",
      "...dm...dm..n...",
      "..n.dm.dm..dm...",
      "..dm.dmdm.dm....",
      "...dm.dmdmdm....",
      "....dmddmdm.....",
      ".....dddmm......",
      "......dmM.......",
      "......dmM.......",
      "......dmM.......",
      "......dmM.......",
      ".....ddmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
