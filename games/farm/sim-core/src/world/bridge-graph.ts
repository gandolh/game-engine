/**
 * bridge-graph.ts — axis-aligned overlap bridge network (brief 93).
 *
 * Given placed rectangular islands, builds a connectivity graph where every
 * edge is a STRAIGHT, axis-aligned bridge connecting two islands whose facing
 * sides share an orthogonal overlap, at the MIDPOINT of that overlap.
 *
 * Pipeline (deterministic, integer-only):
 *   1. Candidate edges: for every island pair, the four cardinal directions.
 *      An edge exists iff the facing sides clear AND the perpendicular ranges
 *      overlap by >= the bridge width. Weight = ocean gap (tiles between sides).
 *   2. MST (Kruskal + union-find) over candidates, weight asc → connectivity
 *      skeleton. If the candidate graph is disconnected, return null (caller
 *      retries the seed; per design we do NOT fall back to L-bends).
 *   3. δ extra-edges: add non-MST candidates (gap asc) with seeded probability
 *      δ to create loops; skip any that would cross an island or another bridge.
 *   4. Emit each kept edge as a BRIDGE_WIDTH-wide RoadDef rect at the overlap
 *      midpoint, spanning the gap between the two facing sides.
 *
 * Determinism: weights/positions are integers; the only randomness is the δ
 * accept draw (Rng.nextFloat, mulberry32). Edges are processed in a fully
 * sorted order so the result is stable per seed.
 */

import type { Rng } from "@engine/core";
import type { Bounds, PlacedIsland } from "./island-placement";

/** Bridge corridor width in tiles (matches the legacy 2-wide straight bridge). */
export const BRIDGE_WIDTH = 2;

export type RoadRect = { minX: number; minY: number; maxX: number; maxY: number };

type Dir = "E" | "W" | "N" | "S";

interface Candidate {
  a: number; // island index
  b: number;
  dir: Dir; // direction from a to b
  gap: number; // ocean tiles strictly between the facing sides
  rect: RoadRect; // the bridge corridor
}

export interface BridgeGraphResult {
  roads: RoadRect[];
  /** Edges as island-index pairs (for connectivity tests). */
  edges: Array<[number, number]>;
}

// ── Candidate generation ───────────────────────────────────────────────────────

/** Overlap interval [lo,hi] of two ranges, or null if they don't overlap by >= width. */
function overlap(aLo: number, aHi: number, bLo: number, bHi: number, width: number): [number, number] | null {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (hi - lo + 1 < width) return null;
  return [lo, hi];
}

/**
 * Builds the E and S candidate edges for ordered pair (a,b) — these two
 * directions cover all four (W/N are just E/S from the other island). Returns
 * the candidate(s) where a straight bridge of BRIDGE_WIDTH is geometrically
 * possible (facing sides clear + perpendicular overlap), with gap > 0.
 */
function candidatesFor(ai: number, bi: number, A: Bounds, B: Bounds): Candidate[] {
  const out: Candidate[] = [];

  // A east of B?  A.maxX < B.minX, Y-ranges overlap.
  if (A.maxX < B.minX) {
    const ov = overlap(A.minY, A.maxY, B.minY, B.maxY, BRIDGE_WIDTH);
    if (ov) {
      const gap = B.minX - A.maxX - 1;
      if (gap > 0) {
        const y0 = midStart(ov[0], ov[1], BRIDGE_WIDTH);
        out.push({ a: ai, b: bi, dir: "E", gap, rect: { minX: A.maxX + 1, maxX: B.minX - 1, minY: y0, maxY: y0 + BRIDGE_WIDTH - 1 } });
      }
    }
  } else if (B.maxX < A.minX) {
    // B east of A → A west of B; record as edge from a to b dir W.
    const ov = overlap(A.minY, A.maxY, B.minY, B.maxY, BRIDGE_WIDTH);
    if (ov) {
      const gap = A.minX - B.maxX - 1;
      if (gap > 0) {
        const y0 = midStart(ov[0], ov[1], BRIDGE_WIDTH);
        out.push({ a: ai, b: bi, dir: "W", gap, rect: { minX: B.maxX + 1, maxX: A.minX - 1, minY: y0, maxY: y0 + BRIDGE_WIDTH - 1 } });
      }
    }
  }

  // A north of B? A.maxY < B.minY, X-ranges overlap.
  if (A.maxY < B.minY) {
    const ov = overlap(A.minX, A.maxX, B.minX, B.maxX, BRIDGE_WIDTH);
    if (ov) {
      const gap = B.minY - A.maxY - 1;
      if (gap > 0) {
        const x0 = midStart(ov[0], ov[1], BRIDGE_WIDTH);
        out.push({ a: ai, b: bi, dir: "S", gap, rect: { minY: A.maxY + 1, maxY: B.minY - 1, minX: x0, maxX: x0 + BRIDGE_WIDTH - 1 } });
      }
    }
  } else if (B.maxY < A.minY) {
    const ov = overlap(A.minX, A.maxX, B.minX, B.maxX, BRIDGE_WIDTH);
    if (ov) {
      const gap = A.minY - B.maxY - 1;
      if (gap > 0) {
        const x0 = midStart(ov[0], ov[1], BRIDGE_WIDTH);
        out.push({ a: ai, b: bi, dir: "N", gap, rect: { minY: B.maxY + 1, maxY: A.minY - 1, minX: x0, maxX: x0 + BRIDGE_WIDTH - 1 } });
      }
    }
  }

  return out;
}

