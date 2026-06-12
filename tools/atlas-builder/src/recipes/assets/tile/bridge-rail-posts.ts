import { type PixelRecipe } from "../../types";

// Brief 83 item 1 — camera-side guard-rail POSTS (the rope is a separate frame, bridge-rail-rope, so
// it can sag between these while the posts stay grounded). Posts sit in the lower half (south/near
// edge); pushed above walkers in occluders.ts with the deck's sway + rotation. A vertical span reuses
// this rotated 90° → side-rail posts. Transparent elsewhere. EDG32 only.
const recipe: PixelRecipe =
  {
    name: "tile/bridge-rail-posts",
    size: 16,
    pixels: [
      "................", // 0
      "................", // 1
      "................", // 2
      "................", // 3
      "................", // 4
      "................", // 5
      "................", // 6
      "................", // 7
      "................", // 8
      "................", // 9
      "..M.....M....M..", // 10  posts at x=2,8,13
      "..M.....M....M..", // 11
      "..M.....M....M..", // 12
      "..M.....M....M..", // 13
      "..M.....M....M..", // 14
      "..N.....N....N..", // 15  post shadow at the deck contact
    ],
  }
;

export default recipe;
