import { type PixelRecipe } from "../../types";

// Hostile indicator: an angry red-tinted bubble face with angled brows — shown while a
// farmer is chasing/challenging a rival (intention.kind === "challenge"). Mirrors the
// shape of intention-meet but swaps the cream fill for rust red (`r`) so it reads as
// aggression at a glance. `k` outline, `r` red fill, `w` cream brows/eyes.
const recipe: PixelRecipe =
  {
    name: "indicator/intention-hostile",
    size: 16,
    pixels: [
      "................",
      "....kkkkkk......",
      "...krrrrrrk.....",
      "...krwkkwrk.....",
      "...krkwwkrk.....",
      "...krrwwrrk.....",
      "...krrrrrrk.....",
      "...krwrrwrk.....",
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