/** Start coord so a `width`-wide span is centered in [lo,hi]. */
function midStart(lo: number, hi: number, width: number): number {
  const mid = Math.floor((lo + hi) / 2);
  let start = mid - Math.floor(width / 2);
  if (start < lo) start = lo;
  if (start + width - 1 > hi) start = hi - width + 1;
  return start;
}

// ── Geometry checks ──────────────────────────────────────────────────────────

function rectsOverlap(a: RoadRect, b: RoadRect): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** True if the bridge rect would pass through any island other than its two endpoints. */
function crossesIsland(rect: RoadRect, ai: number, bi: number, islands: readonly PlacedIsland[]): boolean {
  for (let i = 0; i < islands.length; i++) {
    if (i === ai || i === bi) continue;
    if (rectsOverlap(rect, islands[i]!.bounds)) return true;
  }
  return false;
}

// ── Union-find ─────────────────────────────────────────────────────────────────

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let r = x;
    while (this.parent[r] !== r) r = this.parent[r]!;
    while (this.parent[x] !== r) { const nx = this.parent[x]!; this.parent[x] = r; x = nx; }
    return r;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
    return true;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

/**
 * Builds the bridge network. `loopDelta` in [0,1] controls how many extra
 * (non-tree) edges are added: 0 = spanning tree only, higher = more loops.
 * Returns null if the islands cannot be connected with straight overlap bridges
 * (caller should retry the seed).
 */
export function buildBridgeGraph(
  islands: readonly PlacedIsland[],
  rng: Rng,
  loopDelta: number,
): BridgeGraphResult | null {
  const n = islands.length;

  // 1. Candidate edges (dedup ordered pairs; candidatesFor handles both dirs).
  const cands: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const c of candidatesFor(i, j, islands[i]!.bounds, islands[j]!.bounds)) {
        // Reject candidates that cross a third island up front.
        if (!crossesIsland(c.rect, c.a, c.b, islands)) cands.push(c);
      }
    }
  }

  // Stable sort: gap asc, then endpoint indices, then dir — fully deterministic.
  cands.sort((p, q) => p.gap - q.gap || p.a - q.a || p.b - q.b || (p.dir < q.dir ? -1 : p.dir > q.dir ? 1 : 0));

  // 2. MST (Kruskal). Skip edges whose bridge crosses an already-placed bridge.
  const uf = new UnionFind(n);
  const kept: Candidate[] = [];
  const placedRects: RoadRect[] = [];
  const edges: Array<[number, number]> = [];
  let components = n;

  const wouldCrossBridge = (rect: RoadRect): boolean =>
    placedRects.some((r) => rectsOverlap(rect, r));

  for (const c of cands) {
    if (uf.find(c.a) === uf.find(c.b)) continue; // already connected
    if (wouldCrossBridge(c.rect)) continue;
    uf.union(c.a, c.b);
    kept.push(c);
    placedRects.push(c.rect);
    edges.push([c.a, c.b]);
    components--;
  }

  if (components !== 1) return null; // disconnected — retry seed

  // 3. δ extra edges for loops (gap asc; skip crossings).
  for (const c of cands) {
    if (kept.includes(c)) continue;
    if (rng.nextFloat() >= loopDelta) continue;
    if (wouldCrossBridge(c.rect)) continue;
    kept.push(c);
    placedRects.push(c.rect);
    edges.push([c.a, c.b]);
  }

  return { roads: placedRects, edges };
}

/**
 * Connectivity check over the island-index edge list (BFS from island 0).
 * Exposed for tests.
 */
export function isConnected(n: number, edges: ReadonlyArray<[number, number]>): boolean {
  if (n === 0) return true;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a]!.push(b); adj[b]!.push(a); }
  const seen = new Uint8Array(n);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const x = stack.pop()!;
    for (const y of adj[x]!) if (!seen[y]) { seen[y] = 1; count++; stack.push(y); }
  }
  return count === n;
}
