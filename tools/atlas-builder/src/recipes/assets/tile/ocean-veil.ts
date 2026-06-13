import { type PixelRecipe } from "../../types";

// Flat translucent ocean-surface veil. Drawn (at low alpha) over ocean tiles ABOVE submerged
// sea-life but below land/objects, so creatures read as seen THROUGH water. Solid deep-ocean fill,
// no foam speckles (those would re-introduce the cyan blobs the surface veil is meant to avoid).
const recipe: PixelRecipe =
  {
    name: "tile/ocean-veil",
    size: 16,
    pixels: [
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVVVVVVVVVVV",
    ],
  }
;

export default recipe;
