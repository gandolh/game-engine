import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — winter: snow with 2px drift shadows in light stone `q`
// (cool, not gray-noise), a couple of deeper `Q` hollows, and two dark `c`
// grass blades poking through the crust to keep it alive.
const recipe: PixelRecipe =
  {
    name: "tile/grass-winter",
    size: 16,
    pixels: [
      "nnnnnnnnnnnnnnnn",
      "nnqqnnnnnnnnnnnn",
      "nnnqnnnnnnqqnnnn",
      "nnnnnnnnnnnqnnnn",
      "nnnnnnnnnnnnnnnn",
      "nncnnnnnnnnnnnnn",
      "nncnnnnQqnnnnnnn",
      "nnnnnnnnqnnnqqnn",
      "nnnnnnnnnnnnnnnn",
      "nnnnqqnnnnnnnnnn",
      "nnnnnqQnnnnnnnnn",
      "nnnnnnnnnnnncnnn",
      "nqnnnnnnnnnncnnn",
      "nqqnnnnnqqnnnnnn",
      "nnnnnnnnnqnnnnnn",
      "nnnnnnnnnnnnnnnn",
    ],
  }
;

export default recipe;
