/**
 * audit-23: placement-rejection tests that exercise `placeOne` / `placeDragged` /
 * `describeReject` / `actsAsKeepAnchor` directly against a hand-built `SimState` —
 * WITHOUT booting the whole sim (no scheduler, no systems, no command queue, no
 * `bootstrapSim` at all). Before the extraction this coverage was impossible: the
 * placement logic only existed as closures inside `bootstrapSim`.
 */
import { describe, it, expect } from "vitest";
import { World, OccupancyGrid, createRng } from "@engine/core";
import type { BuildingEntity } from "../entities/building";
import type { VillagerEntity } from "../entities/villager";
import type { SimState } from "../sim-state";
import { makePlayerState } from "../sim-state";
import type { TerrainGrid } from "../world/terrain";
import { createPlacementContext, placeOne, placeDragged, describeReject, actsAsKeepAnchor } from "./placement";

/** A 32×32 all-grass terrain grid (TerrainType.Grass === 0, the zeroed default). */
function makeTerrain(width = 32, height = 32): TerrainGrid {
  return { cells: new Uint8Array(width * height), width, height };
}

/** Minimal hand-built SimState — deliberately NOT going through bootstrapSim. */
function makeState(width = 32, height = 32): SimState {
  return {
    width,
    height,
    ticksPerDay: 20,
    daysPerYear: 16,
    buildingWorld: new World<BuildingEntity>(),
    villagerWorld: new World<VillagerEntity>(),
    occupancy: new OccupancyGrid(width, height),
    roadGrid: new Uint8Array(width * height),
    buildingTiles: new Set<number>(),
    buildingState: new Map(),
    nextVillagerId: 1,
    connectivityDirty: true,
    events: [],
    eventsSeq: 0,
    rng: createRng(1).fork("placement-test"),
    day: 0,
    players: [makePlayerState(0)],
    localId: 0,
    armies: [],
    nextArmyId: 1,
    commandLog: [],
  };
}

describe("placement (unit, no bootstrapSim)", () => {
  it("rejects a tier-locked building type and mutates nothing", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    // "wall" is Village-tier-locked (TIER_LOCK); a fresh Hamlet player can't place it.
    const r = placeOne(ctx, "wall", 5, 5);
    expect(r).toBe("tier");
    expect(describeReject(state, "wall", r)).toContain("Village");

    // Nothing was mutated on rejection.
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
    expect(state.occupancy.isOccupied(5, 5)).toBe(false);
    expect(state.buildingTiles.size).toBe(0);
  });

  it("places a building, then rejects a second placement on the same tiles as occupied", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const ok = placeOne(ctx, "house", 10, 10); // 2×2, no tier lock, no terrain req
    expect(ok).toBe("ok");
    expect([...state.buildingWorld.query("building")]).toHaveLength(1);
    expect(state.buildingTiles.has(10 * state.width + 10)).toBe(true);

    const rejected = placeOne(ctx, "house", 10, 10);
    expect(rejected).toBe("occupied");
    expect(describeReject(state, "house", rejected)).toContain("taken");
    // The rejected attempt spawned nothing new.
    expect([...state.buildingWorld.query("building")]).toHaveLength(1);
  });

  it("rejects an out-of-bounds placement", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const r = placeOne(ctx, "house", state.width - 1, state.height - 1); // 2×2 footprint runs off the edge
    expect(r).toBe("bounds");
    expect(describeReject(state, "house", r)).toContain("off the map");
  });

  it("rejects for cost when chargeBuildCost is on and the player is broke", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: true, enforceTerritory: false, multiplayer: false });

    const r = placeOne(ctx, "house", 4, 4);
    expect(r).toBe("cost");
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
  });

  it("placeDragged coalesces a fully tier-locked drag into one summary event", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    const tiles = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
    placeDragged(ctx, "wall", tiles); // Village-tier-locked, so every tile is rejected
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toContain("3 walls need Village tier");
    expect([...state.buildingWorld.query("building")]).toHaveLength(0);
  });

  it("actsAsKeepAnchor: solo town-hall is civic-only, MP town-hall anchors", () => {
    expect(actsAsKeepAnchor("town-hall", false)).toBe(false);
    expect(actsAsKeepAnchor("town-hall", true)).toBe(true);
    expect(actsAsKeepAnchor("keep", false)).toBe(true);
    expect(actsAsKeepAnchor("keep", true)).toBe(true);
    expect(actsAsKeepAnchor("house", false)).toBe(false);
  });
});
