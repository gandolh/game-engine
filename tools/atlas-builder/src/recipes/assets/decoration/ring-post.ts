import { type PixelRecipe } from "../../types";

// Boxing-ring corner post, 1×2 tiles (16×32), bottom-anchored. A padded wood
// turnbuckle post: red padded cap (R/x) on top, wood shaft (D/d/h) below, with
// three rope-tie rings (w) where the ropes lash on, on a dark base (k/Q).
const recipe: PixelRecipe = {
  name: "decoration/ring-post",
  size: 16,
  width: 16,
  height: 32,
  pixels: [
    "................",
    "......xRRx......",
    ".....xRRRRx.....",
    ".....RRRRRR.....",
    ".....RRRRRR.....",
    ".....xRRRRx.....",
    "......xRRx......",
    "......dDDd......",
    "......dwwd......",
    "......dDDd......",
    "......hDDh......",
    "......dDDd......",
    "......dwwd......",
    "......dDDd......",
    "......hDDh......",
    "......dDDd......",
    "......dDDd......",
    "......dwwd......",
    "......dDDd......",
    "......hDDh......",
    "......dDDd......",
    "......dDDd......",
    "......dDDd......",
    "......hDDh......",
    "......dDDd......",
    "......dDDd......",
    ".....dDDDDd.....",
    ".....kDDDDk.....",
    "....kQQQQQQk....",
    "....kQQQQQQk....",
    "....kkkkkkkk....",
    "................",
  ],
};

export default recipe;
