/**
 * Chunk 1 — per-house mood/coverage.
 *
 * NeedsHappinessSystem already computes per-house hasFaith/hasSafety/hasGoodsAccess
 * while aggregating coverage; these tests pin down that it now ALSO persists the
 * per-house result onto BuildingRuntimeState (lacksFaith/lacksSafety/lacksGoods +
 * a derived `mood`) without disturbing the town-aggregate outputs.
 *
 * Driven like the sibling sim-core system tests (villager-owner.test.ts):
 * construct a SimState via bootstrapSim, place buildings directly, run the system
 * at tick === ticksPerDay (the daily pass).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { SimState } from "../sim-state";
import type { BuildingRuntimeState } from "../entities/building";
import { NeedsHappinessSystem } from "./needs-happiness";

const TICKS_PER_DAY = 20;

function addBuilding(
  state: SimState,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ownerId = 0,
): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId } });
  const rs: BuildingRuntimeState = {
    outputBuffer: 0,
    workerCount: 0,
    connected: true,
    productionTick: 0,
    level: 1,
  };
  state.buildingState.set(entity.id!, rs);
  return entity.id!;
}

function runDaily(state: SimState): void {
  new NeedsHappinessSystem(state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY });
}

describe("NeedsHappinessSystem — per-house mood/coverage", () => {
  it("a house inside a chapel radius has lacksFaith=false and higher mood than an uncovered house", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // Covered house next to a chapel (chapel radius = 8, Manhattan).
    const covered = addBuilding(state, "house", 20, 20, 2, 2); // centre (21,21)
    addBuilding(state, "chapel", 22, 20, 2, 2); // centre (23,21) → dist 2 ≤ 8
    // Identical house far from any service.
    const bare = addBuilding(state, "house", 60, 60, 2, 2);

    runDaily(state);

    const coveredRs = state.buildingState.get(covered)!;
    const bareRs = state.buildingState.get(bare)!;

    expect(coveredRs.lacksFaith).toBe(false);
    expect(bareRs.lacksFaith).toBe(true);
    expect(coveredRs.mood!).toBeGreaterThan(bareRs.mood!);
  });

  it("a fully-uncovered house has mood=40 (base) and all three lacksX=true", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;
    const id = addBuilding(state, "house", 40, 40, 2, 2);

    runDaily(state);

    const rs = state.buildingState.get(id)!;
    expect(rs.lacksFaith).toBe(true);
    expect(rs.lacksSafety).toBe(true);
    expect(rs.lacksGoods).toBe(true);
    expect(rs.mood).toBe(40);
  });

  it("a fully-covered house (chapel+safety+market with goods in range) has mood=100 and all lacksX=false", () => {
    const sim = bootstrapSim({ seed: 1, ticksPerDay: TICKS_PER_DAY, maxDays: 1, worldWidth: 96, worldHeight: 96 });
    const state = sim.state;

    // Goods access requires stockpiled bread/grain AND a market in range.
    sim.stockpiles.grain = 10;

    const id = addBuilding(state, "house", 30, 30, 2, 2); // centre (31,31)
    addBuilding(state, "chapel", 32, 30, 2, 2);    // centre (33,31) dist 2
    addBuilding(state, "watchpost", 30, 32, 2, 2); // centre (31,33) dist 2
    addBuilding(state, "market", 32, 32, 2, 2);    // centre (33,33) dist 4

    runDaily(state);

    const rs = state.buildingState.get(id)!;
    expect(rs.lacksFaith).toBe(false);
    expect(rs.lacksSafety).toBe(false);
    expect(rs.lacksGoods).toBe(false);
    expect(rs.mood).toBe(100);
  });
});
