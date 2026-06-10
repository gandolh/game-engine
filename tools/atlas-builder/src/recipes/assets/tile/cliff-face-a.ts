import { type PixelRecipe } from "../../types";

// ── brief 65 — cliff-face tiles (fake-height skirt for tall islands) ──────────
// These tiles are drawn on the OCEAN tile(s) directly south of a tall island's
// southern coastline, simulating vertical stone cliff walls that make the island
// surface read as elevated. They are purely decorative (rendered on non-walkable
// ocean tiles; no sim/pathfinding impact). The face reads top-to-bottom: the
// upper rows continue the island wall (`tile/wall`)'s stone face, and the bottom
// 3 rows darken to a waterline wash (wet/mossy rock meeting the sea).
//
// Swatch chars used (all EDG32):
//   Q = stone dark (#8b9bb4 = slate)  — main cliff face blocks
//   q = stone light (#c0cbdc = silver) — mortar / highlight capping
//   S = struct blue (#5a6988 = slate)  — mid shadow band
//   V = ocean deep (#3a4466 = navy)    — waterline wash/wet stone
//   k = near-black (#181425)           — deep shadow seam at top, shadow
//
// Two variants (a/b) let us break visual repetition by deriving the
// variant from tile coordinates (no RNG needed):
//   (tx * 3 + ty * 5) % 2 → 0 = tile/cliff-face-a, 1 = tile/cliff-face-b
const recipe: PixelRecipe =
  {
    // cliff-face-a: main mid section variant, mortar lines evenly spaced
    name: "tile/cliff-face-a",
    size: 16,
    pixels: [
      "kkkkkkkkkkkkkkkk",  // top: dark seam (where island wall's base was)
      "QqQQqQQqQQqQQqQQ",  // cap stones (echoes tile/wall top)
      "QQQQQQQQQQQQQQQQ",
      "QQkQQQkQQQkQQQkQ",
      "QQQQQQQQQQQQQQQQ",
      "QqQQqQQqQQqQQqQQ",
      "QQQQQQQQQQQQQQQQ",
      "QQkQQQkQQQkQQQkQ",
      "QQQQQQQQQQQQQQQQ",
      "QqQQqQQqQQqQQqQQ",
      "QQQQQQQQQQQQQQQQ",
      "SSSSSSSSSSSSSSSS",  // waterline transition — darker shadowed rock
      "SsSsSsSsSsSsSsSs",
      "VVVVVVVVVVVVVVVk",  // wet stone / water-splash row
      "VVeVVVVeVVVVeVVV",  // ocean wash with foam highlights (e=ocean foam)
      "vVVVVvVVVVvVVVVv",  // deep water meeting the cliff base
    ],
  }
;

export default recipe;
