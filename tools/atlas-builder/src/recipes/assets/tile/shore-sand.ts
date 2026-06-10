import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Sandy beach edge — a fuller wet-sand + foam band along the TOP edge, used
    // on farm-field island margins so they read as a soft sandy shore rather
    // than a hard wall. Authored top-edge-up like `tile/shore`, rotated to face
    // the water. w=foam, T=sand, W=tan/wet sand, e=ocean highlight.
    name: "tile/shore-sand",
    size: 16,
    pixels: [
      "wwwwwwwwwwwwwwww",
      "wewwwewwwewwweww",
      "TTTTTTTTTTTTTTTT",
      "TTWTTTWTTTWTTTWT",
      "TTTTTTTTTTTTTTTT",
      "WTTTWTTTWTTTWTTT",
      "TTTTTTTTTTTTTTTT",
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
