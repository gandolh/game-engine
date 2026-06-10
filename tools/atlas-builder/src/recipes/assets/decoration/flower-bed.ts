import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — the old red/green checkerboard becomes an actual
// flower patch: three staggered rows of blooms in the new EDG32 hues (petal
// pink `P`, gold `y`, grape `U`, white `n`) over lit foliage.
const recipe: PixelRecipe =
  {
    name: "decoration/flower-bed",
    size: 16,
    pixels: [
      "................",
      "................",
      "....P..y..U.....",
      "...lLllLllLl....",
      "....n..P..y.....",
      "...lLllLllLl....",
      "....y..U..P.....",
      "...lLllLllLl....",
      "....cccccccc....",
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
