import { type PixelRecipe } from "../../types";

// Rounded broadleaf canopy with real volume: a bright-green highlight cluster on
// the NW (sunlit) shoulder ramps through greenMid to greenDark and a teal
// occlusion pocket on the SE underside. Solid three-value trunk (wood -> woodDark
// -> bark) lit on its left edge, flaring at the base.
const recipe: PixelRecipe =
  {
    name: "structure/tree",
    size: 16,
    pixels: [
      "......gggg......",
      ".....gGGGgl.....",
      "....gGGGGGGl....",
      "...gGGGGGGGll...",
      "..gGGGGGGGGlll..",
      "..gGGGGGGGllll..",
      "..gGGGGGllllll..",
      "..gGGGGllllllt..",
      "...GGGlllllll...",
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
