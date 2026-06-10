import { type PixelRecipe } from "../../types";

// ── Carpentry floor — laid stone slabs ───────────────────────────────────────
// Replaces the old dark wood-plank carpenter floor with a stonemason-style
// slab floor: light stone faces (q) bordered by dark stone grout (Q), in an
// offset-brick pattern so it reads as a worked-stone workshop floor distinct
// from the speckled tile/stone-floor used by the mill/wells.
const recipe: PixelRecipe =
  {
    name: "tile/carpentry-floor",
    size: 16,
    pixels: [
      "QQQQQQQQQQQQQQQQ",
      "QqqqqqqQqqqqqqqQ",
      "QqqqqqqQqqqqqqqQ",
      "QqqqqqqQqqqqqqqQ",
      "QQQQQQQQQQQQQQQQ",
      "QqqqQqqqqqqqQqqQ",
      "QqqqQqqqqqqqQqqQ",
      "QqqqQqqqqqqqQqqQ",
      "QQQQQQQQQQQQQQQQ",
      "QqqqqqqQqqqqqqqQ",
      "QqqqqqqQqqqqqqqQ",
      "QqqqqqqQqqqqqqqQ",
      "QQQQQQQQQQQQQQQQ",
      "QqqqQqqqqqqqQqqQ",
      "QqqqQqqqqqqqQqqQ",
      "QQQQQQQQQQQQQQQQ",
    ],
  }
;

export default recipe;
