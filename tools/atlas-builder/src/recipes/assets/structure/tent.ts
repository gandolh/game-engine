import { type PixelRecipe } from "../../types";

// ── Camping island (brief 54) ───────────────────────────────────────────────
// The big TENT — island centerpiece. A wide canvas A-frame tent: cream/white
// canvas (`w`) with red trim/banding (`r`), a dark triangular door opening (`k`)
// and wood pole/peg detail (`d`/`D`) at the base, on a little grass apron
// (`G`/`c`). Larger visual weight than the other landmarks — it fills most of
// the 16×16 cell and reads clearly as a tent (a broad triangle, distinct from
// the towers/rings/statues). Purely decorative; the rest effect is region-gated.
const recipe: PixelRecipe =
  {
    name: "structure/tent",
    size: 16,
    pixels: [
      "................",
      ".......w........",
      "......www.......",
      "......wrw.......",
      ".....wwrww......",
      ".....wwrww......",
      "....wwwrwww.....",
      "....wwrkrww.....",
      "...wwwrkrwww....",
      "...wwrrkrrww....",
      "..wwwrrkrrwww...",
      "..wrwrrkrrwrw...",
      ".dwwwwrkrwwwwd..",
      ".DGcwwwwwwwcGD..",
      "..GGcGGGGGcGG...",
      "...cGGGGGGGc....",
    ],
  }
;

export default recipe;
