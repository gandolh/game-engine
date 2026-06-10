import { type PixelRecipe } from "../../types";

// Sawhorse with a log being cut. X-legs (m) + crossbar, a log (d/D) on top.
const recipe: PixelRecipe =
  {
    name: "structure/sawhorse",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "....dddddddd....",
      "...dDdDdDdDdd...",
      "....dddddddd....",
      "..mmmmmmmmmmmm..",
      "...m.m....m.m...",
      "...m.m....m.m...",
      "..m...m..m...m..",
      "..m...m..m...m..",
      ".m....m..m....m.",
      ".m....m..m....m.",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
