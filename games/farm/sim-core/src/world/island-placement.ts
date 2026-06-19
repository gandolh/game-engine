/**
 * island-placement.ts — BSP placement of rectangular islands (brief 93).
 *
 * Replaces the radial-ring layout. Given a seed and a list of region specs
 * (id + kind + a sizing rule), it places every region as an axis-aligned rect
 * with a guaranteed >=2-tile ocean gap between any pair, spread across the whole
 * 240x240 map, targeting ~60% land coverage.
 *
 * Pipeline (all deterministic, integer-only; randomness via Rng.fork off seed):
 *   1. BSP-split the map into one leaf cell per region.
 *   2. Sort regions by required footprint (largest first) and assign each to the
 *      leaf that best fits it (deterministic, area-descending).
 *   3. Size each island inside its leaf:
 *        - farm: a seed-chosen integer (w,h) factoring of its FIXED area.
 *        - other: a target area, clamped to fit the leaf with gap margin.
 *   4. Place the island at a seeded interior position, >= GAP from each leaf wall.
 *      Sibling leaves are themselves gap-separated, so the inter-island gap holds
 *      by construction; a final O(n^2) assert catches any pathological case.
 *
 * The light edge-carve (rounding/notching corners) is applied LATER in the mask
 * step (regions.ts), not here — this module only decides rect bounds + center.
 *
 * Determinism: no Math.random / Date.now. Float appears only in Rng.nextFloat
 * (mulberry32, identical across platforms) feeding integer floors.
 */

import type { Rng } from "@engine/core";
import { createRng } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./world-dims";
import type { RegionId, RegionKind } from "./regions";

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Minimum ocean tiles between any two islands (and island↔map-edge). */
export const GAP = 2;

/** Coverage acceptance band (fraction of WORLD_WIDTH*WORLD_HEIGHT that is land). */
export const COVERAGE_MIN = 0.55;
export const COVERAGE_MAX = 0.65;
export const COVERAGE_TARGET = 0.6;

/** A leaf is not split further once either dimension drops below this. */
const MIN_LEAF = 16;

// ── Public types ───────────────────────────────────────────────────────────────

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Sizing rule for a region the placer must position.
 *  - kind 'farm': `area` is FIXED; width/height vary by aspect (same area, varied shape).
 *  - otherwise: `area` is a TARGET; the placer may shrink it to fit a leaf, and
 *    the coverage loop may scale all targets up/down to hit the band.
 * `minSide` guarantees the island is wide enough to host its anchors and to
 * give bridges an overlap window (prevents degenerate 1-wide strips).
 */
export interface RegionSpec {
  id: RegionId;
  kind: RegionKind;
  /** Fixed (farm) or target (other) area in tiles. */
  area: number;
  /** Minimum width AND height in tiles. */
  minSide: number;
  /** Max aspect ratio (longSide/shortSide) for farms; ignored for others. */
  maxAspect?: number;
}

export interface PlacedIsland {
  id: RegionId;
  kind: RegionKind;
  bounds: Bounds;
  center: { x: number; y: number };
}

export interface PlacementResult {
  islands: PlacedIsland[];
  /** Land tiles / world tiles (rect area; carve happens later so this is an upper bound). */
  coverage: number;
}

// ── BSP ──────────────────────────────────────────────────────────────────────

/**
 * Recursively splits `[0,WORLD_WIDTH) x [0,WORLD_HEIGHT)` into exactly `count`
 * leaf cells. Always splits the leaf with the largest area, along its longer
 * axis, at a seeded position in the central third (avoids slivers). Returns the
 * leaves in a deterministic order (split order).
 */
