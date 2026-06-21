/**
 * Sub-tile terrain dither (brief 13) + terrain bake callback — pure,
 * deterministic, tested.
 *
 * Each terrain cell gets 1–3 small darker/lighter pixel clusters, chosen by a
 * pure integer hash of (tx, ty, type). No RNG, no Math.random — identical every
 * frame, never persisted to save data (it's a render-only bake decoration).
 *
 * Also owns `makeTerrainDecorate`: the static-layer bake callback that paints
 * the terrain grid and applies sub-tile dither clusters.
 */
import { EDG } from "@engine/core";
import type { Ctx2D } from "@engine/core";
import { TerrainType, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";
import { TERRAIN_COLORS } from "./quads";
import type { TileWindow } from "./render-window";
import { tileDiamond, tileCenterToIso, ISO_HW, ISO_HH } from "./iso";

// ---------------------------------------------------------------------------
// makeTerrainDecorate (static-layer bake callback)
// ---------------------------------------------------------------------------

/**
 * Build the decorate callback that paints the terrain grid into the baked
 * static layer (a texture on the WebGPU backend). Each cell is a
 * TILE_SIZE×TILE_SIZE EDG-colored rect plus sub-tile dither.
 *
 * Tiles are always drawn in WORLD coordinates (`tx * TILE_SIZE`). For a windowed
 * sub-region bake (Citadel 21), the engine translates the bake ctx by -origin so
 * the world-coord fills land on the smaller texture — and passing `window` here
 * restricts the loop to just those tiles so a re-bake costs window-many fills,
 * not whole-grid-many. Omitting `window` paints the entire grid (byte-identical
 * to the whole-world bake).
 */
export function makeTerrainDecorate(
  grid: TerrainGrid,
  window?: TileWindow,
): (ctx: Ctx2D, wpx: number, hpx: number) => void {
  const minTx = window ? Math.max(0, window.minTx) : 0;
  const minTy = window ? Math.max(0, window.minTy) : 0;
  const maxTx = window ? Math.min(grid.width - 1, window.maxTx) : grid.width - 1;
  const maxTy = window ? Math.min(grid.height - 1, window.maxTy) : grid.height - 1;
  return (ctx: Ctx2D): void => {
    // Paint each terrain cell as an ISO DIAMOND at its projected position, back
    // (top) to front (bottom) so a tiny diamond-edge overlap covers seams. The
    // bake canvas is the iso-world-px texture (origin 0,0), so tileToIso coords
    // land directly. Render-only; the elevation field now drives a small real
    // height lift for relief.
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = grid.cells[ty * grid.width + tx] as TerrainType;
        const elev = elevationField(tx, ty); // [0,1]
        // Lift up to one height-step on the highest ground for subtle relief.
        const lift = Math.round(elev * 1);
        const [top, right, bottom, left] = tileDiamond(tx, ty, lift) as [
          { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
        ];
        ctx.fillStyle = TERRAIN_COLORS[t] ?? EDG.green;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.lineTo(left.x, left.y);
        ctx.closePath();
        ctx.fill();
        // Sub-tile dither: place the deterministic clusters around the diamond
        // centre (kept inside the diamond by scaling their tile-space offset to
        // the diamond's half extents).
        const c0 = tileCenterToIso(tx, ty, lift);
        for (const c of ditherClusters(tx, ty, t)) {
          // Map the cluster's in-tile (x,y)∈[0,TILE_SIZE) to a diamond-local
          // offset: shrink toward centre so specks stay on the diamond face.
          const fx = (c.x + c.size / 2) / TILE_SIZE - 0.5; // [-0.5,0.5]
          const fy = (c.y + c.size / 2) / TILE_SIZE - 0.5;
          const px = c0.x + fx * ISO_HW;
          const py = c0.y + fy * ISO_HH;
          ctx.fillStyle = c.hex;
          ctx.fillRect(Math.round(px), Math.round(py), c.size, c.size);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Sub-tile terrain dither
// ---------------------------------------------------------------------------

/**
 * Cheap pure integer coordinate hash → unsigned 32-bit int. Mixes tx, ty, type
 * with distinct odd multipliers + an xorshift finalizer so adjacent cells and
 * different types diverge. Self-contained (no sim dependency) by design.
 */
export function ditherHash(tx: number, ty: number, type: number): number {
  let h = (tx * 0x1f1f1f1f) ^ (ty * 0x8da6b343) ^ (type * 0xd2511f53);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Coarse elevation relief (idea ported from tiny-world-builder's height strata)
// ---------------------------------------------------------------------------

/**
 * Cheap value-noise sample in [0,1] at a continuous (x, y). Pure — same
 * `ditherHash` corner hashes bilinearly blended with a smoothstep, so it has no
 * dependency on the sim, no RNG, and is identical every call. Used only as a
 * render decoration (see `elevationField`).
 */
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // smoothstep weights for cr-soft interpolation between cell corners.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  // Corner hashes → [0,1). Reuse ditherHash (type arg fixed) for the corners.
  const c00 = ditherHash(x0, y0, 0) / 0xffffffff;
  const c10 = ditherHash(x0 + 1, y0, 0) / 0xffffffff;
  const c01 = ditherHash(x0, y0 + 1, 0) / 0xffffffff;
  const c11 = ditherHash(x0 + 1, y0 + 1, 0) / 0xffffffff;
  const top = c00 + (c10 - c00) * sx;
  const bot = c01 + (c11 - c01) * sx;
  return top + (bot - top) * sy;
}

/**
 * Coarse elevation field in [0,1] for a terrain cell: a low-frequency
 * `valueNoise` sample so neighbouring cells share a smooth "height". The
 * `ELEVATION_SCALE` divisor sets the wavelength — smaller = broader hills.
 * 0 ≈ shaded valley, 1 ≈ sun-lit high ground. Pure, render-only — never
 * persisted, never touches the sim. Inspired by tiny-world-builder's
 * height-strata terrain tinting, adapted to our flat 2D dither.
 */
export const ELEVATION_SCALE = 9;

export function elevationField(tx: number, ty: number): number {
  return valueNoise(tx / ELEVATION_SCALE, ty / ELEVATION_SCALE);
}

/** A darker + lighter EDG accent swatch per terrain type. */
export interface DitherAccents {
  /** Darker EDG swatch hex. */
  dark: string;
  /** Lighter EDG swatch hex. */
  light: string;
}

/**
 * Per-terrain-type dither accents: a darker and a lighter EDG swatch flanking
 * the base TERRAIN_COLORS hue. Covers every TerrainType. EDG-only.
 */
export const DITHER_ACCENTS: Record<TerrainType, DitherAccents> = {
  [TerrainType.Grass]: { dark: EDG.greenDark, light: EDG.green },
  [TerrainType.Water]: { dark: EDG.blue, light: EDG.cyan },
  [TerrainType.Forest]: { dark: EDG.teal, light: EDG.greenMid },
  [TerrainType.Stone]: { dark: EDG.ink, light: EDG.steel },
  [TerrainType.Rough]: { dark: EDG.woodDark, light: EDG.tan },
};

const FALLBACK_ACCENTS: DitherAccents = { dark: EDG.ink, light: EDG.white };

/** Resolve the dither accents for a terrain type (pure, total). */
export function ditherAccents(type: TerrainType): DitherAccents {
  return DITHER_ACCENTS[type] ?? FALLBACK_ACCENTS;
}

/** A single dither cluster: a small filled square at (x,y) within the cell. */
export interface DitherCluster {
  /** X offset within the cell, px. */
  x: number;
  /** Y offset within the cell, px. */
  y: number;
  /** Square side length, px. */
  size: number;
  /** EDG accent hex (dark or light). */
  hex: string;
}

/**
 * Deterministically derive the 1–3 dither clusters for a cell from the pure
 * coordinate hash. Cluster count, positions (snapped to a 4px sub-grid so they
 * stay crisp at TILE_SIZE=16), sizes (1–2px), and dark/light choice all come
 * from disjoint bit-fields of the hash → identical every call. Pure.
 */
export function ditherClusters(tx: number, ty: number, type: TerrainType): DitherCluster[] {
  const accents = ditherAccents(type);
  const h = ditherHash(tx, ty, type);
  // Bias toward FEWER specks (mostly 1) so the field reads as a calm surface
  // with occasional texture rather than dense noise when the map is zoomed out.
  const count = 1 + ((h & 0x7) === 0 ? 1 : 0) + ((h & 0x38) === 0 ? 1 : 0); // mostly 1, rarely 2-3
  const clusters: DitherCluster[] = [];
  // 4px sub-grid → 4 columns/rows of cells at TILE_SIZE=16, keeps stamps inset.
  const cells = TILE_SIZE / 4; // 4
  // Coarse elevation tilts the light/dark mix: sun-lit high ground gets more
  // light highlights, shaded low ground more dark specks — a flat-2D echo of
  // tiny-world-builder's height-banded terrain. The threshold the per-cluster
  // bits race against slides with elevation (high elev → low threshold → almost
  // always light; low elev → high threshold → more dark).
  const elev = elevationField(tx, ty); // [0,1]
  const lightThreshold = Math.round(3 - elev * 3); // 3 (low) … 0 (high), over a 0..3 field
  for (let i = 0; i < count; i++) {
    // Each cluster consumes a fresh 8-bit slice of the hash.
    const slice = (h >>> (i * 8)) & 0xff;
    const gx = slice & 0x3; // 0..3 grid col
    const gy = (slice >>> 2) & 0x3; // 0..3 grid row
    const size = 1 + ((slice >>> 4) & 0x1); // 1..2 px
    // Elevation-biased light/dark choice — a 2-bit field (0..3) compared against
    // the elevation-derived threshold. Highs skew light, valleys skew dark.
    const light = ((slice >>> 5) & 0x3) >= lightThreshold;
    clusters.push({
      x: gx * cells,
      y: gy * cells,
      size,
      hex: light ? accents.light : accents.dark,
    });
  }
  return clusters;
}
