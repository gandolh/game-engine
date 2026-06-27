/**
 * Citadel 38 P1#5 — VillagerSystem owner filter.
 *
 * In MP a villager must only staff and haul to its OWN player's buildings.
 * Before the fix, `assign()`/`firstStore()` queried ALL buildings, so a player-1
 * villager would take the nearest player-0 workplace, walk to a player-0 store,
 * and (since the deposit credits `v.ownerId`) silently siphon player-0's output
 * into player-1's pool. These tests drive VillagerSystem directly (no scheduler →
 * no connectivity recompute) with a controlled two-owner building set.
 *
 * Solo is single-owner, so the filter is always-true there → byte-identical.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { makePlayerState } from "../sim-state";
import type { SimState } from "../sim-state";
import { VillagerSystem } from "./villager-system";
import type { VillagerComponent } from "../entities/villager";
import type { BuildingRuntimeState } from "../entities/building";

function addBuilding(state: SimState, type: string, x: number, y: number, w: number, h: number, ownerId: number): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId } });
  const rs: BuildingRuntimeState = {
    outputBuffer: 0,
    workerCount: 0,
    connected: true, // we never run the connectivity system here
    productionTick: 0,
    level: 1,
  };
  state.buildingState.set(entity.id!, rs);
  return entity.id!;
}

function addIdleVillager(state: SimState, ownerId: number, homeX: number, homeY: number): VillagerComponent {
  const v: VillagerComponent = {
    id: state.nextVillagerId++,
    ownerId,
    homeX,
    homeY,
    workX: 0,
    workY: 0,
    storeX: 0,
    storeY: 0,
    fsm: "idle",
    pathX: [],
    pathY: [],
    pathStep: 0,
    carryGood: null,
    carryAmount: 0,
    ticksAtWork: 0,
  };
  state.villagerWorld.spawn({ villager: v });
  return v;
}

/** Two owners, each with a farm (workplace) + storehouse. Player 0's farm is
 *  deliberately placed NEARER the player-1 villager's home than player 1's farm. */
function setup(): { state: SimState; p0FarmId: number; p1FarmId: number } {
  const sim = bootstrapSim({ seed: 1, ticksPerDay: 20, maxDays: 5, worldWidth: 96, worldHeight: 96 });
  sim.state.players.push(makePlayerState(1));
  // Player 0 economy — NEAR (28,30)..(24,30).
  const p0FarmId = addBuilding(sim.state, "farm", 28, 30, 3, 3, 0); // center (29,31)
  addBuilding(sim.state, "storehouse", 24, 30, 3, 2, 0); // center (25,31)
  // Player 1 economy — FAR (50,30)..(54,30).
  const p1FarmId = addBuilding(sim.state, "farm", 50, 30, 3, 3, 1); // center (51,31)
  addBuilding(sim.state, "storehouse", 54, 30, 3, 2, 1); // center (55,31)
  return { state: sim.state, p0FarmId, p1FarmId };
}

describe("Citadel 38 P1#5 — villager owner filter", () => {
  it("a player-1 villager skips the NEARER rival farm for its own (farther) farm", () => {
    const { state, p0FarmId, p1FarmId } = setup();
    const v = addIdleVillager(state, 1, 30, 30); // home next to player 0's farm

    new VillagerSystem(state).run({ tick: 0 });

    // Assigned to player 1's OWN farm (center 51,31), not player 0's nearer one.
    expect(v.fsm).toBe("walkToWork");
    expect({ x: v.workX, y: v.workY }).toEqual({ x: 51, y: 31 });
    // Hauls to player 1's OWN store, not player 0's (also nearer).
    expect({ x: v.storeX, y: v.storeY }).toEqual({ x: 55, y: 31 });
    // The rival's farm was NOT staffed; the owned farm was.
    expect(state.buildingState.get(p0FarmId)!.workerCount).toBe(0);
    expect(state.buildingState.get(p1FarmId)!.workerCount).toBe(1);
  });

  it("normal nearest-workplace assignment still works within an owner (control)", () => {
    const { state, p0FarmId, p1FarmId } = setup();
    const v = addIdleVillager(state, 0, 30, 30); // player 0 villager near player 0's farm

    new VillagerSystem(state).run({ tick: 0 });

    // Picks player 0's own (and nearest) farm.
    expect(v.fsm).toBe("walkToWork");
    expect({ x: v.workX, y: v.workY }).toEqual({ x: 29, y: 31 });
    expect(state.buildingState.get(p0FarmId)!.workerCount).toBe(1);
    expect(state.buildingState.get(p1FarmId)!.workerCount).toBe(0);
  });
});
