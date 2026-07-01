import { createRng } from "@engine/core";
import type { Rng } from "@engine/core";

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

/** Derive the river parameters as a pure function of the seed (+ world width). */
export function riverParams(seed: number, w: number = WORLD_WIDTH): RiverParams {
  const rng = createRng(seed).fork("terrain-gen");
  const centerX = rng.range(w * 0.3, w * 0.7);
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
export function riverColAtRow(seed: number, ty: number, w: number = WORLD_WIDTH, h: number = WORLD_HEIGHT): number {
  const { centerX, amplitude, freq } = riverParams(seed, w);
  const base = centerX + Math.sin(ty * freq) * amplitude;

  const [topMouth, bottomMouth] = edgeWaterColumns(seed, w, h);

  // Steer toward the mouth columns only within `band` rows of each edge.
  const band = 6;

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
export function edgeWaterColumns(seed: number, w: number = WORLD_WIDTH, h: number = WORLD_HEIGHT): readonly [number, number] {
  const { centerX, amplitude, freq, width } = riverParams(seed, w);
  const margin = Math.ceil(width) + 1;
  const lo = margin;
  const hi = w - 1 - margin;
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
  // The natural sine positions at the two edges, rounded to whole columns so
  // the carved mouth is a stable integer target.
  const top = clamp(Math.round(centerX + Math.sin(0 * freq) * amplitude));
  const bottom = clamp(Math.round(centerX + Math.sin((h - 1) * freq) * amplitude));
  return [top, bottom];
}

// ---------------------------------------------------------------------------
// Resource clusters — seeded blob centers for forest groves + stone/ore veins
// ---------------------------------------------------------------------------

/**
 * A resource patch is a soft radial blob: tiles within `radius` of the center
 * become the patch type, with a noisy edge so the outline reads organic rather
 * than a perfect circle. A handful of these per map turn "where the wood/ore is"
 * into a real spatial constraint you build toward — replacing the old per-tile
 * fbm-threshold sprinkle that made resources findable on almost any tile.
 */
interface ResourceBlob {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
}

/**
 * Place `count` blob centers as a PURE function of the seed via a dedicated
 * labeled fork. Using a fresh fork ("resource-clusters") means we never disturb
 * the "terrain-gen" draw order that owns the river + lake, so water stays
 * byte-identical. Centers are kept a few tiles inside the border so most of each
 * blob lands on-map.
 */
function placeBlobs(
  rng: Rng,
  count: number,
  minR: number,
  maxR: number,
  w: number,
  h: number,
): ResourceBlob[] {
  const margin = 4;
  const blobs: ResourceBlob[] = [];
  for (let i = 0; i < count; i++) {
    const cx = rng.range(margin, w - margin);
    const cy = rng.range(margin, h - margin);
    const radius = rng.range(minR, maxR);
    blobs.push({ cx, cy, radius });
  }
  return blobs;
}

// ---------------------------------------------------------------------------
// Terrain generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic 96×96 terrain grid from a seed.
 * Same seed → identical grid; different seeds → different grids.
 */
export function generateTerrain(
  seed: number,
  width: number = WORLD_WIDTH,
  height: number = WORLD_HEIGHT,
): TerrainGrid {
  const cells = new Uint8Array(width * height);

  // Separate noise instances for different layers
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
  rng.range(width * 0.3, width * 0.7); // river centerX
  rng.range(4, 12); // river amplitude
  rng.range(0.03, 0.07); // river freq
  const riverWidth = rng.range(3, 6);

  // Lake: a circular body of water somewhere in the world.
  const lakeCX = rng.range(10, width - 10);
  const lakeCY = rng.range(10, height - 10);
  const lakeR = rng.range(5, 10);

  // Resource clusters: a handful of forest groves and stone/ore veins, placed
  // via a SEPARATE labeled fork so the "terrain-gen" river+lake draws above stay
  // byte-identical. These blobs replace the old per-tile sprinkle: forest/stone
  // tiles now form connected patches centered on these points, so woodcutter /
  // quarry / mine placement becomes a real spatial decision. Scaled by area so
  // non-default world sizes get a proportional number of patches.
  const clusterRng = createRng(seed).fork("resource-clusters");
  const areaScale = (width * height) / (WORLD_WIDTH * WORLD_HEIGHT);
  const forestCount = Math.max(3, Math.round(5 * areaScale));
  const stoneCount = Math.max(2, Math.round(3 * areaScale));
  const forestBlobs = placeBlobs(clusterRng, forestCount, 5, 9, width, height);
  const stoneBlobs = placeBlobs(clusterRng, stoneCount, 3, 6, width, height);

  for (let ty = 0; ty < height; ty++) {
    // River center column at this row — pure function of (seed, ty), with
    // guaranteed mouth contact at the top and bottom edges.
    const riverX = riverColAtRow(seed, ty, width, height);

    for (let tx = 0; tx < width; tx++) {
      const idx = ty * width + tx;

      const nx = tx / width;
      const ny = ty / height;

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

      // --- Forest groves (blob-centered, noisy edge) ---
      // A tile is forest when it falls inside any grove blob. The blob radius is
      // perturbed per-tile by the existing forest-noise layer so the outline is
      // organic rather than a clean circle, but the core of each blob is always
      // solid — that guarantees a CONNECTED patch, not a sprinkle.
      const fEdge = forestNoise.fbm(nx * 8, ny * 8, 3, 2.1, 0.5); // ~[0,1]
      let isForest = false;
      for (const b of forestBlobs) {
        const d = Math.hypot(tx - b.cx, ty - b.cy);
        // Effective radius wobbles by roughly ±1.5 tiles with the noise.
        const effR = b.radius + (fEdge - 0.5) * 3;
        if (d < effR) {
          isForest = true;
          break;
        }
      }
      if (isForest) {
        cells[idx] = TerrainType.Forest;
        continue;
      }

      // --- Stone/ore veins (blob-centered, noisy edge) ---
      const sEdge = stoneNoise.fbm(nx * 10, ny * 10, 2, 2, 0.5); // ~[0,1]
      let isStone = false;
      for (const b of stoneBlobs) {
        const d = Math.hypot(tx - b.cx, ty - b.cy);
        const effR = b.radius + (sEdge - 0.5) * 3;
        if (d < effR) {
          isStone = true;
          break;
        }
      }
      if (isStone) {
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

  // --- Solvability guarantee (Phase I, decision #10) ---------------------
  // The raw generator can, on a harsh minority of seeds, hand back a map the
  // player cannot actually start on: the map center walled off by the river/
  // rough, or a resource type absent / stranded across water. repairSolvability
  // runs a pure, deterministic pass over the finished grid to ensure a workable
  // start — see its own doc comment for the contract and the repair strategy.
  repairSolvability(cells, width, height);

  return { cells, width, height };
}

// ---------------------------------------------------------------------------
// Solvability guarantee — pure, deterministic post-generation repair
// ---------------------------------------------------------------------------

// The seed-town core box the cold open places. This terrain layer is the SINGLE
// source of truth for the box dims AND the scan that finds it: the solvability
// guarantee (repairSolvability, below) and the cold-open placement
// (seedFoundingTown in sim-bootstrap.ts) both call the exported findCoreBox() so
// they can never disagree about which box wins. sim-bootstrap imports these
// constants rather than re-declaring them, so there is ONE definition of 12×6.
// (sim-core's terrain layer still must NOT depend on sim-bootstrap — the arrow
// points terrain → bootstrap only, never back.)
export const CORE_BOX_W = 12;
export const CORE_BOX_H = 6;

/**
 * Is the tile at (tx, ty) buildable = walkable = NOT Water and NOT Rough?
 * Duplicated locally (rather than calling isWalkable, which wants a TerrainGrid)
 * so the repair can read the raw cells array mid-construction, before the grid
 * object exists. Grass/Forest/Stone are all buildable; only Water/Rough are not.
 */
function cellBuildable(cells: Uint8Array, width: number, height: number, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
  const t = cells[ty * width + tx]!;
  return t !== TerrainType.Water && t !== TerrainType.Rough;
}

/** True if the whole CORE_BOX_W×CORE_BOX_H box anchored at (ax, ay) is in-bounds and buildable. */
function coreBoxFits(cells: Uint8Array, width: number, height: number, ax: number, ay: number): boolean {
  if (ax < 0 || ay < 0 || ax + CORE_BOX_W > width || ay + CORE_BOX_H > height) return false;
  for (let dy = 0; dy < CORE_BOX_H; dy++) {
    for (let dx = 0; dx < CORE_BOX_W; dx++) {
      if (!cellBuildable(cells, width, height, ax + dx, ay + dy)) return false;
    }
  }
  return true;
}

/**
 * The center anchor of the core box for a `width`×`height` grid — the top-left
 * corner that centers a CORE_BOX_W×CORE_BOX_H box on the map. Exported so both
 * the guarantee and the cold open compute the SAME center without re-deriving it.
 */
export function coreBoxCenter(width: number, height: number): { cx: number; cy: number } {
  return {
    cx: Math.floor((width - CORE_BOX_W) / 2),
    cy: Math.floor((height - CORE_BOX_H) / 2),
  };
}

/**
 * Find the anchor of the first all-buildable CORE_BOX_W×CORE_BOX_H box, scanning
 * outward from the map center in expanding rings (for each ring radius r: rows
 * top→bottom, cols left→right, perimeter-only; first fit wins). Returns the
 * anchor, or null if NO buildable box exists anywhere on the grid.
 *
 * This is the SINGLE shared box search: both repairSolvability (the solvability
 * guarantee) and seedFoundingTown (the cold-open placement) call it, so they can
 * never anchor different boxes. Because the search radius is Math.max(width,
 * height) — a full scan of the grid — the guarantee is a strict superset of what
 * the cold open needs: if a natural box exists ANYWHERE, this returns it and the
 * guarantee carves nothing, so the cold open (calling the same helper with the
 * same scan order) finds that SAME box. Only when no box exists anywhere does the
 * guarantee carve one; the cold open then finds the carved box identically.
 *
 * PURE and DETERMINISTIC: no RNG, no Date — a plain function of the cells grid,
 * so it returns the same anchor for the same grid every time.
 */
export function findCoreBox(cells: Uint8Array, width: number, height: number): { x: number; y: number } | null {
  const { cx, cy } = coreBoxCenter(width, height);
  // Full-grid search bound: max(width, height) rings from center reaches every
  // in-bounds anchor. (Larger than strictly necessary but simple and exhaustive.)
  const maxRadius = Math.max(width, height);
  for (let r = 0; r <= maxRadius; r++) {
    for (let ay = cy - r; ay <= cy + r; ay++) {
      for (let ax = cx - r; ax <= cx + r; ax++) {
        const onRing = ax === cx - r || ax === cx + r || ay === cy - r || ay === cy + r;
        if (!onRing) continue;
        if (coreBoxFits(cells, width, height, ax, ay)) return { x: ax, y: ay };
      }
    }
  }
  return null;
}

/**
 * Guarantee a *workable start* on the finished grid, mutating `cells` in place.
 * PURE and DETERMINISTIC: a plain function of the (already deterministic) grid —
 * no RNG, no Date, only scans and a flood-fill — so same seed → byte-identical
 * cells. Repairs in place rather than rerolling (a reroll would mean re-running
 * all of generateTerrain and is not cheaper for determinism); the carves are
 * small and central so the river still runs edge-to-edge.
 *
 * The contract (see BUILD-ORDER Phase I decision #10 "guaranteed solvable"):
 *   1. A CORE_BOX_W×CORE_BOX_H all-buildable box exists SOMEWHERE on the grid —
 *      the seed-town cold open needs it or it silently leaves the town empty
 *      (degenerate). We use the shared findCoreBox() (full-grid ring scan from
 *      center) so the box we validate/carve is byte-for-byte the box the cold
 *      open will later place on. If findCoreBox finds none anywhere, carve the
 *      center box to Grass (findCoreBox will then return that same carved box).
 *   2. At least one Forest AND at least one Stone tile exists and is REACHABLE by
 *      4-connected walkable path (Water/Rough are walls) from the core center —
 *      otherwise a woodcutter/quarry can never be placed near reachable resource
 *      and the map is silently trade-only. Missing-entirely is the common failure
 *      (a seed whose blobs all fell in water); stranded-behind-water is rarer.
 *      Either way we paint a small blob of that resource on the nearest reachable
 *      Grass, found by BFS from the core center in deterministic scan order.
 */
export function repairSolvability(cells: Uint8Array, width: number, height: number): void {
  // Use the shared full-grid box search so the box we validate/carve is exactly
  // the box seedFoundingTown() will later place on — they call the SAME helper,
  // so they cannot anchor different boxes. If a natural box exists anywhere we
  // carve nothing; only a total absence triggers a carve.
  let anchor = findCoreBox(cells, width, height);

  if (anchor === null) {
    // No buildable box exists ANYWHERE — carve the center box to Grass. The
    // center anchor is always fully in-bounds (coreBoxCenter derives it to fit),
    // and it is the FIRST anchor findCoreBox scans (radius 0), so after carving,
    // findCoreBox — and thus the cold open — will return this exact same box.
    // Prefer carving Rough over Water so the river stays coherent: we scan once
    // clearing only Rough, and only clear Water where it still blocks the box.
    // (The center box rarely overlaps the river, so Water carves are rare.)
    const { cx: carveAx, cy: carveAy } = coreBoxCenter(width, height);
    // Two passes so Rough clears before Water (both just become Grass, but the
    // ordering documents intent and keeps the carve minimal in the common case
    // where clearing Rough alone already makes the box buildable).
    for (let dy = 0; dy < CORE_BOX_H; dy++) {
      for (let dx = 0; dx < CORE_BOX_W; dx++) {
        const idx = (carveAy + dy) * width + (carveAx + dx);
        if (cells[idx] === TerrainType.Rough) cells[idx] = TerrainType.Grass;
      }
    }
    for (let dy = 0; dy < CORE_BOX_H; dy++) {
      for (let dx = 0; dx < CORE_BOX_W; dx++) {
        const idx = (carveAy + dy) * width + (carveAx + dx);
        if (cells[idx] === TerrainType.Water) cells[idx] = TerrainType.Grass;
      }
    }
    anchor = { x: carveAx, y: carveAy };
  }

  // Core center tile — the flood-fill / BFS seed. It sits inside the (now
  // guaranteed-buildable) box, so it is always walkable.
  const coreX = anchor.x + Math.floor(CORE_BOX_W / 2);
  const coreY = anchor.y + Math.floor(CORE_BOX_H / 2);
  const coreIdx = coreY * width + coreX;

  // Flood-fill the walkable region reachable from the core (4-connected; Water &
  // Rough are walls). This is the set of tiles the player can actually reach on
  // foot, so a resource is only "usable" if at least one of its tiles is in here.
  const reachable = new Uint8Array(width * height);
  {
    const stack: number[] = [coreIdx];
    reachable[coreIdx] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      const neighbors: Array<[number, number]> = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nxx, nyy] of neighbors) {
        if (nxx < 0 || nyy < 0 || nxx >= width || nyy >= height) continue;
        const nIdx = nyy * width + nxx;
        if (reachable[nIdx]) continue;
        const t = cells[nIdx]!;
        if (t === TerrainType.Water || t === TerrainType.Rough) continue;
        reachable[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  // Does any tile of `type` fall inside the reachable region?
  const hasReachable = (type: TerrainType): boolean => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === type && reachable[i]) return true;
    }
    return false;
  };

  // Ensure a resource type is present & reachable; if not, paint a small blob of
  // it onto the nearest reachable Grass tile. We keep the box's INTERIOR clear so
  // the town has land — the blob center never lands inside the box except in the
  // fully-boxed-in degenerate fallback, and even then only on a box corner (never
  // the center); the surrounding blob tiles always skip in-box tiles entirely.
  const ensureResource = (type: TerrainType): void => {
    if (hasReachable(type)) return;

    // BFS from the core center over reachable tiles to find the nearest Grass
    // tile OUTSIDE the core box — deterministic (fixed neighbor order, distance
    // then scan order), so the painted blob location is a pure function of grid.
    const inCoreBox = (x: number, y: number): boolean =>
      x >= anchor!.x && x < anchor!.x + CORE_BOX_W && y >= anchor!.y && y < anchor!.y + CORE_BOX_H;

    const visited = new Uint8Array(width * height);
    let queue: number[] = [coreIdx];
    visited[coreIdx] = 1;
    let target = -1;
    while (queue.length > 0 && target === -1) {
      const next: number[] = [];
      for (const idx of queue) {
        const x = idx % width;
        const y = (idx - x) / width;
        if (cells[idx] === TerrainType.Grass && !inCoreBox(x, y)) {
          target = idx;
          break;
        }
        const neighbors: Array<[number, number]> = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nxx, nyy] of neighbors) {
          if (nxx < 0 || nyy < 0 || nxx >= width || nyy >= height) continue;
          const nIdx = nyy * width + nxx;
          if (visited[nIdx]) continue;
          const t = cells[nIdx]!;
          if (t === TerrainType.Water || t === TerrainType.Rough) continue;
          visited[nIdx] = 1;
          next.push(nIdx);
        }
      }
      queue = next;
    }

    // Fallback: no reachable Grass outside the box (extremely dense map). Paint
    // onto a buildable, reachable, non-box tile of any kind instead, then finally
    // onto a core-box edge tile — the guarantee (a reachable resource) trumps
    // keeping the box pristine. Deterministic first-in-scan-order pick.
    if (target === -1) {
      for (let i = 0; i < cells.length && target === -1; i++) {
        if (!reachable[i]) continue;
        const x = i % width;
        const y = (i - x) / width;
        if (inCoreBox(x, y)) continue;
        target = i;
      }
    }
    // Absolute last resort: no reachable non-box tile exists at ALL (a fully
    // boxed-in degenerate world). Paint onto the core box's TOP-LEFT CORNER
    // rather than its center tile, so the town center stays clear for the cold
    // open's storehouse/road spine. Forest/Stone are still "buildable", so the
    // solvability guarantee survives even with a resource on a box edge tile.
    if (target === -1) target = anchor.y * width + anchor.x;

    // Paint a small 3×3-ish blob centered on the target, but only onto tiles that
    // are reachable Grass (never overwrite Water/Rough — that would erode the
    // river — nor the other resource, nor the core box). Guarantees at least the
    // center tile flips to `type`, which is all the contract requires; the blob
    // just makes it a placeable patch rather than a lone pixel.
    const tx0 = target % width;
    const ty0 = (target - tx0) / width;
    cells[target] = type; // center always flips (it was Grass or the last-resort box corner)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx0 + dx;
        const y = ty0 + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const idx = y * width + x;
        if (idx === target) continue;
        if (inCoreBox(x, y)) continue; // keep the town's land clear
        if (cells[idx] === TerrainType.Grass && reachable[idx]) cells[idx] = type;
      }
    }
  };

  ensureResource(TerrainType.Forest);
  ensureResource(TerrainType.Stone);
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
