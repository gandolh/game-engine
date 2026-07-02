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

/** Number of cozy-flame flicker frames (cycled on the render clock). */
export const FLAME_FRAME_COUNT = 3;
/** Frame name for flame flicker step `i` (0 → the base `fx/flame`). */
export function flameFrameName(i: number): string {
  return i === 0 ? "fx/flame" : `fx/flame@${i}`;
}

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

/**
 * A cozy stylised FLAME frame (art-07) — a warm teardrop drawn on a small
 * transparent tile, with a hue-shifted ramp from a `crimson` base through
 * `orange`/`gold` to a `yellow` hot core + tip. `sway` (−1|0|+1) leans the tip
 * for the flicker cycle. Storybook fire, not realistic — bold, few values,
 * palette-snapped. Rendered stamped over a burning building (footprint-scaled),
 * so it is authored small (a single tile) and sampled up. Pure of `sway`.
 */
function flame(name: string, sway: number): PixelRecipe {
  const W = 16, H = 24;
  const g = new Grid(W, H);
  const cx = W / 2;
  // Teardrop: wide rounded base tapering to a leaning tip. For each row, a
  // half-width that grows from the tip (top) to ~2/3 down then shrinks to the base.
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);                 // 0 tip … 1 base
    // bulge profile: narrow at the very top, widest ~70% down, rounding to base.
    const prof = Math.sin(Math.min(1, t * 1.15) * Math.PI);
    const half = Math.max(0, Math.round(prof * (W / 2 - 1)));
    // tip leans by `sway`, easing to 0 at the base.
    const lean = Math.round(sway * (1 - t) * 3);
    const mid = cx + lean;
    for (let dx = -half; dx <= half; dx++) {
      const x = Math.round(mid + dx);
      const f = Math.abs(dx) / Math.max(1, half); // 0 core … 1 edge
      // Warm ramp: yellow hot core → gold → orange → crimson cooler edge; the
      // upper third (tip) skews hotter (yellow/gold), the base skews to orange/crimson.
      let ch: string;
      if (t < 0.35) ch = f < 0.6 ? "y" : "O";               // tip: yellow core, gold edge
      else if (f < 0.35) ch = "y";                           // inner core stays hot
      else if (f < 0.7) ch = "O";                            // gold mid
      else ch = t > 0.7 ? "e" : "o";                         // orange body, crimson base edge
      g.set(x, y, ch);
    }
  }
  return g.toRecipe(name);
}

function flameFrames(): PixelRecipe[] {
  const sways = [0, 1, -1]; // straight, lean right, lean left — the flicker cycle
  return sways.map((s, i) => flame(flameFrameName(i), s));
}

export const FX_RECIPES: readonly PixelRecipe[] = [diamond(), road(), bridge(), ...flameFrames()];
