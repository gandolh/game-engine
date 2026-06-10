import { type PixelRecipe } from "../../types";

// Campfire — static BASE (the spawned landmark). A ring of stones (`Q`/`q`)
// around two crossed logs (`d`/`D`) with a small resting ember (`r`/`o`). The
// animated flame (campfire-a/b/c) is layered ON TOP by the render loop as a
// wall-clock overlay (no determinism impact), exactly like the forge fire over
// the oven. EDG palette only (fire reds/oranges + wood + stone).
const recipe: PixelRecipe =
  {
    name: "structure/campfire",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......ror.......",
      ".....rooor......",
      "....Q.dDd.Q.....",
      "...Qq.DdD.qQ....",
      "...Qq.dDd.qQ....",
      "....QqqqqqQ.....",
      ".....QQQQQ......",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
