import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Wooden plank bridge spanning a water gap between islands. Authored
    // HORIZONTAL (you walk left↔right across it): rail/support beams along the
    // top and bottom long edges (M = dark beam), a wood-plank deck (d = wood
    // light) with regular dark seams (D) every few columns, and a sliver of
    // ocean (v) peeking past each rail so it reads as crossing water. Vertical
    // bridges reuse this frame rotated 90° (see render-systems computeBridges).
    name: "tile/bridge-h",
    size: 16,
    pixels: [
      "vvvvvvvvvvvvvvvv",
      "MMMMMMMMMMMMMMMM",
      "MMMMMMMMMMMMMMMM",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "dddDdddDdddDdddD",
      "MMMMMMMMMMMMMMMM",
      "MMMMMMMMMMMMMMMM",
      "vvvvvvvvvvvvvvvv",
    ],
  }
;

export default recipe;
