/**
 * FX recipes — non-building, non-unit sprite frames used by the iso renderer.
 *
 * `fx/diamond` is a white 2:1 diamond (ISO_TILE_W × ISO_TILE_H) on transparent,
 * drawn tinted for flat ground-plane quads: road/wall tiles, the placement
 * ghost, cluster borders, and footprint shadows. Drawing these as a real diamond
 * (instead of an axis-aligned box) is what makes them sit FLAT on the iso grid.
 * White so the per-instance tint fully colors it.
 */
import type { PixelRecipe } from "../types";
import { Grid } from "./draw";

/** Frame name for the flat iso ground diamond. */
export const FRAME_DIAMOND = "fx/diamond";

/** Iso diamond pixel dims — must match ISO_TILE_W / ISO_TILE_H in iso.ts. */
const DW = 32;
const DH = 16;

/** Build the filled-white 2:1 diamond recipe (rows widen to the middle, then
 *  narrow), with `v` (EDG.white) fill. Pure. */
function diamond(): PixelRecipe {
  const g = new Grid(DW, DH);
  const cx = DW / 2;
  const cy = (DH - 1) / 2;
  for (let y = 0; y < DH; y++) {
    // Half-width of the diamond at row y: linear taper from the centre row.
    const t = 1 - Math.abs(y - cy) / (DH / 2);
    const half = Math.max(0, Math.round((DW / 2) * t));
    g.hLine(cx - half, y, half * 2, "v");
  }
  return g.toRecipe(FRAME_DIAMOND);
}

export const FX_RECIPES: readonly PixelRecipe[] = [diamond()];
