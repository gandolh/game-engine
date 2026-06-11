import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT } from './regions';

/**
 * Lazy-singleton 4-connected component map over the walkable grid.
 *
 * Built once on first access via buildWalkableGrid(). Non-walkable tiles get
 * component id -1 (sentinel). Every contiguous land pocket gets a unique
 * non-negative integer id. The main land cluster (village + all bridges +
 * all farm islands) forms one component; isolated ocean tiles stay -1.
 *
 * Deterministic: depends only on REGIONS + ROADS (build-time constants).
 * No Rng, no Math.random, no Date.now, no WASM.
 */

/** Component id per tile. Length = WORLD_WIDTH * WORLD_HEIGHT. Non-walkable = -1. */
let componentMap: Int32Array | undefined;

function buildComponentMap(): Int32Array {
  const { cells } = buildWalkableGrid();
  const map = new Int32Array(cells.length).fill(-1);
  let nextId = 0;

  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== 0 || map[start] !== -1) continue;

    // BFS flood from this unvisited walkable tile.
    const id = nextId++;
    map[start] = id;
    const stack: number[] = [start];

    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % WORLD_WIDTH;
      const y = (i - x) / WORLD_WIDTH;

      const neighbors = [
        x + 1 < WORLD_WIDTH                   ? i + 1           : -1,
        x - 1 >= 0                             ? i - 1           : -1,
        y + 1 < WORLD_HEIGHT                   ? i + WORLD_WIDTH : -1,
        y - 1 >= 0                             ? i - WORLD_WIDTH : -1,
      ];
      for (const ni of neighbors) {
        if (ni < 0 || cells[ni] !== 0 || map[ni] !== -1) continue;
        map[ni] = id;
        stack.push(ni);
      }
    }
  }

  return map;
}

/** Return the component id of the tile at (x, y), or -1 if non-walkable / out of bounds. */
export function componentOf(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return -1;
  if (!componentMap) componentMap = buildComponentMap();
  return componentMap[y * WORLD_WIDTH + x]!;
}

/**
 * Return true iff both tiles are walkable and belong to the same 4-connected
 * land component (i.e. a land-only path exists between them).
 *
 * Returns false if either tile is non-walkable, out of bounds, or in a
 * disconnected pocket (e.g. a reef islet that is boat-only).
 */
export function sameComponent(ax: number, ay: number, bx: number, by: number): boolean {
  const ca = componentOf(ax, ay);
  if (ca === -1) return false;
  return ca === componentOf(bx, by);
}

/** Visible for testing: reset the memoised map (call only in tests). */
export function _resetComponentMap(): void {
  componentMap = undefined;
}
