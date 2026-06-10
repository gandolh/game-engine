import { type PixelRecipe } from "../../types";

// ── Themed per-island decorations (16×16) ────────────────────────────────────
// Friendlier "peisage" props that give each non-farm island its own character.
// All EDG32 (palette.ts SWATCH chars only). Scattered by region-setup placeProps;
// each has a DECORATION_LABELS entry (snapshot-builder/constants.ts) to hover.
const recipe: PixelRecipe =
  {
    // Shrine stone lantern — a carved stone post with a warm gold flame box.
    name: "decoration/stone-lantern",
    size: 16,
    pixels: [
      "................",
      "......qqqq......",
      ".....qQQQQq.....",
      ".....QoooQ......",
      ".....QoyoQ......",
      ".....QoooQ......",
      ".....qQQQQq.....",
      "......qQQq......",
      ".......QQ.......",
      "......QQQQ......",
      "......QQQQ......",
      ".....qQQQQq.....",
      ".....qqQQqq.....",
      "....qqqqqqqq....",
      "................",
      "................",
    ],
  }
;

export default recipe;
