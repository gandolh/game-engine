import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Static base; waterfall-a/b/c cascade overlaid by render loop (no determinism impact).
    name: "structure/waterfall",
    size: 16,
    pixels: [
      "..GcG......GcG..",
      ".QqkQ.vvvv.QkqQ.",
      ".QqkQ.vVVv.QkqQ.",
      ".QqkQ.vvvv.QkqQ.",
      ".QkQk.vVVv.kQkQ.",
      ".QqkQ.vvvv.QkqQ.",
      ".QqkQ.vVVv.QkqQ.",
      ".QkQk.vvvv.kQkQ.",
      ".QqkQ.vVVv.QkqQ.",
      ".QqkQ.vvvv.QkqQ.",
      ".QkQk.vVVv.kQkQ.",
      "..QkQ.vvvv.QkQ..",
      "...Q.ewwwe.Q....",
      "....ewwwwwe.....",
      "...eewwwwwee....",
      "....eeeeeee.....",
    ],
  }
;

export default recipe;
