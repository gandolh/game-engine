import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Authored horizontal; vertical bridges reuse this frame rotated 90° (computeBridges).
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
