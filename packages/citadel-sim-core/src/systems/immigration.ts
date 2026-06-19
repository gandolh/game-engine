/**
 * ImmigrationSystem — daily population dynamics.
 *
 * Once per in-game day boundary:
 *   - Consume bread for the current population (1 bread / villager / day).
 *   - foodSurplus = bread produced this day minus consumption (tracked via the
 *     stockpile delta since the last day boundary).
 *   - If bread is in surplus AND there are open worker slots, spawn one
 *     immigrant villager (using rng.fork("immigration")).
 *   - If bread was in deficit for 3 consecutive days, remove one villager.
 *   - gameOver becomes true when population hits 0 (after having had any).
 *
 * Stage: "population" (after villagers).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import type { SimState } from "../sim-state";
import { pushEvent } from "../sim-state";
import type { Rng } from "@engine/core";

export class ImmigrationSystem implements System {
  readonly name = "ImmigrationSystem";

  private lastDay = -1;
  private hadPopulation = false;
  private readonly rng: Rng;

  constructor(private readonly state: SimState) {
    this.rng = state.rng.fork("immigration");
  }

  run(ctx: SimContext): void {
    const state = this.state;
    if (state.day === this.lastDay) return;
    const firstDay = this.lastDay === -1;
    this.lastDay = state.day;
    if (firstDay) {
      // Establish baseline; no consumption on the very first observed day.
      state.lastDayBreadStart = state.stockpiles.bread;
      return;
    }

    // Bread produced since last day boundary (before consumption).
    const breadNow = state.stockpiles.bread;

    // Consume bread for the population.
    const consumption = state.population;
    const afterConsumption = breadNow - consumption;
    if (afterConsumption >= 0) {
      state.stockpiles.bread = afterConsumption;
    } else {
      state.stockpiles.bread = 0;
    }
    state.foodSurplus = breadNow - state.lastDayBreadStart - consumption;

    // --- Open worker slots across all buildings ---
    let openSlots = 0;
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      openSlots += Math.max(0, def.workerSlots - rs.workerCount);
    }

    const surplus = state.foodSurplus > 0;

    if (surplus && openSlots > 0 && state.population < state.popCap) {
      this.spawnVillager();
      state.hungerDays = 0;
    } else if (state.foodSurplus < 0) {
      state.hungerDays++;
      if (state.hungerDays >= 3) {
        this.removeVillager();
        state.hungerDays = 0;
      }
    } else {
      state.hungerDays = 0;
    }

    state.lastDayBreadStart = state.stockpiles.bread;

    if (state.population > 0) this.hadPopulation = true;

    // Game over only once a town that existed dies out completely.
    if (this.hadPopulation && state.population === 0 && !state.gameOver) {
      state.gameOver = true;
      pushEvent(state, `Day ${state.day}: the town has died out.`);
    }

    void ctx;
  }

  private spawnVillager(): void {
    const state = this.state;
    // Use rng to keep a deterministic decision hook even though placement is fixed.
    this.rng.nextU32();
    const home = this.firstHousing();
    const id = state.nextVillagerId++;
    const v: VillagerComponent = {
      id,
      homeX: home.x,
      homeY: home.y,
      workX: home.x,
      workY: home.y,
      storeX: home.x,
      storeY: home.y,
      fsm: "idle",
      pathX: [],
      pathY: [],
      pathStep: 0,
      carryGood: null,
      carryAmount: 0,
      ticksAtWork: 0,
    };
    state.villagerWorld.spawn({ villager: v });
    state.population++;
    pushEvent(state, `Day ${state.day}: an immigrant arrived (pop ${state.population}).`);
  }

  private removeVillager(): void {
    const state = this.state;
    // Remove the highest-id villager (deterministic), freeing its worker slot.
    let victim: { id: number; entity: { villager: VillagerComponent; id?: number } } | null = null;
    for (const entity of state.villagerWorld.query("villager")) {
      const vid = entity.villager.id;
      if (victim === null || vid > victim.id) victim = { id: vid, entity };
    }
    if (victim === null) return;
    const v = victim.entity.villager;
    // Free worker slot if assigned.
    const wb = this.buildingIdAt(v.workX, v.workY);
    if (wb !== null) {
      const rs = state.buildingState.get(wb);
      if (rs !== undefined && rs.workerCount > 0) rs.workerCount--;
    }
    state.villagerWorld.despawn(victim.entity);
    state.population = Math.max(0, state.population - 1);
    pushEvent(state, `Day ${state.day}: a villager starved (pop ${state.population}).`);
  }

  private buildingIdAt(tx: number, ty: number): number | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) {
        return entity.id ?? null;
      }
    }
    return null;
  }

  /** First house center, else map center. */
  private firstHousing(): { x: number; y: number } {
    for (const entity of this.state.buildingWorld.query("building")) {
      const def = getProductionDef(entity.building.type);
      if (def?.isHousing === true) {
        const b = entity.building;
        return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
      }
    }
    return { x: Math.floor(this.state.width / 2), y: Math.floor(this.state.height / 2) };
  }
}
