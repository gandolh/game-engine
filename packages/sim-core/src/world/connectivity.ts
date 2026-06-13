import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT } from './regions';

let componentMap: Int32Array | undefined;

function buildComponentMap(): Int32Array {
  const { cells } = buildWalkableGrid();
  const map = new Int32Array(cells.length).fill(-1);
  let nextId = 0;

  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== 0 || map[start] !== -1) continue;

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

export function componentOf(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return -1;
  if (!componentMap) componentMap = buildComponentMap();
  return componentMap[y * WORLD_WIDTH + x]!;
}

export function sameComponent(ax: number, ay: number, bx: number, by: number): boolean {
  const ca = componentOf(ax, ay);
  if (ca === -1) return false;
  return ca === componentOf(bx, by);
}

export function _resetComponentMap(): void {
  componentMap = undefined;
}
