/** Shared geometry helpers used by the scenario builders in this directory. */
import { isWalkable, TerrainType } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";

/** Find a clear w×h region of buildable tiles near (preferX, preferY). */
export function findClear(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Find a 2×2 region overlapping a Stone tile (for quarry/mine). */
export function findStone(terrain: TerrainGrid, sx: number, sy: number): { x: number; y: number } | null {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 1 || y < 1 || x >= terrain.width - 2 || y >= terrain.height - 2) continue;
        let stone = false;
        let blocked = false;
        for (let yy = 0; yy < 2; yy++)
          for (let xx = 0; xx < 2; xx++) {
            const t = terrain.cells[(y + yy) * terrain.width + (x + xx)]!;
            if (t === TerrainType.Stone) stone = true;
            if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
          }
        if (stone && !blocked) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Find a 2×2 region overlapping a Stone tile that is REACHABLE from
 * (anchorX, anchorY) via walkable terrain.  Falls back to findStone if no
 * reachable placement exists (caller should handle null = skip quarry).
 */
export function findConnectedStone(
  terrain: TerrainGrid,
  anchorX: number,
  anchorY: number,
): { x: number; y: number } | null {
  const W = terrain.width;
  const H = terrain.height;
  // BFS from anchor to build the reachable set.
  const visited = new Uint8Array(W * H);
  const queue: number[] = [anchorY * W + anchorX];
  visited[anchorY * W + anchorX] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi]!;
    const x = idx % W;
    const y = (idx - x) / W;
    for (const delta of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nx = x + delta[0];
      const ny = y + delta[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!isWalkable(terrain, nx, ny)) continue;
      const ni = ny * W + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }
  // Now find the closest 2×2 stone placement reachable from anchor.
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = anchorX + dx;
        const y = anchorY + dy;
        if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue;
        let stone = false;
        let blocked = false;
        let reachable = false;
        for (let yy = 0; yy < 2; yy++) {
          for (let xx = 0; xx < 2; xx++) {
            const t = terrain.cells[(y + yy) * W + (x + xx)]!;
            if (t === TerrainType.Stone) stone = true;
            if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
            if (visited[(y + yy) * W + (x + xx)]) reachable = true;
          }
        }
        // Also check the 8 border tiles around the 2×2 footprint for reachability.
        if (!reachable) {
          outer: for (let by = -1; by <= 2; by++) {
            for (let bx = -1; bx <= 2; bx++) {
              if (by >= 0 && by <= 1 && bx >= 0 && bx <= 1) continue;
              const bax = x + bx;
              const bay = y + by;
              if (bax >= 0 && bay >= 0 && bax < W && bay < H && visited[bay * W + bax]) {
                reachable = true;
                break outer;
              }
            }
          }
        }
        if (stone && !blocked && reachable) return { x, y };
      }
    }
  }
  return null;
}

/** Build a straight road (horizontal then vertical) from a to b, collecting tiles. */
export function link(tiles: Array<{ x: number; y: number }>, ax: number, ay: number, bx: number, by: number): void {
  let x = ax;
  let y = ay;
  while (x !== bx) { tiles.push({ x, y }); x += x < bx ? 1 : -1; }
  while (y !== by) { tiles.push({ x, y }); y += y < by ? 1 : -1; }
  tiles.push({ x: bx, y: by });
}
