import { type PixelRecipe } from "../../types";

// Fishing rod — wooden pole (m/d) with a line (q) and a gold hook glint (o).
const recipe: PixelRecipe =
  {
    name: "tool/fishing-rod",
    size: 16,
    pixels: [
      "................",
      ".............dq.",
      "............d..q",
      "...........d...q",
      "..........d...q.",
      ".........d..oq..",
      "........d.......",
      ".......d........",
      "......d.........",
      ".....d..........",
      "....m...........",
      "...m............",
      "..m.............",
      ".m..............",
      "m...............",
      "................",
    ],
  }
;

export default recipe;
