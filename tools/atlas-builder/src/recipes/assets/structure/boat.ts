import { type PixelRecipe } from "../../types";

// ── brief 48 — Boats & Coral Fishing static decorations ────────────────────
// structure/boat — a moored rowboat at the dock tile (south edge of each
// fishing isle). Top-down perspective: wood hull (d/D), dark outline/shadow
// (M/k), a pair of oars (m), and shallow ocean reflections (v/e) on either
// side so the boat reads as floating. Purely static — the boat never moves.
const recipe: PixelRecipe =
  {
    name: "structure/boat",
    size: 16,
    pixels: [
      "................",
      "....vvvvvvvv....",
      "...vvDDDDDDvv...",
      "...vDddddddDv...",
      "...vDddmdddDv...",
      "...vDdmmmddDv...",
      "...vDddmdddDv...",
      "...vDddddddDv...",
      "...vvDDDDDDvv...",
      "....vevvvvev....",
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
