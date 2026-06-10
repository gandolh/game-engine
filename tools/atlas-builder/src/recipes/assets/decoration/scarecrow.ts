import { type PixelRecipe } from "../../types";

// ── Decorations ──────────────────────────────────────────────────────────────
// 2026-06-10 art pass — full redraw: straw hat (lit `y`, shaded `o`), burlap
// head (`h`/`H`) with navy `N` stitch eyes, patched red shirt (`r` with an `x`
// patch), straw `W` poking from the sleeves, and a cheeky crow (`k` + flame
// `f` beak) perched on the crossbar — a scarecrow that isn't working.
const recipe: PixelRecipe =
  {
    name: "decoration/scarecrow",
    size: 16,
    pixels: [
      "................",
      "......yyy.......",
      ".....yyyyo......",
      "....yyyyyyo.....",
      "......hhH.......",
      ".....hNhNH..k...",
      "......hhH..kkf..",
      "..mmmrrrrrmmmm..",
      "..W...rxrr..W...",
      "......rrrr......",
      "......rxrr......",
      "......WWW.......",
      ".......M........",
      ".......M........",
      "................",
      "................",
    ],
  }
;

export default recipe;
