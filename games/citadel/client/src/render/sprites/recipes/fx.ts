/**
 * FX recipes — non-building, non-unit sprite frames used by the iso renderer.
 *
 * `fx/diamond` is a white 2:1 diamond (ISO_TILE_W × ISO_TILE_H) on transparent,
 * drawn tinted for flat ground-plane quads: the placement ghost, cluster
 * borders, and footprint shadows. Drawing these as a real diamond (instead of an
 * axis-aligned box) is what makes them sit FLAT on the iso grid. White so the
 * per-instance tint fully colors it.
 *
 * `fx/road` and `fx/bridge` are TEXTURED versions of that diamond used for the
 * road/bridge networks — a cobblestone path and a railed wooden plank deck — so
 * those tiles read as real surfaces rather than a flat tinted lozenge. They are
 * authored in their own EDG colors (drawn untinted, tint = white).
 */
import type { PixelRecipe } from "../types";
import { Grid } from "./draw";

/** Frame name for the flat iso ground diamond. */
export const FRAME_DIAMOND = "fx/diamond";
/** Frame name for the cobblestone road diamond. */
export const FRAME_ROAD = "fx/road";
/** Frame name for the wooden plank bridge diamond. */
export const FRAME_BRIDGE = "fx/bridge";

/** Iso diamond pixel dims — must match ISO_TILE_W / ISO_TILE_H in iso.ts. */
const DW = 32;
const DH = 16;

/** Half-width of the 2:1 diamond at row y (linear taper from the centre row). */
function halfAt(y: number): number {
  const cy = (DH - 1) / 2;
  const t = 1 - Math.abs(y - cy) / (DH / 2);
  return Math.max(0, Math.round((DW / 2) * t));
}

/** Run a callback over every interior diamond pixel (x,y, and its distance to
 *  the diamond edge on that row), so a recipe can shade by depth. */
function forEachDiamondPixel(fn: (x: number, y: number, half: number, edgeDist: number) => void): void {
  const cx = DW / 2;
  for (let y = 0; y < DH; y++) {
    const half = halfAt(y);
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      fn(x, y, half, half - Math.abs(dx));
    }
  }
}

/** Build the filled-white 2:1 diamond recipe — the generic tinted ground quad. */
function diamond(): PixelRecipe {
  const g = new Grid(DW, DH);
  forEachDiamondPixel((x, y) => g.set(x, y, "v"));
  return g.toRecipe(FRAME_DIAMOND);
}

/**
 * Cobblestone road diamond: a slate base speckled with a deterministic 2-tone
 * cobble pattern (steel + silver stones, ink mortar) and a darker rim, so a run
 * of road tiles reads as a paved path rather than a flat navy lozenge. The
 * pattern is a fixed checker-ish hash of (x,y) — pure, no RNG.
 */
function road(): PixelRecipe {
  const g = new Grid(DW, DH);
  forEachDiamondPixel((x, y, _half, edgeDist) => {
    if (edgeDist === 0) {
      g.set(x, y, "i"); // dark mortar rim
      return;
    }
    // Two interleaving cobble tones + occasional mortar gaps, from a stable hash.
    const hsh = (x * 7 + y * 13) & 7;
    const ch = hsh === 0 ? "i" : ((x + y) & 1) === 0 ? "S" : (hsh & 1) === 0 ? "s" : "l";
    g.set(x, y, ch);
  });
  return g.toRecipe(FRAME_ROAD);
}

/**
 * Wooden plank bridge diamond: a tan/wood deck of planks running across the
 * tile, twin rope-brown rails on the two near edges, and dark water-gap mortar
 * between planks, so a span reads as a built crossing over water. Pure.
 */
function bridge(): PixelRecipe {
  const g = new Grid(DW, DH);
  forEachDiamondPixel((x, y, _half, edgeDist) => {
    if (edgeDist === 0) {
      // Outer rim = the bridge's edge beams / rope rail (dark wood).
      g.set(x, y, "W");
      return;
    }
    if (edgeDist === 1) {
      // Inner rail highlight just inside the beams.
      g.set(x, y, "%");
      return;
    }
    // Deck planks: alternating wood/tan bands every 2 rows, ink seams between.
    const band = Math.floor(y / 2) & 1;
    const seam = (x & 3) === 0; // periodic plank gap
    g.set(x, y, seam ? "%" : band === 0 ? "w" : "t");
  });
  return g.toRecipe(FRAME_BRIDGE);
}

export const FX_RECIPES: readonly PixelRecipe[] = [diamond(), road(), bridge()];
