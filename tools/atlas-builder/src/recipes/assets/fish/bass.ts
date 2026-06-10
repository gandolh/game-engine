import { type PixelRecipe } from "../../types";

// 2026-06-10 art pass — bass with a dark `l` back fading to a light `g`
// belly, so it reads as a shaded body instead of a flat green blob.
const recipe: PixelRecipe =
  {
    name: "fish/bass",
    size: 16,
    pixels: [
      "................",
      "................",
      "................",
      "......lll....l..",
      "....llGGGGG.ll..",
      "...lGGGGGGglll..",
      "..lGGGGGGGGgll..",
      "..GGGkGGGGGgl...",
      "..gGGGGGGGGgll..",
      "...gggGGGGGlll..",
      "....gggggGG.ll..",
      "......ggg....l..",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