export function bspLeaves(rng: Rng, count: number): Bounds[] {
  const leaves: Bounds[] = [{ minX: 0, minY: 0, maxX: WORLD_WIDTH - 1, maxY: WORLD_HEIGHT - 1 }];
  let n = 0;
  while (leaves.length < count) {
    // Pick the largest splittable leaf (deterministic: area desc, then index).
    let bestIdx = -1;
    let bestArea = -1;
    for (let i = 0; i < leaves.length; i++) {
      const b = leaves[i]!;
      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      if (w < 2 * MIN_LEAF && h < 2 * MIN_LEAF) continue; // cannot split either axis
      const area = w * h;
      if (area > bestArea) { bestArea = area; bestIdx = i; }
    }
    if (bestIdx < 0) break; // nothing left to split — fewer leaves than requested
    const b = leaves.splice(bestIdx, 1)[0]!;
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    const splitRng = rng.fork("bsp-" + n++);
    // Split the longer axis if it can be split; else the other.
    const canVert = w >= 2 * MIN_LEAF; // split into left/right
    const canHoriz = h >= 2 * MIN_LEAF; // split into top/bottom
    const vertical = canVert && (!canHoriz || w >= h);
    if (vertical) {
      const lo = b.minX + MIN_LEAF;
      const hi = b.maxX - MIN_LEAF;
      const cut = clampInt(lo, hi, b.minX + Math.floor(w / 3) + splitRng.int(0, Math.max(1, Math.floor(w / 3))));
      leaves.push({ minX: b.minX, minY: b.minY, maxX: cut, maxY: b.maxY });
      leaves.push({ minX: cut + 1, minY: b.minY, maxX: b.maxX, maxY: b.maxY });
    } else {
      const lo = b.minY + MIN_LEAF;
      const hi = b.maxY - MIN_LEAF;
      const cut = clampInt(lo, hi, b.minY + Math.floor(h / 3) + splitRng.int(0, Math.max(1, Math.floor(h / 3))));
      leaves.push({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: cut });
      leaves.push({ minX: b.minX, minY: cut + 1, maxX: b.maxX, maxY: b.maxY });
    }
  }
  return leaves;
}

function clampInt(lo: number, hi: number, v: number): number {
  if (lo > hi) return Math.floor((lo + hi) / 2);
  return Math.max(lo, Math.min(hi, v));
}

// ── Sizing ─────────────────────────────────────────────────────────────────────

/** All integer (w,h) factorings of `area` with both sides >= minSide and aspect <= maxAspect. */
function farmFactorings(area: number, minSide: number, maxAspect: number): Array<{ w: number; h: number }> {
  const out: Array<{ w: number; h: number }> = [];
  for (let w = minSide; w * minSide <= area; w++) {
    if (area % w !== 0) continue;
    const h = area / w;
    if (h < minSide) continue;
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (aspect > maxAspect) continue;
    out.push({ w, h });
  }
  return out;
}

/**
 * Chooses (w,h) for one island given its leaf's usable interior (leaf minus the
 * GAP margin on every side). Farms keep their fixed area (pick a factoring that
 * fits); others target their area but shrink to fit the leaf.
 * Returns null if even the minimum footprint won't fit the leaf.
 */
function sizeIsland(
  spec: RegionSpec,
  leaf: Bounds,
  scale: number,
  rng: Rng,
): { w: number; h: number } | null {
  const availW = leaf.maxX - leaf.minX + 1 - 2 * GAP;
  const availH = leaf.maxY - leaf.minY + 1 - 2 * GAP;
  if (availW < spec.minSide || availH < spec.minSide) return null;

  if (spec.kind === "farm") {
    const maxAspect = spec.maxAspect ?? 2.5;
    const facts = farmFactorings(spec.area, spec.minSide, maxAspect).filter(
      (f) => f.w <= availW && f.h <= availH,
    );
    if (facts.length === 0) return null;
    return rng.pick(facts);
  }

  // Non-farm: target area * coverage scale, clamped to the leaf, >= minSide.
  // The target may exceed the leaf; we then fill as much of the leaf as the
  // aspect allows (this is how non-farm islands soak up slack to hit ~60%).
  const targetArea = Math.max(spec.minSide * spec.minSide, Math.round(spec.area * scale));
  const ideal = Math.round(Math.sqrt(targetArea));
  // Width may range from a touch under ideal up to the whole usable leaf width,
  // so a generous scale can grow the island to fill its cell.
  const wLo = Math.max(spec.minSide, Math.min(availW, Math.floor(ideal * 0.75)));
  const wHi = Math.min(availW, Math.max(wLo, Math.ceil(ideal * 1.5)));
  const w = wHi > wLo ? rng.int(wLo, wHi + 1) : wLo;
  let h = Math.max(spec.minSide, Math.round(targetArea / w));
  h = Math.min(h, availH);
  if (h < spec.minSide) return null;
  return { w, h };
}

// ── Placement ────────────────────────────────────────────────────────────────

/**
 * Places every spec into a BSP leaf at a seeded interior position. `scale` lets
 * the coverage loop grow/shrink non-farm islands. Returns null if any region
 * cannot be sized into its assigned leaf (caller retries with adjusted params).
 */
