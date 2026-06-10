import { type PixelRecipe } from "../../types";

// ── Forge chimney smoke (animated overlay, drawn above the forge-house) ───────
// Three frames of a rising smoke puff, cycled by the render loop like the forge
// fire. Transparent base; s/S = steel/slate smoke greys, drifting up.
const recipe: PixelRecipe =
  {
    name: "structure/forge-smoke-a",
    size: 16,
    pixels: [
      "......ss........",
      ".....sSSs.......",
      ".....sSSs.......",
      "......ss........",
      "......s.........",
      "......s.........",
      "................",
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
