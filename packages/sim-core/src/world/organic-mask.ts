/**
 * organic-mask.ts — CA + floodfill organic island mask generator.
 *
 * Produces a Uint8Array land/ocean mask for a RegionDef via:
 *   1. Random seeding (with edge inset to enforce inter-region ocean gap)
 *   2. Core tile pinning (forced-land tiles from anchors.ts)
 *   3. Cellular-automata smoothing (two-rule born>=5 / survive>=3)
 *   4. Flood-fill from core tiles (keeps only the main connected land body)
 *   5. Validation (all core tiles land, minimum land coverage)
 *
 * Determinism guarantee: all randomness comes from the Rng passed by the caller,
 * forked per attempt with a stable label. No Math.random() is used.
 *
 * Parameters tuned empirically (2026-06-14): 100% of regions with area >= 36
 * generate an organic (non-rect) mask on the default seed, ~45% avg land
 * retained (min 34%) so islands read as carved but stay functional. A single
 * threshold>=5 rule was too erosive (~50% organic); two-rule born>=5/survive>=3
 * with P=0.60 + 2 passes + a 35% min-land floor is the balanced point.
 */

import type { RegionDef } from "./regions";
import type { Rng } from "@engine/core";

// ── Tunable constants ──────────────────────────────────────────────────────────

/** Tiles from the bounding-box edge that start as ocean (not randomised). */
export const INSET = 1;

/** Number of CA smoothing passes. */
export const N_PASSES = 2;

/** Initial land probability for interior tiles (pre-pinning). */
export const LAND_PROBABILITY = 0.6;

/** Two-rule CA: an ocean tile becomes land with >= BORN land neighbours (8-conn). */
const BORN_THRESHOLD = 5;
/** A land tile stays land with >= SURVIVE land neighbours; else erodes to ocean. */
const SURVIVE_THRESHOLD = 3;

/**
 * Minimum land fraction required for a valid mask. At 0.35 the surviving
 * core-connected blob is always a substantial island (no slivers) while still
 * leaving 100% of area>=36 regions able to generate organically on the default
 * seed. Below this the floodfill can leave a thin strand; above it some regions
 * fall back to rect.
 */
const MIN_LAND_FRAC = 0.35;
const MIN_LAND_ABS = 4;

/** Maximum generation attempts before falling back to all-land rect. */
export const MAX_ATTEMPTS = 20;

// ── Public types ───────────────────────────────────────────────────────────────

export interface OrganicMaskResult {
  mask: Uint8Array;
  /** true = organically shaped; false = fallback all-land rect */
  organic: boolean;
}

// ── Single-attempt builder (exported so regions.ts can call it in its own loop) ──

/**
 * Runs ONE attempt at generating an organic mask.
 * Returns the candidate mask, or null if the attempt fails the internal
 * core-survival / min-land checks.
 *
 * The caller (regions.ts) adds the adjacency check on top and decides
 * whether to accept or retry.
 */
