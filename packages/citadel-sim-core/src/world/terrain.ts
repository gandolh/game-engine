import { createRng } from "@engine/core";

export const WORLD_WIDTH = 96;
export const WORLD_HEIGHT = 96;
export const TILE_SIZE = 16;

/**
 * Terrain types for the 96×96 Citadel world.
 * Grass and rough are walkable; water and forest and stone are obstacles.
 *
 * Using a plain numeric enum (not const enum) so it is compatible with
 * isolatedModules + esbuild (vitest).
 */
export enum TerrainType {
  Grass = 0,
  Water = 1,
  Forest = 2,
  Stone = 3,
  Rough = 4,
}

export interface TerrainGrid {
  readonly cells: Uint8Array; // length WORLD_WIDTH * WORLD_HEIGHT
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Minimal seeded Perlin-noise implementation (no external dep, deterministic)
// ---------------------------------------------------------------------------

/**
 * Seeded permutation-table-based gradient noise (simplex-style 2D value noise).
 * Uses the RNG to shuffle a 256-element table once at construction.
 */
class SeededNoise {
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    const rng = createRng(seed).fork("noise-perm");
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
    }
    // Double the table to avoid index wrapping
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  /** Returns value in [0, 1] */
  at(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this._fade(xf);
    const v = this._fade(yf);

    const a = (this.perm[xi]! + yi) & 255;
    const b = (this.perm[xi + 1]! + yi) & 255;

    const aa = this.perm[a]!;
    const ab = this.perm[a + 1]!;
    const ba = this.perm[b]!;
    const bb = this.perm[b + 1]!;

    const lerp = (a: number, b: number, t: number) => a + t * (b - a);
    const grad = (h: number, gx: number, gy: number) => {
      const hm = h & 3;
      const gxr = hm < 2 ? gx : -gx;
      const gyr = hm === 0 || hm === 2 ? gy : -gy;
      return gxr + gyr;
    };

    const res = lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
    // Map from [-1, 1] to [0, 1]
    return (res + 1) * 0.5;
  }

  /** Fractal Brownian Motion — sums octaves for richer terrain */
  fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let val = 0;
    let amp = 0.5;
    let freq = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      val += this.at(x * freq, y * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return val / max;
  }

  private _fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
}

// ---------------------------------------------------------------------------
// River geometry — pure single-coordinate functions of (seed, row)
// ---------------------------------------------------------------------------

/**
 * Per-seed river parameters, derived purely from the seed via a labeled RNG
 * fork. Splitting this out (rather than inlining the rng.range calls) lets both
 * the carve loop and the pure {@link riverColAtRow} helper share one definition
 * of the river without re-rolling the RNG or drifting apart.
 *
 * The draw order of the rng.range() calls is preserved exactly (center,
 * amplitude, freq, width) so the seeded outcome of this fork is unchanged from
 * the original inline form.
 */
export interface RiverParams {
  readonly centerX: number;
  readonly amplitude: number;
  readonly freq: number;
  readonly width: number;
}

/** Derive the river parameters as a pure function of the seed. */
export function riverParams(seed: number): RiverParams {
  const rng = createRng(seed).fork("terrain-gen");
  const centerX = rng.range(WORLD_WIDTH * 0.3, WORLD_WIDTH * 0.7);
  const amplitude = rng.range(4, 12);
  const freq = rng.range(0.03, 0.07);
  const width = rng.range(3, 6);
  return { centerX, amplitude, freq, width };
}

/**
 * The river's center column at row `ty`, as a PURE function of (seed, ty).
 *
 * This is the Citadel recast of tiny-world-builder's `riverXForCol(boardX)`:
 * the river position at any row depends only on the seed and that row, so the
 * water reads as a single coherent channel entering the top edge and exiting
 * the bottom edge — it never depends on neighbouring rows or mutable state.
 *
 * Base shape is the original `centerX + sin(ty*freq)*amplitude`. To make the
 * off-map cue explicit and GUARANTEED, the channel is smoothly steered toward a
 * fixed per-seed "river mouth" column at each vertical edge (ty=0 and ty=H-1).
 * The steering is a cosine falloff confined to a thin band near each edge, so
 * interior rows (where buildings are placed) keep the original sine path.
 */
export function riverColAtRow(seed: number, ty: number): number {
  const { centerX, amplitude, freq } = riverParams(seed);
  const base = centerX + Math.sin(ty * freq) * amplitude;

  const [topMouth, bottomMouth] = edgeWaterColumns(seed);

  // Steer toward the mouth columns only within `band` rows of each edge.
  const band = 6;
  const h = WORLD_HEIGHT;

  if (ty <= band) {
    // Weight 1 at ty=0 → 0 at ty=band (smooth cosine ease).
    const w = 0.5 * (1 + Math.cos((ty / band) * Math.PI));
    return base + (topMouth - base) * w;
  }
  if (ty >= h - 1 - band) {
    const d = h - 1 - ty; // 0 at bottom edge → band at the band's inner rim
    const w = 0.5 * (1 + Math.cos((d / band) * Math.PI));
    return base + (bottomMouth - base) * w;
  }
  return base;
}

