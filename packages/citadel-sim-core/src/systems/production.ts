/**
 * ProductionSystem — runs the goods economy each tick.
 *
 * For every connected building with at least one REAL assigned worker
 * (workerCount > 0), once per production cycle (ticksPerCycle):
 *   - Producers (no input good): emit outputPerCycle into the building's
 *       LOCAL outputBuffer. Farms additionally scale by the seasonal grain
 *       multiplier (0 in winter → no output).
 *   - Converters (input good set): consume inputPerCycle from the GLOBAL
 *       stockpile (the Storehouse pool), then emit outputPerCycle into their
 *       local outputBuffer. Converters also only run with a real worker.
 *
 * Goods only reach the global stockpile when a VillagerSystem hauler carries
 * them from the building's outputBuffer to a connected Storehouse. This means:
 *   - A building with NO assigned worker produces nothing.
 *   - A building disconnected from a Storehouse produces nothing.
 *   - Physical hauling is the mechanism; production.ts never writes to
 *     state.stockpiles directly.
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

      // A building only produces if it has at least one real assigned worker.
      if (rs.workerCount <= 0) continue;

      // A building only produces if it is connected to a Storehouse.
      if (!rs.connected) continue;

      // Cycle timer — first fire after a full cycle has elapsed.
      if (ctx.tick - rs.productionTick < def.ticksPerCycle) continue;
      rs.productionTick = ctx.tick;

      // Converters draw their input good from the global stockpile (goods
      // previously hauled to a Storehouse by workers from upstream producers).
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

      // Output goes into the building's LOCAL buffer. It does NOT enter the
      // global stockpile until a villager hauls it to a Storehouse.
      rs.outputBuffer += amount;
    }
  }
}
