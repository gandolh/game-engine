import { type PixelRecipe } from "../../types";

// A leafy houseplant in a terracotta pot: rounded foliage shaded NW->SE (bright
// green crown to greenDark underside) rising from a pot with a lit tan rim and a
// clay body deepening to rust on the shaded side.
const recipe: PixelRecipe =
  {
    name: "decoration/potted-plant",
    size: 16,
    pixels: [
      "................",
      "......gg........",
      ".....gGGl.......",
      "....gGGGGl......",
      "...gGGGGlll.....",
      "....GGllll......",
      ".....Gllt.......",
      "......gl........",
      ".....WWWWW......",
      ".....pppppr.....",
      ".....pppprr.....",
      "......pprr......",
      ".......rr.......",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
