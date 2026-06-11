import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Authored horizontal; vertical bridges reuse this frame rotated 90° (computeBridges) — so the
    // top/bottom rope rails become the left/right rails when vertical. Tiles seamlessly along x:
    // rope twist `Hh` (period 2) and plank slats `hddD` (period 4) both repeat evenly across 16px.
    // Plank depth: each slat has a light left edge (h) → body (dd) → dark gap (D). Render loop sways it.
    name: "tile/bridge-h",
    size: 16,
    pixels: [
      "vvvvvvvvvvvvvvvv", // 0  water gap (edge floats over ocean)
      "HhHhHhHhHhHhHhHh", // 1  top rope rail (twisted: tan H / highlight h)
      "MMMMMMMMMMMMMMMM", // 2  support beam under the rope (dark)
      "hddDhddDhddDhddD", // 3  planks: highlight-left, body, dark gap
      "hddDhddDhddDhddD", // 4
      "hddDhddDhddDhddD", // 5
      "hddDhddDhddDhddD", // 6
      "hddDhddDhddDhddD", // 7
      "hddDhddDhddDhddD", // 8
      "hddDhddDhddDhddD", // 9
      "hddDhddDhddDhddD", // 10
      "hddDhddDhddDhddD", // 11
      "hddDhddDhddDhddD", // 12
      "MMMMMMMMMMMMMMMM", // 13 support beam
      "HhHhHhHhHhHhHhHh", // 14 bottom rope rail
      "vvvvvvvvvvvvvvvv", // 15 water gap
    ],
  }
;

export default recipe;
