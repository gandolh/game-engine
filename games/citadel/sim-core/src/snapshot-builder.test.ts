/**
 * audit-14: `state.buildingTiles` is now the single persistent tile→building-id
 * index `getBuildings`/`getVillagers` read (see the doc comments on
 * `SimState.buildingTiles` in sim-state.ts and at the top of snapshot-builder.ts).
 * These tests lock in the two ways an INCREMENTAL index can go stale that a
 * rebuilt-every-snapshot Map never could:
 *
 *  1. place → demolish → re-place the SAME tiles (placement.ts's own
 *     `addBuildingTiles`/`removeBuildingTiles` path) — the re-placed building
 *     must own the tiles under its NEW id, not a stale reference to the old one.
 *  2. a "destroy" site that clears `buildingTiles` by calling `.delete(idx)`
 *     directly per footprint tile WITHOUT going through `removeBuildingTiles`
 *     — exactly the pattern army.ts/fire-system.ts/siege-resolution.ts use.
 *     Those files are out of this change's scope, so this test stands in for
 *     them: it proves the index stays exact under that exact call shape,
 *     which is what makes `buildingTiles` staying a `Map` (not a second field)
 *     safe — `Map.prototype.delete` and `Set.prototype.delete` take the same
 *     single argument, so those sites needed no edits.
 *
 * A hand-built `SimState` (mirrors placement.test.ts's `makeState`) — no
 * `bootstrapSim`, no scheduler, no sim run.
 */
import { describe, it, expect } from "vitest";
import { World, OccupancyGrid, createRng } from "@engine/core";
import type { BuildingEntity } from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { SimState } from "./sim-state";
import { makePlayerState } from "./sim-state";
import { TerrainType } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import { createPlacementContext, placeOne, removeBuildingTiles } from "./systems/placement";
import { getBuildings, getVillagers } from "./snapshot-builder";

function makeTerrain(width = 32, height = 32): TerrainGrid {
  return { cells: new Uint8Array(width * height), width, height };
}

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
    buildingTiles: new Map<number, number>(),
    buildingState: new Map(),
    nextVillagerId: 1,
    connectivityDirty: true,
    events: [],
    eventsSeq: 0,
    rng: createRng(1).fork("snapshot-builder-test"),
    day: 0,
    players: [makePlayerState(0)],
    localId: 0,
    armies: [],
    nextArmyId: 1,
    commandLog: [],
  };
}

/**
 * A from-scratch tile→building-id index, computed the way `getBuildings` /
 * `getVillagers` used to (a fresh footprint walk over the ECS world) — the
 * ground truth `state.buildingTiles` must match after any placement/destroy
 * sequence.
 */
function freshIndex(state: SimState): Map<number, number> {
  const idx = new Map<number, number>();
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.id === undefined) continue;
    const b = entity.building;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) continue;
        idx.set(ty * state.width + tx, entity.id);
      }
    }
  }
  return idx;
}

/** Find the (sole) building entity whose footprint origin is (x,y). */
function findAt(state: SimState, x: number, y: number): BuildingEntity {
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.x === x && entity.building.y === y) return entity;
  }
  throw new Error(`no building at (${x},${y})`);
}

describe("audit-14: persistent buildingTiles index", () => {
  it("place -> demolish -> re-place on the same tiles matches a freshly-computed index", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    expect(placeOne(ctx, "storehouse", 5, 5)).toBe("ok"); // 3x2
    expect(placeOne(ctx, "farm", 10, 10)).toBe("ok"); // 3x3
    expect(state.buildingTiles).toEqual(freshIndex(state));

    const storehouse = findAt(state, 5, 5);
    const oldId = storehouse.id!;
    // Demolish (mirrors sim-bootstrap.ts's demolish command: removeBuildingTiles
    // + occupancy.remove + despawn + buildingState.delete — walkable rebake is
    // irrelevant to index correctness so it's omitted here).
    removeBuildingTiles(state, 5, 5, 3, 2);
    state.occupancy.remove({ x: 5, y: 5, w: 3, h: 2 });
    state.buildingWorld.despawn(storehouse);
    state.buildingState.delete(oldId);
    expect(state.buildingTiles).toEqual(freshIndex(state));
    // The demolished footprint is gone, not just re-pointed.
    expect(state.buildingTiles.has(5 * state.width + 5)).toBe(false);

    // Re-place on the exact same tiles.
    expect(placeOne(ctx, "storehouse", 5, 5)).toBe("ok");
    const rebuilt = findAt(state, 5, 5);
    const newId = rebuilt.id!;
    expect(newId).not.toBe(oldId); // fresh id, not reused

    expect(state.buildingTiles).toEqual(freshIndex(state));
    // Every re-placed tile points at the NEW id — no stale reference survived.
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(state.buildingTiles.get((5 + dy) * state.width + (5 + dx))).toBe(newId);
      }
    }
  });

  it("a raw per-tile .delete() destroy (the army/fire/siege shape) keeps the index exact without going through removeBuildingTiles", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    expect(placeOne(ctx, "farm", 20, 20)).toBe("ok"); // 3x3
    const farm = findAt(state, 20, 20);
    expect(state.buildingTiles.size).toBe(9);

    // The exact shape army.ts / fire-system.ts / siege-resolution.ts use: a
    // bare per-footprint-tile `.delete(idx)` loop, no call into placement.ts.
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        state.buildingTiles.delete((20 + dy) * state.width + (20 + dx));
      }
    }
    state.buildingWorld.despawn(farm);

    expect(state.buildingTiles.size).toBe(0);
    expect(state.buildingTiles).toEqual(freshIndex(state));
  });

  it("getBuildings/getVillagers read the re-placed building's NEW id, not a stale one", () => {
    const state = makeState();
    const terrain = makeTerrain();
    const ctx = createPlacementContext({ state, terrain, chargeBuildCost: false, enforceTerritory: false, multiplayer: false });

    expect(placeOne(ctx, "house", 8, 8)).toBe("ok"); // 2x2
    const oldHouse = findAt(state, 8, 8);
    const oldId = oldHouse.id!;
    state.buildingState.set(oldId, { ...state.buildingState.get(oldId)!, mood: 77 });

    removeBuildingTiles(state, 8, 8, 2, 2);
    state.occupancy.remove({ x: 8, y: 8, w: 2, h: 2 });
    state.buildingWorld.despawn(oldHouse);
    state.buildingState.delete(oldId);
    expect(placeOne(ctx, "house", 8, 8)).toBe("ok");
    const newId = findAt(state, 8, 8).id!;
    expect(newId).not.toBe(oldId);

    state.villagerWorld.spawn({
      villager: {
        id: 1, ownerId: 0, homeX: 8, homeY: 8, workX: 8, workY: 8,
        storeX: 8, storeY: 8, fsm: "idle", pathX: [], pathY: [], pathStep: 0,
        carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });

    const villagers = getVillagers(state);
    expect(villagers).toHaveLength(1);
    // The old runtime state (mood 77) was deleted with the old building; the
    // fresh one seeded via placeOne's freshRuntime() reports the neutral 40 —
    // proves the lookup resolved through the NEW id, not a leaked old one.
    expect(villagers[0]!.mood).toBe(40);

    const buildings = getBuildings(state);
    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.occupancy).toBe(1); // the idle villager tallies onto its home
  });
});