export function buildOrganicMaskAttempt(
  region: RegionDef,
  core: ReadonlyArray<{ x: number; y: number }>,
  attemptRng: Rng,
): Uint8Array | null {
  const { minX, minY, maxX, maxY } = region.bounds;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const size = w * h;

  /** Local flat index for world tile (x, y). */
  const idx = (x: number, y: number) => (y - minY) * w + (x - minX);

  // ── Step 1+2: Seed interior (ocean edge inset, unless region is too small) ──
  let buf = new Uint8Array(size); // 0 = ocean
  const useInset = w > 2 * INSET + 1 && h > 2 * INSET + 1;
  if (useInset) {
    for (let ty = minY + INSET; ty <= maxY - INSET; ty++) {
      for (let tx = minX + INSET; tx <= maxX - INSET; tx++) {
        buf[idx(tx, ty)] = attemptRng.nextFloat() < LAND_PROBABILITY ? 1 : 0;
      }
    }
  } else {
    // Region too small to inset — randomise everything.
    for (let i = 0; i < size; i++) {
      buf[i] = attemptRng.nextFloat() < LAND_PROBABILITY ? 1 : 0;
    }
  }

  // ── Step 3: Pin core tiles (may override edge ring) ──
  const protectedIndices = new Uint8Array(size); // 1 = protected
  for (const t of core) {
    if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue;
    const i = idx(t.x, t.y);
    buf[i] = 1;
    protectedIndices[i] = 1;
  }

  // ── Step 4: CA smoothing ──
  for (let pass = 0; pass < N_PASSES; pass++) {
    const next = new Uint8Array(size);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        let land = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue; // OOB = ocean
            if (buf[idx(nx, ny)] === 1) land++;
          }
        }
        // Two-rule CA: born from ocean at >= BORN, survive as land at >= SURVIVE.
        next[idx(tx, ty)] =
          buf[idx(tx, ty)] === 1
            ? land >= SURVIVE_THRESHOLD ? 1 : 0
            : land >= BORN_THRESHOLD ? 1 : 0;
      }
    }
    // Re-apply protected tiles.
    for (let i = 0; i < size; i++) {
      if (protectedIndices[i] === 1) next[i] = 1;
    }
    buf = next;
  }

  // ── Step 5: Flood-fill from core (4-connectivity, array-queue BFS) ──
  const visited = new Uint8Array(size);
  const queue: number[] = [];
  let head = 0;

  for (const t of core) {
    if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue;
    const i = idx(t.x, t.y);
    if (buf[i] === 1 && visited[i] === 0) {
      visited[i] = 1;
      queue.push(i);
    }
  }

  while (head < queue.length) {
    const ci = queue[head++]!;
    const cx = (ci % w) + minX;
    const cy = Math.floor(ci / w) + minY;
    // 4-neighbours
    const neighbours: [number, number][] = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const ni = idx(nx, ny);
      if (buf[ni] === 1 && visited[ni] === 0) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // Final mask = only visited (connected-to-core) land tiles.
  const mask = new Uint8Array(size);
  let landCount = 0;
  for (let i = 0; i < size; i++) {
    if (visited[i] === 1) {
      mask[i] = 1;
      landCount++;
    }
  }

  // ── Step 6: Validate ──
  const minLand = Math.max(MIN_LAND_ABS, Math.floor(w * h * MIN_LAND_FRAC));

  // (a) every core tile must be land
  for (const t of core) {
    if (t.x < minX || t.x > maxX || t.y < minY || t.y > maxY) continue;
    if (mask[idx(t.x, t.y)] !== 1) return null;
  }

  // (b) minimum land coverage
  if (landCount < minLand) return null;

  return mask;
}

// ── Main public API ────────────────────────────────────────────────────────────

/**
 * Builds an organic mask for `region`, using `core` as pinned land tiles.
 *
 * `baseRng` is forked per attempt with label `forkBase + ':attempt-' + n`
 * so the attempt stream is fully isolated and deterministic.
 *
 * The caller (regions.ts) may add an adjacency check between attempts;
 * to support that, use `buildOrganicMaskAttempt` directly with the
 * per-attempt rng. This function runs the internal-only retry loop.
 *
 * Returns `{ mask, organic: true }` on success, or an all-land rect
 * `{ mask, organic: false }` if all MAX_ATTEMPTS fail.
 */
export function buildOrganicMask(
  region: RegionDef,
  core: ReadonlyArray<{ x: number; y: number }>,
  baseRng: Rng,
  forkBase: string,
): OrganicMaskResult {
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const attemptRng = baseRng.fork(forkBase + ":attempt-" + n);
    const mask = buildOrganicMaskAttempt(region, core, attemptRng);
    if (mask !== null) return { mask, organic: true };
  }

  // Fallback: all-land rect.
  const { minX, minY, maxX, maxY } = region.bounds;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return { mask: new Uint8Array(w * h).fill(1), organic: false };
}
