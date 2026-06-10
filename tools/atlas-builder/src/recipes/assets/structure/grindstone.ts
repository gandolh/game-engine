import { type PixelRecipe } from "../../types";

// ── Extra blacksmith yard detail props (16×16) ───────────────────────────────
// Grindstone — round whetstone on a wooden frame for sharpening blades.
const recipe: PixelRecipe =
  {
    name: "structure/grindstone",
    size: 16,
    pixels: [
      "................",
      "................",
      ".....QQQQ.......",
      "....QqqqqQ......",
      "...QqQQQQqQ.....",
      "...QqQkkQqQ.....",
      "...QqQkkQqQ.....",
      "...QqQQQQqQ.....",
      "....QqqqqQ......",
      "....mQQQQm......",
      "...mm....mm.....",
      "..mm......mm....",
      "..m........m....",
      "..m........m....",
      "................",
      "................",
    ],
  }
;

export default recipe;
