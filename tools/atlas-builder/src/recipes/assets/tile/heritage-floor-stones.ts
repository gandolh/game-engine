import { type PixelRecipe } from "../../types";

// ── brief 62 — per-island heritage floor variants ────────────────────────────
// Three themed floors, one per heritage island, replacing the single shared
// `tile/heritage-floor` in backdropFrame. All are low-contrast backdrops (layer
// 0) meant to sit in the same family as the original heritage-floor recipe.
// EDG32 palette only; all swatch chars come from SWATCH above.
const recipe: PixelRecipe =
  {
    // heritage-floor-stones — mossy turf with half-buried stone slabs.
    // l = deep green moss (#265c42 greenDark), L = bright grass tuft (#63c74d),
    // c = grass dark base (#265c42), G = grass mid (#3e8948),
    // S = slate slab face (#5a6988), Q = stone dark slab edge (#8b9bb4).
    // The slab seams (S/Q) read as old stone half-swallowed by the turf (l/c).
    name: "tile/heritage-floor-stones",
    size: 16,
    pixels: [
      "clcccclcccclcccc",
      "lcccclccccclccGc",
      "cSSSSSSSSSSSSScc",
      "cSQQQSSQQQSSQScc",
      "cSSSSSSSSSSSSScc",
      "ccclcccclcccclcc",
      "cclccGcccclccccc",
      "clcccclcccclcccc",
      "cSSSSSSSSSSSSScc",
      "cSQQQSSQQQSSQScc",
      "cSSSSSSSSSSSSScc",
      "ccclcccGcccclccc",
      "cclcccclccccclcc",
      "lccccclccGccclcc",
      "cSSSSSSSSSSSSScc",
      "cSQQQSSQQQSSQScc",
    ],
  }
;

export default recipe;
