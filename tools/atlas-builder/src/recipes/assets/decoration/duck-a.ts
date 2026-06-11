import { type PixelRecipe } from "../../types";

// Small decorative duck (white body, gold beak, on a faint water ripple). a/b alternate for a paddle
// bob. decoration/ prefix → props sheet (alongside birds), so a rebuild never touches buildings/terrain.
const recipe: PixelRecipe = {
  name: "decoration/duck-a",
  size: 16,
  pixels: [
    "................",
    "................",
    "................",
    "......nn........",
    ".....nnnnn......",
    ".....nknno......",
    "....nnnnnn......",
    "...nnnnnnnn.....",
    "...nnnnnnnn.....",
    "....nnnnnn......",
    "...e.ee.ee......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};

export default recipe;
