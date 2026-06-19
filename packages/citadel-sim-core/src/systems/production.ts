/**
 * ProductionSystem — runs the goods economy each tick.
 *
 * For every connected building with at least one worker slot, once per
 * production cycle (ticksPerCycle):
 *   - Producers (no input good): emit outputPerCycle of their output good.
 *       Farms additionally scale by the seasonal grain multiplier.
 *   - Converters (input good set): consume inputPerCycle from the global pool
 *       (only if available) and emit outputPerCycle.
 *
 * Output is added both to the global stockpile (so the chain can proceed
 * deterministically without requiring hauling) and tracked in the building's
 * `outputBuffer` for display / villager-hauling flavor.
 *
 * Stage: "economy" (after connectivity).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { SimState } from "../sim-state";
import { getSeason, grainMultiplier } from "../world/seasons";

export class ProductionSystem implements System {
  readonly name = "ProductionSystem";

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    const state = this.state;

    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined) continue;
      if (def.workerSlots <= 0) continue; // storage / housing / road
      if (!rs.connected) continue;

      // Effective workers: assigned villagers, falling back to full slots so the
      // economy still runs before immigration populates the town.
      const workers = rs.workerCount > 0 ? rs.workerCount : def.workerSlots;
      if (workers <= 0) continue;

      // Cycle timer — first fire after a full cycle has elapsed.
      if (ctx.tick - rs.productionTick < def.ticksPerCycle) continue;
      rs.productionTick = ctx.tick;

      // Converters need their input good from the global pool.
      if (def.inputGood !== undefined && def.inputPerCycle > 0) {
        if (state.stockpiles[def.inputGood] < def.inputPerCycle) continue;
        state.stockpiles[def.inputGood] -= def.inputPerCycle;
      }

      if (def.outputGood === undefined || def.outputPerCycle <= 0) continue;

      let amount = def.outputPerCycle;
      if (def.outputGood === "grain") {
        const season = getSeason(state.day, state.daysPerYear);
        amount = Math.floor(amount * grainMultiplier(season));
      }
      if (amount <= 0) continue;

      state.stockpiles[def.outputGood] += amount;
      rs.outputBuffer += amount;
    }
  }
}
