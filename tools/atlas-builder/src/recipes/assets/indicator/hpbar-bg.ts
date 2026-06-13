import { type PixelRecipe } from "../../types";

// HP bar background (depleted track): a solid rust-red (`r`) field with a near-black (`k`)
// border. The renderer draws this at full bar width, then overlays hpbar-fill scaled to the
// farmer's current HP fraction, so the red shows through as damage taken. EDG32 only.
const recipe: PixelRecipe =
  {
    name: "indicator/hpbar-bg",
    size: 16,
    pixels: [
      "kkkkkkkkkkkkkkkk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "krrrrrrrrrrrrrrk",
      "kkkkkkkkkkkkkkkk",
    ],
  }
;

export default recipe;
