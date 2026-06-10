import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — a salmon that looks like one: bright-red `R` back,
// petal-pink `P` flank (EDG32 #f6757a, first use), white `w` belly, flame `f`
// tail fin. Same silhouette as before.
const recipe: PixelRecipe =
  {
    name: "fish/salmon",
    size: 16,
    pixels: [
      "................",
      "................",
      "......RRR....f..",
      "....RRRRRRR.ff..",
      "...RRRRPPPPfff..",
      "..RRPPPPPPPPff..",
      ".RPPPPPPPPPPf...",
      ".PPPkPPPPPPPff..",
      ".wPPPPPPPPPPf...",
      "..wwPPPPPPPPff..",
      "...wwwwPPPPfff..",
      "....wwwwwww.ff..",
      "......www....f..",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
