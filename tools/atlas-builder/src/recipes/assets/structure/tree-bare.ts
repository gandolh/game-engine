import { type PixelRecipe } from "../../types";

// brief 45 — bare winter tree, redrawn in the 2026-06-10 art pass. A real
// branching structure: two limbs forking off a tapered trunk, lit `m` against
// shaded `M`, with snow (`n`) resting ON TOP of limbs only (light comes from
// above) and a cool navy `N` shadow pixel where branches meet the trunk.
const recipe: PixelRecipe =
  {
    name: "structure/tree-bare",
    size: 16,
    pixels: [
      "................",
      "...nn....n......",
      "...mM...nM......",
      "....mM..mM..n...",
      "..n..mM.mM.nM...",
      "..mM..mMmM.mM...",
      "...mM..mMMmM....",
      "....mM.mMmM.....",
      ".....mMmM.......",
      "......mNM.......",
      ".......mM.......",
      ".......mM.......",
      "......mmMM......",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
