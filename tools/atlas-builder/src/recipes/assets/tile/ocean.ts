import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Ocean — fills the gaps between/around the playable regions so the world
    // reads as islands in an ocean. Drawn under everything (it's non-walkable).
    // Gentle wave flecks (e) over two blues (v deeper between, V base) give the
    // water some life without animating. (Animated foam is a separate dynamic
    // overlay — see tile/foam-a/b/c.)
    name: "tile/ocean",
    size: 16,
    pixels: [
      "VVVVVVVVVVVVVVVV",
      "VVVVeVVVVVVVeVVV",
      "VVVVVVVVVVVVVVVV",
      "VVeVVVVVVeVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVeVVVVVVVeV",
      "VVVVVVVVVVVVVVVV",
      "eVVVVVVVVeVVVVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVeVVVVVVVVeVVV",
      "VVVVVVVVVVVVVVVV",
      "VVVVVVeVVVVeVVVV",
      "VVeVVVVVVVVVVVVV",
      "VVVVVVVVVeVVVVVV",
      "VVVVeVVVVVVVVeVV",
      "VVVVVVVVVVVVVVVV",
    ],
  }
;

export default recipe;
