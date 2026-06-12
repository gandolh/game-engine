import { type PixelRecipe } from "../../types";

// Brief 83 item 1 — the guard ROPE itself (twisted tan strand), drawn just above the posts'
// resting height. occluders.ts pushes it above walkers and offsets its Y by a per-tile catenary sag
// (0 at the anchored span ends → max mid-span), so across a span the rope visibly droops between
// posts like a rustic handrail. Two rows give it a braided look. Transparent elsewhere. EDG32 only.
const recipe: PixelRecipe =
  {
    name: "tile/bridge-rail-rope",
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
      "HhHhHhHhHhHhHhHh", // 8  rope strand (tan H / highlight h)
      "hHhHhHhHhHhHhHhH", // 9  offset twist → braided
      "................", // 10
      "................", // 11
      "................", // 12
      "................", // 13
      "................", // 14
      "................", // 15
    ],
  }
;

export default recipe;
