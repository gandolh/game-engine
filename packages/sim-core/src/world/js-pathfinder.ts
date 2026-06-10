import type { PathfinderGrid } from "@engine/core";

interface PathPoint {
  x: number;
  y: number;
}

/**
 * Pure-JS BFS pathfinder implementing the same `findPath` interface as the
 * WASM Pathfinder. 4-connected (N/E/S/W), stateless, no heap allocation beyond
 * the path array. Used in headless run-sim so TravelSystem functions without
 * the WASM module and without memory-leak faults.
 *
 * Returns the shortest path from start to end (inclusive), or [] if no path.
 */
export class JsPathfinder {
  findPath(
    grid: PathfinderGrid,
    start: PathPoint,
    end: PathPoint,
  ): PathPoint[] {
    const { cells, width, height } = grid;

    // Boundary + walkability checks.
    const inBounds = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height;
    const isWalkable = (x: number, y: number) =>
      inBounds(x, y) && cells[y * width + x] === 0;

    if (!isWalkable(start.x, start.y) || !isWalkable(end.x, end.y)) return [];
    if (start.x === end.x && start.y === end.y) return [{ x: start.x, y: start.y }];

    // BFS with parent tracking. parent array: index → parent index (-1 = none).
    const size = width * height;
    const visited = new Uint8Array(size);
    const parent = new Int32Array(size).fill(-1);

    const queue: number[] = [];
    const startIdx = start.y * width + start.x;
    const endIdx = end.y * width + end.x;
    visited[startIdx] = 1;
    queue.push(startIdx);

    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];

    let head = 0;
    let found = false;

    while (head < queue.length) {
      const cur = queue[head++]!;
      if (cur === endIdx) { found = true; break; }

      const cx = cur % width;
      const cy = Math.floor(cur / width);

      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        if (!inBounds(nx, ny)) continue;
        const ni = ny * width + nx;
        if (visited[ni] || !isWalkable(nx, ny)) continue;
        visited[ni] = 1;
        parent[ni] = cur;
        queue.push(ni);
      }
    }

    if (!found) return [];

    // Reconstruct path from end to start, then reverse.
    const path: PathPoint[] = [];
    let cur = endIdx;
    while (cur !== -1) {
      path.push({ x: cur % width, y: Math.floor(cur / width) });
      cur = parent[cur]!;
    }
    path.reverse();
    return path;
  }
}
