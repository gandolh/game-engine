import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { TraderSystem } from "./trader";
import type { SimState } from "../sim-state";
import type { BuildingRuntimeState } from "../entities/building";

const SEED = 0xf1a7e0;
const TICKS_PER_DAY = 20;

function spawnTradingPost(state: SimState, x: number, y: number): number {
  const e = state.buildingWorld.spawn({
    building: { type: "tradingpost", x, y, w: 2, h: 2, ownerId: 0 },
  });
  const rs: BuildingRuntimeState = {
    outputBuffer: 0,
    workerCount: 1,
    connected: true,
    productionTick: 0,
    level: 1,
  };
  state.buildingState.set(e.id!, rs);
  return e.id!;
}

describe("TraderSystem — suppressed Trading Post is not open", () => {
  it("a staffed, connected, suppressed Trading Post reports no open trading post and produces no offers", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
    const id = spawnTradingPost(sim.state, 14, 14);
    sim.state.buildingState.get(id)!.suppressed = true;

    new TraderSystem(sim.state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY });

    const player = sim.state.players[0]!;
    expect(player.traderPresent).toBe(false);
    expect(player.traderOffers.length).toBe(0);
  });

  it("clearing the suppressed flag restores the open trading post and its offers", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
    const id = spawnTradingPost(sim.state, 14, 14);
    sim.state.buildingState.get(id)!.suppressed = true;

    new TraderSystem(sim.state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY });
    expect(sim.state.players[0]!.traderPresent).toBe(false);

    sim.state.buildingState.get(id)!.suppressed = false;
    new TraderSystem(sim.state, TICKS_PER_DAY).run({ tick: TICKS_PER_DAY * 2 });

    const player = sim.state.players[0]!;
    expect(player.traderPresent).toBe(true);
    expect(player.traderOffers.length).toBeGreaterThan(0);
  });
});
