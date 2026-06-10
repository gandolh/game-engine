import { type PixelRecipe } from "../../types";

// ── brief 45 — seasonal grass variants ────────────────────────────────────────
// Render-only ground-tile treatments selected per-season in backdropFrame.
// Spring = the freshest base grass + light flecks; summer = deeper/drier base;
// autumn = golden/orange flecks over a tan-dried base; winter = snow-dusted.
// Each shares the base grass layout so they read as the SAME field changing
// through the year. All swatch chars are EDG32 (see SWATCH).
const recipe: PixelRecipe =
  {
    name: "tile/grass-spring",
    size: 16,
    pixels: [
      "ccCgccccccccgccc",
      "cCcccCccccGcccGc",
      "cccgcccccccCGccc",
      "cGcccccGcccccgcc",
      "ccCccccccGcccCcc",
      "ccGccccgccccccCc",
      "ccccCcccCGccccGc",
      "cgccccccccccCccc",
      "cGcccccGcccCGccc",
      "ccccgcccccccCcGc",
      "ccCcccccccGccccc",
      "ccccccGcccgcccGc",
      "cGcccCcccccccccc",
      "ccccccGcccccCccc",
      "cccGcccccGcGcccc",
      "ccgcccCccccccccc",
    ],
  }
;

export default recipe;
