import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Wooden island wall — a plank retaining wall along the TOP edge of the
    // tile, used on the carpentry island margin so its shoreline reads as a
    // built wooden bulwark. Authored top-edge-up like `tile/wall`, rotated to
    // face the water. D=wood dark (posts/seam), d=wood light (planks),
    // k=near-black (shadow seam at the waterline).
    name: "tile/wall-wood",
    size: 16,
    pixels: [
      "dddddddddddddddd",
      "dddDddddDddddDdd",
      "dddDddddDddddDdd",
      "DDDDDDDDDDDDDDDD",
      "dddddddddddddddd",
      "dddDddddDddddDdd",
      "kkkkkkkkkkkkkkkk",
      "................",
      "................",
      "................",
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