function placeOnce(
  specs: readonly RegionSpec[],
  rng: Rng,
  scale: number,
): PlacementResult | null {
  const leaves = bspLeaves(rng.fork("bsp"), specs.length);
  if (leaves.length < specs.length) return null;

  // Assign largest-footprint specs to largest leaves (area desc, id tiebreak).
  const order = [...specs].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));
  const leafOrder = [...leaves].sort(
    (a, b) => leafArea(b) - leafArea(a) || a.minX - b.minX || a.minY - b.minY,
  );

  const islands: PlacedIsland[] = [];
  let landTiles = 0;
  for (let i = 0; i < order.length; i++) {
    const spec = order[i]!;
    const leaf = leafOrder[i]!;
    const sizeRng = rng.fork("size-" + spec.id);
    const size = sizeIsland(spec, leaf, scale, sizeRng);
    if (size === null) return null;

    // Place inside leaf with >= GAP margin; seeded offset within the slack.
    const slackX = leaf.maxX - leaf.minX + 1 - 2 * GAP - size.w;
    const slackY = leaf.maxY - leaf.minY + 1 - 2 * GAP - size.h;
    const posRng = rng.fork("pos-" + spec.id);
    const minX = leaf.minX + GAP + (slackX > 0 ? posRng.int(0, slackX + 1) : 0);
    const minY = leaf.minY + GAP + (slackY > 0 ? posRng.int(0, slackY + 1) : 0);
    const bounds: Bounds = { minX, minY, maxX: minX + size.w - 1, maxY: minY + size.h - 1 };
    islands.push({
      id: spec.id,
      kind: spec.kind,
      bounds,
      center: { x: Math.floor((bounds.minX + bounds.maxX) / 2), y: Math.floor((bounds.minY + bounds.maxY) / 2) },
    });
    landTiles += size.w * size.h;
  }

  // Safety: assert the >=GAP inter-island gap (should hold by construction).
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      if (!gapOk(islands[i]!.bounds, islands[j]!.bounds, GAP)) return null;
    }
  }

  return { islands, coverage: landTiles / (WORLD_WIDTH * WORLD_HEIGHT) };
}

function leafArea(b: Bounds): number {
  return (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
}

/** True if rects a and b are separated by >= gap tiles on at least one axis. */
export function gapOk(a: Bounds, b: Bounds, gap: number): boolean {
  const dx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
  const dy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
  return Math.max(dx, dy) >= gap;
}

/**
 * Places all islands, running a coverage feedback loop: it scales non-farm
 * island target areas until total land lands in [COVERAGE_MIN, COVERAGE_MAX],
 * or returns the closest attempt after a bounded number of tries.
 */
export function placeIslands(seed: number, specs: readonly RegionSpec[]): PlacementResult {
  const root = createRng(seed).fork("island-placement");
  let best: PlacementResult | null = null;
  let bestErr = Infinity;
  // Start above 1: fixed farms/ranches alone are well under target, so non-farm
  // islands must be enlarged from their nominal area to reach ~60%.
  let scale = 1.8;
  for (let attempt = 0; attempt < 24; attempt++) {
    const r = placeOnce(specs, root.fork("attempt-" + attempt), scale);
    if (r !== null) {
      const err = Math.abs(r.coverage - COVERAGE_TARGET);
      if (err < bestErr) { best = r; bestErr = err; }
      if (r.coverage >= COVERAGE_MIN && r.coverage <= COVERAGE_MAX) return r;
      // Nudge non-farm scale toward the target (proportional, damped). Farms/ranches
      // are fixed, so to move total coverage the non-farm islands must over/under-shoot;
      // allow a wide scale range so they can fill leaf slack up to the band.
      scale *= Math.min(2.0, Math.max(0.6, COVERAGE_TARGET / Math.max(0.01, r.coverage)));
      scale = Math.min(scale, 8);
    } else {
      // Sizing failed for some leaf at this scale — back off only slightly and
      // retry with a fresh partition/positions (different attempt fork), rather
      // than collapsing scale (which would tank coverage).
      scale = Math.max(1.2, scale * 0.95);
    }
  }
  if (best === null) {
    throw new Error(`placeIslands: no valid placement for seed ${seed} after 24 attempts`);
  }
  return best;
}
