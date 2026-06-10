import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { buildWalkableGrid } from "./walkable-grid";
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS, ROADS, getRegion } from "./regions";

const VILLAGE = getRegion("village").center; // BFS seed for reachability floods

/**
 * Solid-obstacle connectivity guard.
 *
 * Workshop props + big-building footprints are now `solid` (they block movement
 * for both Pip and the AI pathfinder). This test boots a real sim, overlays
 * every `solid` tile onto the base walkable grid, and asserts that blocking
 * them did NOT wall anything off:
 *  - every region's interior is still reachable from the village,
 *  - every farm plot tile is reachable (farmers must reach their plots),
 *  - every work-NPC station tile is reachable AND not itself solid,
 *  - no `solid` tile sits on a bridge/road tile (would sever an island).
 *
 * If a future prop placement traps a region or covers a station/road, this
 * fails loudly with the offending tile.
 */

function idx(x: number, y: number): number {
  return y * WORLD_WIDTH + x;
}

/** Base grid (regions + roads) with every world `solid` tile blocked. */
function gridWithSolids(world: ReturnType<typeof bootstrapSim>["world"]): Uint8Array {
  const cells = Uint8Array.from(buildWalkableGrid().cells);
  for (const e of world.query("solid")) {
    const { tileX, tileY } = e.solid;
    if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH || tileY >= WORLD_HEIGHT) continue;
    cells[idx(tileX, tileY)] = 1;
  }
  return cells;
}

/** Flood-fill walkable (0) tiles from a seed, 4-connected. Returns the visited set. */
function flood(cells: Uint8Array, seedX: number, seedY: number): Uint8Array {
  const seen = new Uint8Array(cells.length);
  const stack: number[] = [idx(seedX, seedY)];
  seen[stack[0]!] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % WORLD_WIDTH;
    const y = (i - x) / WORLD_WIDTH;
    const nbrs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;
    for (const [nx, ny] of nbrs) {
      if (nx < 0 || ny < 0 || nx >= WORLD_WIDTH || ny >= WORLD_HEIGHT) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || cells[ni] !== 0) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}

describe("solid-obstacle connectivity", () => {
  it("every region center stays reachable from the village after blocking solids", () => {
    const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 1200, maxDays: 1 });
    const cells = gridWithSolids(world);
    // Seed from a village interior tile (always walkable, never solid).
    const reachable = flood(cells, VILLAGE.x, VILLAGE.y);
    for (const r of REGIONS) {
      // Wells are 2×2 micro-regions; use their center like any other region.
      expect(reachable[idx(r.center.x, r.center.y)], `region ${r.id} center unreachable`).toBe(1);
    }
  });

  it("no solid tile covers a road/bridge tile", () => {
    const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 1200, maxDays: 1 });
    const solidSet = new Set<number>();
    for (const e of world.query("solid")) solidSet.add(idx(e.solid.tileX, e.solid.tileY));
    // No solid prop / footprint may sit on ANY road tile — a bridge is 2-wide and
    // a single blocked tile can sever the island it connects.
    for (const road of ROADS) {
      for (let y = road.minY; y <= road.maxY; y++) {
        for (let x = road.minX; x <= road.maxX; x++) {
          expect(solidSet.has(idx(x, y)), `solid blocks bridge tile (${x},${y})`).toBe(false);
        }
      }
    }
  });

  it("every work-NPC station tile is reachable and not itself solid", () => {
    const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 1200, maxDays: 1 });
    const cells = gridWithSolids(world);
    const reachable = flood(cells, VILLAGE.x, VILLAGE.y);
    const solidSet = new Set<number>();
    for (const e of world.query("solid")) solidSet.add(idx(e.solid.tileX, e.solid.tileY));
    for (const npc of world.query("workNpc")) {
      for (const st of npc.workNpc.stations) {
        const i = idx(st.tileX, st.tileY);
        expect(solidSet.has(i), `station (${st.tileX},${st.tileY}) is solid`).toBe(false);
        expect(reachable[i], `station (${st.tileX},${st.tileY}) unreachable`).toBe(1);
      }
    }
  });

  it("every farm plot tile is reachable and not solid", () => {
    const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 1200, maxDays: 1 });
    const cells = gridWithSolids(world);
    const reachable = flood(cells, VILLAGE.x, VILLAGE.y);
    const solidSet = new Set<number>();
    for (const e of world.query("solid")) solidSet.add(idx(e.solid.tileX, e.solid.tileY));
    for (const p of world.query("plot")) {
      const i = idx(p.plot.tileX, p.plot.tileY);
      expect(solidSet.has(i), `plot (${p.plot.tileX},${p.plot.tileY}) is solid`).toBe(false);
      expect(reachable[i], `plot (${p.plot.tileX},${p.plot.tileY}) unreachable`).toBe(1);
    }
  });
});
