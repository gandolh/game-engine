import { type PixelRecipe } from "../../types";

// ── Extra carpenter yard detail props (16×16) ────────────────────────────────
// Lumber rack — a frame holding long boards on end, leaning at angles.
const recipe: PixelRecipe =
  {
    name: "structure/lumber-rack",
    size: 16,
    pixels: [
      "................",
      ".W..W.W..W..W...",
      ".W..W.W..W..W...",
      ".W..W.W..W.W....",
      ".W.W..W.W..W....",
      ".W.W..W.W.W.....",
      ".WW...WW.W.W....",
      "MMMMMMMMMMMMM...",
      ".WW...WW..WW....",
      ".W.W..W.W..W....",
      ".W..W.W..W.W....",
      "MMMMMMMMMMMMM...",
      "..m........m....",
      "..m........m....",
      "................",
      "................",
    ],
  }
;

export default recipe;
