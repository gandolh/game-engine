import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // brief 52 — waterfall BASE: the static rock/cliff the water falls over. A
    // mossy dark-stone gorge (stone dark `Q`, light `q`, near-black `k` seams, with
    // a little grass `G`/`c` cap on the clifftop) framing a recessed water channel
    // (ocean `v`, deep `V`) that ends in a foaming plunge pool (`e` ocean foam,
    // cream `w` froth) at the base. Drawn as the landmark; the bright animated
    // cascade streaks are layered ON TOP by the render loop (structure/waterfall-a/
    // b/c). Distinct from every other structure (a vertical gorge, not a tower or
    // ring). Purely decorative.
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
