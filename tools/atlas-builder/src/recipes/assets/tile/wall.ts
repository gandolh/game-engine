import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Island wall / cliff — a raised stone retaining wall along the TOP edge of
    // the tile, sitting on the LAND margin where it meets the ocean. Authored
    // top-edge-up like `tile/shore` and rotated (0/90/180/270) so the wall face
    // looks out over the adjacent water; transparent below so the land tile
    // shows through. q=stone light (cap), Q=stone dark (face), k=near-black
    // (shadow seam at the base of the cliff).
    name: "tile/wall",
    size: 16,
    pixels: [
      "qqqqqqqqqqqqqqqq",
      "qqqqqqqqqqqqqqqq",
      "QqQQqQQqQQqQQqQq",
      "QQQQQQQQQQQQQQQQ",
      "QQkQQQkQQQkQQQkQ",
      "QQQQQQQQQQQQQQQQ",
      "kkkkkkkkkkkkkkkk",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
