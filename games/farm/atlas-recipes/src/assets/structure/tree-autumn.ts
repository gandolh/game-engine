import { type PixelRecipe } from "../../types";

// Autumn canopy: same rounded volume as the summer tree, warm ramp — yellow
// highlight on the NW shoulder through gold and orange to a deep crimson pocket
// on the SE underside. Reads as turning leaves, not a flat orange blob.
const recipe: PixelRecipe =
  {
    name: "structure/tree-autumn",
    size: 16,
    pixels: [
      "......yyyy......",
      ".....yaaayf.....",
      "....yaaaaaaf....",
      "...yaaaaaaaff...",
      "..yaaaaaaaafff..",
      "..yaaaaaaaffff..",
      "..yaaaaaffffff..",
      "..yaaaaffffffx..",
      "...aaafffffff...",
      "...aaffffffxx...",
      "....fffffxx.....",
      "......dmM.......",
      "......dmM.......",
      ".....ddmMM......",
      "................",
      "................",
    ],
  }
;

export default recipe;
