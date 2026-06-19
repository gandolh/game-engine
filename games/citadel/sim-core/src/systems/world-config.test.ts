/**
 * Citadel 29 — configurable world size + town-hall anchor.
 *
 * Drives bootstrapSim() directly (no Worker). Verifies the world dimensions are
 * read from config (default 96×96; a configured 256×256 sizes every grid-backed
 * allocation + the pathfinder + snapshot), and that the town-hall is a placeable,
 * non-tier-locked anchor that sets the owning player's keep position.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer } from "../sim-state";
import { WORLD_WIDTH, WORLD_HEIGHT, TerrainType } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import { bfsPath } from "../world/pathfinder";

const TICKS_PER_DAY = 20;

/** Find an all-grass w×h footprint near (sx, sy), scanning outward. */
function findGrass(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x + w > terrain.width || y + h > terrain.height) continue;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++) {
            if (terrain.cells[(y + yy) * terrain.width + (x + xx)] !== TerrainType.Grass) { ok = false; break; }
          }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

describe("Citadel 29 — configurable world + town-hall", () => {
  it("defaults to the engine 96×96 world", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5 });
    expect(sim.state.width).toBe(WORLD_WIDTH);
    expect(sim.state.height).toBe(WORLD_HEIGHT);
    expect(sim.terrain.width).toBe(96);
    expect(sim.terrain.height).toBe(96);
    expect(sim.terrain.cells.length).toBe(96 * 96);
    expect(sim.roadGrid.length).toBe(96 * 96);
  });

  it("sizes every grid-backed allocation + the pathfinder to a configured 256×256 world", () => {
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H });
    expect(sim.state.width).toBe(W);
    expect(sim.state.height).toBe(H);
    expect(sim.terrain.width).toBe(W);
    expect(sim.terrain.height).toBe(H);
    expect(sim.terrain.cells.length).toBe(W * H);
    expect(sim.roadGrid.length).toBe(W * H);
    expect(sim.walkable.length).toBe(W * H);

    // The pathfinder operates over the configured 256² extents (proven on a
    // connected grass strip — a corner-to-corner path can be legitimately blocked
    // by the river that bisects the map, which is not what this asserts).
    const passable = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < W && y < H &&
      sim.terrain.cells[y * W + x] !== TerrainType.Water &&
      sim.terrain.cells[y * W + x] !== TerrainType.Rough;
    const strip = findGrass(sim.terrain, 4, 1, Math.floor(W / 2), Math.floor(H / 2));
    const path = bfsPath(strip.x, strip.y, strip.x + 3, strip.y, passable, W, H);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);

    // The sim advances several days on the large world without error.
    for (let t = 0; t < TICKS_PER_DAY * 3; t++) sim.scheduler.tick({ tick: t });
    expect(sim.getSnapshot(TICKS_PER_DAY * 3)).toBeDefined();
  });

  it("town-hall is a non-tier-locked anchor that sets the owner's keep position", () => {
    const W = 256, H = 256;
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 5, worldWidth: W, worldHeight: H });
    const lp = localPlayer(sim.state);
    // Match start: Hamlet tier, no anchor yet.
    expect(lp.tier).toBe("Hamlet");
    expect(lp.keepPosition).toBeNull();

    // Place the town-hall at match start on a clear tile (a Town-locked keep
    // would be rejected here — the town-hall must NOT be locked).
    const spot = findGrass(sim.terrain, 3, 3, Math.floor(W / 2), Math.floor(H / 2));
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "town-hall", x: spot.x, y: spot.y } });
    sim.scheduler.tick({ tick: 0 });

    const halls = [...sim.world.query("building")].filter((e) => e.building.type === "town-hall");
    expect(halls.length).toBe(1);
    expect(halls[0]!.building.ownerId).toBe(0);
    // The anchor is set (raiders target it; sacking it ends the player's run).
    expect(lp.keepPosition).not.toBeNull();
    expect(lp.keepPosition!.x).toBe(spot.x + 1); // center of the 3×3 footprint
    expect(lp.keepPosition!.y).toBe(spot.y + 1);
  });
});
