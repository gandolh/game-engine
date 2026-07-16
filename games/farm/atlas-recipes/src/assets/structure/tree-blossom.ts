import { type PixelRecipe } from "../../types";

// Spring blossom: the rounded green canopy dressed with small clustered blossoms
// (salmon petals kissed with a white highlight) concentrated on the sunlit NW
// crown, thinning into the shaded SE. Clusters, never lone-pixel speckle.
const recipe: PixelRecipe =
  {
    name: "structure/tree-blossom",
    size: 16,
    pixels: [
      "......gPPg......",
      ".....gPnPgl.....",
      "....gGPPGGGl....",
      "...gPnGGGGGll...",
      "..gPPGGGGGGlll..",
      "..gGGPnGGGllll..",
      "..gGGGGPllllll..",
      "..gGGGGllllllt..",
      "...GPnlllllll...",
      "...GGlllllltt...",
      "....llllltt.....",
      "......dmM.......",
      "......dmM.......",
      ".....ddmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
