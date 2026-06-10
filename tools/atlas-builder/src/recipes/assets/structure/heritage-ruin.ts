import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // brief 51 — ruined watchtower: a broken stone tower (light `q` mortar over
    // dark `Q` blocks) with a jagged, collapsed crown and a fallen-block rubble
    // skirt at its base, near-black `k` for window slits / cracks. Reads as a
    // crumbling fortification — distinct from the well (no roof/bucket) and the
    // mill (no sails). Purely decorative.
    name: "structure/heritage-ruin",
    size: 16,
    pixels: [
      "................",
      "....Q..QQ.......",
      "....QqQQQq......",
      "....QqQQQq......",
      "....QqkQkq......",
      "....QqQQQq......",
      "....QqQQQq......",
      "....QqkQkq......",
      "....QqQQQq......",
      "...QQqQQQqQ.....",
      "...QqQQQQQq.....",
      "..QQqQQQQQqQ....",
      "..QqQQQQQQQq....",
      ".QQ.QQqqQQ.QQ...",
      "QQq..QQQQ..qQQ..",
      "................",
    ],
  }
;

export default recipe;