/**
 * The river-mouth columns where water enters the top edge (index 0) and exits
 * the bottom edge (index 1), as a PURE function of the seed. Exported so spawn
 * geography (raiders/traders arriving through the river mouth) and rendering can
 * align with the coherent edge gaps. Both are clamped a couple tiles inside the
 * border so a full-width river band stays on-map.
 */
export function edgeWaterColumns(seed: number): readonly [number, number] {
  const { centerX, amplitude, freq, width } = riverParams(seed);
  const margin = Math.ceil(width) + 1;
  const lo = margin;
  const hi = WORLD_WIDTH - 1 - margin;
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
  // The natural sine positions at the two edges, rounded to whole columns so
  // the carved mouth is a stable integer target.
  const top = clamp(Math.round(centerX + Math.sin(0 * freq) * amplitude));
  const bottom = clamp(Math.round(centerX + Math.sin((WORLD_HEIGHT - 1) * freq) * amplitude));
  return [top, bottom];
}

// ---------------------------------------------------------------------------
// Terrain generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic 96×96 terrain grid from a seed.
 * Same seed → identical grid; different seeds → different grids.
 */
export function generateTerrain(seed: number): TerrainGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);

  // Separate noise instances for different layers
  const baseNoise = new SeededNoise((seed ^ 0xdeadbeef) >>> 0);
  const waterNoise = new SeededNoise((seed ^ 0xcafebabe) >>> 0);
  const forestNoise = new SeededNoise((seed ^ 0x12345678) >>> 0);
  const stoneNoise = new SeededNoise((seed ^ 0xabcdef01) >>> 0);
  const roughNoise = new SeededNoise((seed ^ 0x0f0f0f0f) >>> 0);

  // One labeled fork drives both river and lake control points; the draw order
  // (river center, amplitude, freq, width, then lake CX/CY/R) is preserved
  // exactly from the original inline form, so non-river terrain is unchanged.
  // The river channel geometry itself is owned by the pure riverColAtRow()
  // helper, which rederives the same draws from the seed via riverParams().
  const rng = createRng(seed).fork("terrain-gen");
  rng.range(WORLD_WIDTH * 0.3, WORLD_WIDTH * 0.7); // river centerX
  rng.range(4, 12); // river amplitude
  rng.range(0.03, 0.07); // river freq
  const riverWidth = rng.range(3, 6);

  // Lake: a circular body of water somewhere in the world.
  const lakeCX = rng.range(10, WORLD_WIDTH - 10);
  const lakeCY = rng.range(10, WORLD_HEIGHT - 10);
  const lakeR = rng.range(5, 10);

  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    // River center column at this row — pure function of (seed, ty), with
    // guaranteed mouth contact at the top and bottom edges.
    const riverX = riverColAtRow(seed, ty);

    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const idx = ty * WORLD_WIDTH + tx;

      const nx = tx / WORLD_WIDTH;
      const ny = ty / WORLD_HEIGHT;

      // --- Water: river + lake ---
      const distToRiver = Math.abs(tx - riverX);
      const inRiver = distToRiver < riverWidth;

      const dLake = Math.hypot(tx - lakeCX, ty - lakeCY);
      const inLake = dLake < lakeR;

      // Also use noise for organic water edges
      const wNoise = waterNoise.fbm(nx * 6, ny * 6, 3, 2, 0.5);
      const inWaterNoise = wNoise > 0.72 && (inRiver || inLake);

      if (inRiver || inLake || inWaterNoise) {
        cells[idx] = TerrainType.Water;
        continue;
      }

      // --- Forest patches (mid-layer noise) ---
      const fNoise = forestNoise.fbm(nx * 5, ny * 5, 3, 2.1, 0.5);
      if (fNoise > 0.65) {
        cells[idx] = TerrainType.Forest;
        continue;
      }

      // --- Stone/ore deposits (sparse high-frequency noise) ---
      const sNoise = stoneNoise.fbm(nx * 9, ny * 9, 2, 2, 0.5);
      const baseSNoise = baseNoise.fbm(nx * 3, ny * 3, 2, 2, 0.5);
      if (sNoise > 0.75 && baseSNoise > 0.55) {
        cells[idx] = TerrainType.Stone;
        continue;
      }

      // --- Rough/unbuildable ground ---
      const rNoise = roughNoise.fbm(nx * 4, ny * 4, 2, 2, 0.5);
      if (rNoise > 0.7) {
        cells[idx] = TerrainType.Rough;
        continue;
      }

      cells[idx] = TerrainType.Grass;
    }
  }

  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}

/**
 * Returns true if the tile at (tx, ty) is walkable (not water or rough).
 * Forest and Stone are passable in Phase 0 (will be refined later).
 */
export function isWalkable(grid: TerrainGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return false;
  const t = grid.cells[ty * grid.width + tx]!;
  return t !== TerrainType.Water && t !== TerrainType.Rough;
}
