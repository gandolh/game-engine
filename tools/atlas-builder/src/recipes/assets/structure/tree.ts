import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — lumpy three-lobe canopy with a committed top-left light:
// highlight `g`, body `G`, shade `l`, and a hue-shifted deep core `t` (#193c3e)
// where the canopy meets the trunk. Trunk is lit `m` / shaded `M`. The bottom
// edge of the canopy keeps a dark selective outline; the lit side stays open.
const recipe: PixelRecipe =
  {
    name: "structure/tree",
    size: 16,
    pixels: [
      "................",
      ".....gGGG.......",
      "....ggGGGGl.....",
      "...ggGGGGGGl....",
      "..gGGGGGGGGGl...",
      "..gGGGGlGGGGl...",
      ".gGGGlGGGGGGll..",
      ".gGGGGGGGlGGGl..",
      "..GGlGGGGGGll...",
      "...llGGGGlll....",
      "....tllmMlt.....",
      ".......mM.......",
      ".......mM.......",
      "......mmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
