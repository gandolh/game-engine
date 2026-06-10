import { type PixelRecipe } from "../../../types";

// 2026-06-10 art pass — grapes are finally PURPLE (EDG32 `U`/`u`, unused until
// now): bunch lit top-left with a white `w` glint, hue-shifted `u` shadow
// bottom-right, leaf crown lit with `L`.
const recipe: PixelRecipe =
  {
    name: "crop/grape/mature",
    size: 16,
    pixels: [
      "................",
      "......lLl.......",
      ".....lLlll......",
      "....lLlllll.....",
      "....l.wUU.l.....",
      "....lUUUUul.....",
      "....lUUUUuul....",
      "....lUUuuul.....",
      ".....l.uuu.l....",
      "......lllll.....",
      ".......l........",
      "......dkd.......",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
