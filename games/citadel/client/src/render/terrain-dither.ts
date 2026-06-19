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

// ---------------------------------------------------------------------------
// makeTerrainDecorate (static-layer bake callback)
// ---------------------------------------------------------------------------

/**
 * Build the decorate callback that paints the terrain grid into the baked
 * static layer (a one-time texture on the WebGPU backend). Each cell is a
 * TILE_SIZE×TILE_SIZE EDG-colored rect — same logic as the old
 * `bakeTerrainLayer`, but drawn into the engine's bake surface.
 */
export function makeTerrainDecorate(grid: TerrainGrid): (ctx: Ctx2D, wpx: number, hpx: number) => void {
  return (ctx: Ctx2D): void => {
    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const t = grid.cells[ty * grid.width + tx] as TerrainType;
        ctx.fillStyle = TERRAIN_COLORS[t] ?? EDG.green;
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        // Sub-tile dither (brief 13): deterministic darker/lighter clusters so
        // same-type cells don't look stamped. Baked once — zero per-frame cost.
        for (const c of ditherClusters(tx, ty, t)) {
          ctx.fillStyle = c.hex;
          ctx.fillRect(tx * TILE_SIZE + c.x, ty * TILE_SIZE + c.y, c.size, c.size);
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
  for (let i = 0; i < count; i++) {
    // Each cluster consumes a fresh 8-bit slice of the hash.
    const slice = (h >>> (i * 8)) & 0xff;
    const gx = slice & 0x3; // 0..3 grid col
    const gy = (slice >>> 2) & 0x3; // 0..3 grid row
    const size = 1 + ((slice >>> 4) & 0x1); // 1..2 px
    // Bias toward the LIGHT accent — soft highlights read gentler than dark specks.
    const light = ((slice >>> 5) & 0x3) !== 0; // ~75% light, ~25% dark
    clusters.push({
      x: gx * cells,
      y: gy * cells,
      size,
      hex: light ? accents.light : accents.dark,
    });
  }
  return clusters;
}
