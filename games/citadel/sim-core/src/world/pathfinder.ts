/**
 * Pure-JS deterministic BFS pathfinder for Citadel villagers.
 *
 * Fixed neighbor order (N, E, S, W) keeps paths reproducible for a given
 * walkable predicate. Returns the path from start (exclusive) to goal
 * (inclusive), or null if no route exists.
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

const UNVISITED = 0xffffffff;

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
  // prev[idx] = predecessor tile index, or UNVISITED if not reached.
  const prev = new Uint32Array(total).fill(UNVISITED);

  const startIdx = startY * width + startX;
  const goalIdx = goalY * width + goalX;

  // Mark start as visited (its own predecessor — never read back).
  prev[startIdx] = startIdx;

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
      if (prev[nIdx] !== UNVISITED) continue;
      // Goal is always enterable; otherwise the tile must be walkable.
      if (nIdx !== goalIdx && !walkable(nx, ny)) continue;
      prev[nIdx] = cur;
      queue.push(nIdx);
    }
  }

  if (prev[goalIdx] === UNVISITED) return null;

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
