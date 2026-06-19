/**
 * Pure-JS deterministic BFS pathfinder for Citadel villagers.
 *
 * Fixed neighbor order (N, E, S, W) keeps paths reproducible for a given
 * walkable predicate. Returns the path from start (exclusive) to goal
 * (inclusive), or null if no route exists.
 *
 * Citadel 31 (perf): the BFS `prev`/`visited` scratch is a PERSISTENT,
 * lazily-(re)allocated buffer reset in O(1) via a generation stamp — instead of
 * `new Uint32Array(width*height)` per call, which churned ~256KB per pathfind at
 * 256² (×N players × raiders/armies/haulers every tick → a GC storm). The BFS
 * algorithm, neighbor order, and goal-enterable rule are UNCHANGED, so routes are
 * byte-identical to the previous implementation (determinism is load-bearing —
 * proven by the multi-seed EXPORT digests). This pure-JS pathfinder is the ONE
 * authoritative pathfinder for the Citadel sim (no JS↔WASM mixing — those are not
 * route-equivalent).
 */

export interface PathNode {
  x: number;
  y: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // NORTH
  [1, 0], // EAST
  [0, 1], // SOUTH
  [-1, 0], // WEST
];

// --- Persistent BFS scratch (Citadel 31) ---------------------------------
// `prev[idx]` = predecessor tile index, valid only when `stamp[idx] === gen`
// (the current call's generation). Bumping `gen` is an O(1) "clear"; the buffers
// are reallocated only when the grid size changes. A new sim with a different
// size simply triggers one reallocation.
let scratchPrev = new Uint32Array(0);
let scratchStamp = new Uint32Array(0);
let scratchTotal = 0;
let scratchGen = 0;

function nextGeneration(total: number): { prev: Uint32Array; stamp: Uint32Array; gen: number } {
  if (scratchTotal !== total) {
    scratchPrev = new Uint32Array(total);
    scratchStamp = new Uint32Array(total); // all 0 → no tile matches gen ≥ 1
    scratchTotal = total;
    scratchGen = 0;
  }
  scratchGen++;
  // Uint32 generation: hard-reset before it could wrap and alias an old stamp.
  if (scratchGen >= 0xffffffff) {
    scratchStamp.fill(0);
    scratchGen = 1;
  }
  return { prev: scratchPrev, stamp: scratchStamp, gen: scratchGen };
}

export function bfsPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  walkable: (tx: number, ty: number) => boolean,
  width: number,
  height: number,
): PathNode[] | null {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;
  if (goalX < 0 || goalY < 0 || goalX >= width || goalY >= height) return null;

  if (startX === goalX && startY === goalY) return [];

  const total = width * height;
  const { prev, stamp, gen } = nextGeneration(total);

  const startIdx = startY * width + startX;
  const goalIdx = goalY * width + goalX;

  // Mark start as visited (its own predecessor — never read back).
  prev[startIdx] = startIdx;
  stamp[startIdx] = gen;

  // Simple array-backed FIFO queue of tile indices.
  const queue: number[] = [startIdx];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head]!;
    head++;
    if (cur === goalIdx) break;

    const cx = cur % width;
    const cy = (cur - cx) / width;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (stamp[nIdx] === gen) continue; // already visited this call
      // Goal is always enterable; otherwise the tile must be walkable.
      if (nIdx !== goalIdx && !walkable(nx, ny)) continue;
      prev[nIdx] = cur;
      stamp[nIdx] = gen;
      queue.push(nIdx);
    }
  }

  if (stamp[goalIdx] !== gen) return null;

  // Reconstruct from goal back to start (exclusive).
  const path: PathNode[] = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    const cx = cur % width;
    const cy = (cur - cx) / width;
    path.push({ x: cx, y: cy });
    const p = prev[cur]!;
    cur = p;
  }
  path.reverse();
  return path;
}
