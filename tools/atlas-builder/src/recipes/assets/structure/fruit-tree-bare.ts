import { type PixelRecipe } from "../../types";

// Winter variant of structure/fruit-tree — same footprint, canopy stripped to bare
// branches (m/M trunk dark, D wood) fanning from the same trunk, with a few snow flecks (n).
const recipe: PixelRecipe =
  {
    name: "structure/fruit-tree-bare",
    size: 16,
    pixels: [
      "................",
      "....n..D........",
      "...D..mD.n......",
      "..Dm.mDm.Dm.....",
      "...mDmDmDm.D....",
      ".D..mmDmDmm.....",
      "..Dm.mMmMm.D....",
      "...mD.mMm.Dm....",
      "..D..mMMm..D....",
      ".....mMMm.n.....",
      "....n.mMm.......",
      ".....mMmM.......",
      ".....mMmM.......",
      "....mmMMMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
