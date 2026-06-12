import { type PixelRecipe } from "../../types";

// Brief 83 item 1 — raised camera-side guard rope, an overlay drawn ABOVE walkers (occluders.ts pushes
// it a couple layers over ENTITY_LAYER) so a farmer on the deck reads as standing *behind* the rope —
// between it and the deck's flat far rope. Authored horizontal (rope along the bottom margin); a
// vertical span reuses this frame rotated 90° (computeBridges), turning the near rope into a side rail.
// Transparent everywhere else so the planks + far rope show through. Sways with the deck. EDG32 only.
const recipe: PixelRecipe =
  {
    name: "tile/bridge-rail-near",
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
      "................", // 10
      "HhHhHhHhHhHhHhHh", // 11  raised twisted guard rope (tan H / highlight h) — lifted off the deck
      "..M.....M....M..", // 12  posts (dark) at x=2,8,13 holding the rope up
      "..M.....M....M..", // 13  posts continue
      "..N.....N....N..", // 14  post shadow where it meets the deck (cool navy)
      "................", // 15
    ],
  }
;

export default recipe;
