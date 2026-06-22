/**
 * Bridges: a road dragged onto a water tile auto-converts to a `bridge` — a
 * walkable span that joins the road network — and bridges cannot overlap.
 *
 * Drives bootstrapSim() directly (no Worker, no browser).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { TerrainType, WORLD_WIDTH } from "../world/terrain";
import { villagerWalkable } from "../sim-state";

const SEED = 0x1234_5678;
const TICKS_PER_DAY = 20;

/** First in-bounds water tile in the generated terrain. */
function findWater(terrain: { width: number; height: number; cells: Uint8Array }): { x: number; y: number } {
  for (let ty = 0; ty < terrain.height; ty++) {
    for (let tx = 0; tx < terrain.width; tx++) {
      if (terrain.cells[ty * terrain.width + tx] === TerrainType.Water) return { x: tx, y: ty };
    }
  }
  throw new Error("no water tile in terrain");
}

/** Enqueue a road drag over the given tiles and flush one tick. */
function placeRoad(sim: CitadelSimResult, tiles: Array<{ x: number; y: number }>): void {
  sim.commands.enqueue({ type: "placeRoad", payload: { tiles } });
  sim.scheduler.tick({ tick: 0 });
}

function buildingAt(sim: CitadelSimResult, x: number, y: number): { type: string } | undefined {
  return sim.getSnapshot(0).buildings.find((b) => b.x === x && b.y === y);
}

describe("road over water → bridge", () => {
  it("a road placed on a water tile becomes a bridge", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 10 });
    const w = findWater(sim.terrain);
    placeRoad(sim, [w]);
    expect(buildingAt(sim, w.x, w.y)?.type).toBe("bridge");
  });

  it("a road placed on land stays a road", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 10 });
    // Find a grass tile.
    let land: { x: number; y: number } | null = null;
    for (let ty = 0; ty < sim.terrain.height && land === null; ty++) {
      for (let tx = 0; tx < sim.terrain.width; tx++) {
        if (sim.terrain.cells[ty * WORLD_WIDTH + tx] === TerrainType.Grass) { land = { x: tx, y: ty }; break; }
      }
    }
    expect(land).not.toBeNull();
    placeRoad(sim, [land!]);
    expect(buildingAt(sim, land!.x, land!.y)?.type).toBe("road");
  });

  it("a bridge tile becomes walkable for villagers (joins the road network)", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 10 });
    const w = findWater(sim.terrain);
    expect(villagerWalkable(sim.state, w.x, w.y)).toBe(false); // water starts blocked
    placeRoad(sim, [w]);
    expect(villagerWalkable(sim.state, w.x, w.y)).toBe(true); // decked → crossable
    expect(sim.roadGrid[w.y * WORLD_WIDTH + w.x]).toBe(1);
  });

  it("bridges cannot overlap — a second bridge on the same tile is rejected", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: 10 });
    const w = findWater(sim.terrain);
    placeRoad(sim, [w]);
    placeRoad(sim, [w]); // second drag over the same water tile
    const here = sim.getSnapshot(0).buildings.filter((b) => b.x === w.x && b.y === w.y);
    expect(here.length).toBe(1);
    expect(here[0]?.type).toBe("bridge");
  });
});
