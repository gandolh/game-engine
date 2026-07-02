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
 * Cobblestone road diamond: a WARM packed-cobble path — an earthy `wood`/`bark`
 * base speckled with a deterministic 2-tone cobble pattern (`tan`/`clay` lit
 * stones, `wood`/`woodDark` shaded stones) and warm `bark` mortar gaps, so a run
 * of road tiles reads as sun-warmed packed stone rather than a cold-grey lozenge
 * (per the cozy iso art bible: "roads read warm, not cold-grey"). The pattern is
 * a fixed checker-ish hash of (x,y) — pure, no RNG.
 *
 * ABUTMENT / PIXEL-TANGENT (art-02-E2): framed roads use `band=1`, so adjacent
 * diamonds meet edge-to-edge and both baked rims stack into a doubled dark line
 * down a straight run (a "pixel tangent" the style bible forbids). We keep the
 * rim (an isolated tile / network end still needs a readable silhouette) but (1)
 * warm it from cold `ink` to `woodDark` and (2) DITHER it — every other rim
 * pixel is the interior cobble tone instead of the rim tone — so where two runs
 * abut the doubled seam reads as a soft broken warm edge, not a hard black bar.
 * See the sub-phase-E report: per-edge rim suppression (a 16-mask autotile set,
 * or renderer-side segment skipping via `IsoNetworkTile.abut`) is deferred as
 * too costly/risky vs. this soft-warm-seam fallback.
 */
function road(): PixelRecipe {
  const g = new Grid(DW, DH);
  forEachDiamondPixel((x, y, _half, edgeDist) => {
    // Warm cobble body: two interleaving stone tones (lit `tan`/`clay`, shaded
    // `wood`/`woodDark`) + occasional `bark` mortar gaps, from a stable hash.
    // 3+ hue-shifted value bands: tan (light) → clay → wood → woodDark (dark).
    const hsh = (x * 7 + y * 13) & 7;
    const body = hsh === 0 ? "%" : ((x + y) & 1) === 0 ? (hsh & 2) === 0 ? "t" : "r" : (hsh & 1) === 0 ? "w" : "W";
    if (edgeDist === 0) {
      // Softened warm rim: dithered `woodDark` so a straight-run abutment reads
      // as a soft broken warm seam, not a doubled hard line — but a network end
      // / isolated tile still shows a clear darker silhouette every other pixel.
      g.set(x, y, ((x ^ y) & 1) === 0 ? "W" : body);
      return;
    }
    g.set(x, y, body);
  });
  return g.toRecipe(FRAME_ROAD);
}

/**
 * Wooden plank bridge diamond: a WARM tan/wood deck of planks running across the
 * tile, twin rope-brown rails on the two near edges, and warm `bark` water-gap
 * seams between planks, so a span reads as a built timber crossing. Timber tones
 * are hue-shifted across `tan`/`wood`/`woodDark`/`bark` (light→dark). Pure.
 *
 * ABUTMENT (art-02-E2): the outer beam rim doubles where a bridge run abuts
 * itself or the road it meets. The beam is already warm `woodDark`, and here we
 * DITHER the outer rim (every other pixel drops to the deck tone) so an abutment
 * seam reads as a soft broken beam rather than a hard doubled line, while a lone
 * bridge tile / span end still shows a clear railed silhouette. See road() for
 * why per-edge suppression via `abut` is deferred.
 */
function bridge(): PixelRecipe {
  const g = new Grid(DW, DH);
  forEachDiamondPixel((x, y, _half, edgeDist) => {
    // Deck plank tone at (x,y): alternating wood/tan bands every 2 rows, warm
    // `bark` seams between planks.
    const bandRow = Math.floor(y / 2) & 1;
    const seam = (x & 3) === 0; // periodic plank gap
    const deck = seam ? "%" : bandRow === 0 ? "w" : "t";
    if (edgeDist === 0) {
      // Softened warm beam rim: dithered `woodDark` so abutting spans read soft.
      g.set(x, y, ((x ^ y) & 1) === 0 ? "W" : deck);
      return;
    }
    if (edgeDist === 1) {
      // Inner rail highlight just inside the beams (warm bark shadow line).
      g.set(x, y, "%");
      return;
    }
    g.set(x, y, deck);
  });
  return g.toRecipe(FRAME_BRIDGE);
}

export const FX_RECIPES: readonly PixelRecipe[] = [diamond(), road(), bridge()];
