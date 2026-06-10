import { type PixelRecipe } from "../../types";

// ── Intention bubble glyphs (Brief 40) ─────────────────────────────────────
// Each glyph is a small thought-bubble with a simple iconic fill rendered in
// the EDG32 palette. All use: k=near-black outline, w=white bubble body,
// with colour from existing SWATCH chars only.
//
// Legibility: 8×8 interior content area inside a 16×16 frame with a rounded
// bubble outline and a small speech-bubble tail at the bottom-left.
const recipe: PixelRecipe =
  {
    // Plant seed — a small seed (brown dot) with two green leaf tips above.
    name: "indicator/intention-plant",
    size: 16,
    pixels: [
      "................",
      "....kkkkkk......",
      "...kwwwwwwk.....",
      "...kwwlwwwk.....",
      "...kwwlwwwk.....",
      "...kwdwwwwk.....",
      "...kwwwwwwk.....",
      "...kwwwwwwk.....",
      "....kkkkkk......",
      ".....kk.........",
      "....kk..........",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
