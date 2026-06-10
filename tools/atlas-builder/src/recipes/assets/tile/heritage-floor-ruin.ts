import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // heritage-floor-ruin — cracked brick rubble.
    // r = rust/brick (#be4a2f), p = clay/pumpkin mortar (#d77643),
    // M = bark/near-black crack lines (#3e2731), D = dark wood/rubble (#733e39).
    // Irregular mortar lines (M) cross a warm brick field (r/p) so it reads as
    // a collapsed wall seen from above — distinct from stone slabs or grass.
    name: "tile/heritage-floor-ruin",
    size: 16,
    pixels: [
      "rrrprrrrprrrrprr",
      "rMrMrMrMrMrMrMrM",
      "prrrrprrrrprrrrp",
      "rMMMrMMMrMMMrMMM",
      "rrprrrrprrrrprrr",
      "rMrMrMrMrMrMrMrM",
      "prrDDrprrDDrprrD",
      "rMrMDMrMrMDMrMrM",
      "rrrprrrrprrrrprr",
      "rMrMrMrMrMrMrMrM",
      "prrrrprrrrprrrrp",
      "rMMMrMMMrMMMrMMM",
      "rrprrrrpDrrrprrr",
      "rMrMrMrMrMrMrMrM",
      "prrrrprrrrprrrrp",
      "rMMMrMMMrMMMrMMM",
    ],
  }
;

export default recipe;
