/**
 * ImmigrationSystem — daily population dynamics.
 *
 * Once per in-game day boundary:
 *   - Consume bread for the current population (1 bread / villager / day).
 *   - foodSurplus = bread in stockpile this day minus consumption since last
 *     day boundary.
 *   - BOOTSTRAP: if pop=0 and there are connected worker slots, spawn the
 *     first pioneer villager unconditionally (settlers arrive when there is
 *     work to do, regardless of food).
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
import type { GoodType } from "../entities/building";

/** Citadel 09: fraction of each stored good siphoned to the relief reserve per day under the tithe. */
const TITHE_SIPHON_RATE = 0.1;

export class ImmigrationSystem implements System {
  readonly name = "ImmigrationSystem";

  private lastDay = -1;
  private startDay = -1;
  private hadPopulation = false;
  private tithedOnce = false;
  private readonly rng: Rng;

  constructor(private readonly state: SimState) {
    this.rng = state.rng.fork("immigration");
  }

  run(ctx: SimContext): void {
    const state = this.state;
    if (state.day === this.lastDay) return;
    const firstDay = this.lastDay === -1;
    if (firstDay) this.startDay = state.day;
    this.lastDay = state.day;
    if (firstDay) {
      // Establish baseline; no consumption on the very first observed day.
      state.lastDayBreadStart = state.stockpiles.bread;
      return;
    }

    // Citadel 09 — TITHE: before consumption, siphon a small % (10%, floored)
    // of every stored good from the global pool into the relief reserve. This
    // is a real cost (the global pool shrinks). The reserve later cushions
    // starvation and improves barter terms. Pure integer arithmetic — no rng.
    if (state.activeDecrees.has("tithe")) {
      let siphonedAny = false;
      for (const good of Object.keys(state.stockpiles) as GoodType[]) {
        const take = Math.floor(state.stockpiles[good] * TITHE_SIPHON_RATE);
        if (take <= 0) continue;
        state.stockpiles[good] -= take;
        state.reliefReserve[good] += take;
        siphonedAny = true;
      }
      if (siphonedAny && !this.tithedOnce) {
        this.tithedOnce = true;
        pushEvent(state, `Day ${state.day}: the tithe fills the relief reserve.`);
      }
    }

    // Bread produced since last day boundary (before consumption).
    const breadNow = state.stockpiles.bread;

    // Consume bread for the population (1 bread/person/day).
    const consumption = state.population;
    // Rationing decree: reduce consumption by 25%
    const actualConsumption = state.activeDecrees.has("rationing")
      ? Math.floor(consumption * 0.75)
      : consumption;
    let afterConsumption = breadNow - actualConsumption;

    // Citadel 09 — TITHE starvation cushion: if the day's bread can't feed the
    // population, draw the shortfall from the relief reserve's bread before the
    // population suffers. Deterministic pure arithmetic.
    let cushioned = 0;
    if (afterConsumption < 0 && state.reliefReserve.bread > 0) {
      const shortfall = -afterConsumption;
      cushioned = Math.min(shortfall, state.reliefReserve.bread);
      state.reliefReserve.bread -= cushioned;
      afterConsumption += cushioned;
      if (cushioned > 0) {
        pushEvent(state, `Day ${state.day}: relief reserve fed ${cushioned} bread to the hungry.`);
      }
    }

    if (afterConsumption >= 0) {
      state.stockpiles.bread = afterConsumption;
    } else {
      state.stockpiles.bread = 0;
    }
    const rawSurplus = breadNow - state.lastDayBreadStart - actualConsumption;
    // foodSurplus drives the starvation path (deficit when < 0). The reserve
    // cushion feeds the hungry, so a day whose deficit was fully absorbed
    // (post-cushion afterConsumption >= 0) is treated as break-even, never a
    // starvation day. With no tithe, cushioned is 0 and afterConsumption keeps
    // its original sign — so this reduces exactly to the original formula.
    state.foodSurplus = cushioned > 0 && afterConsumption >= 0 ? Math.max(0, rawSurplus + cushioned) : rawSurplus;

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

    // Founding phase: during the first (daysPerYear/4 + 2) days since sim start,
    // spawn one pioneer per production building type to seed the chain. Founders
    // bring bread rations. After the founding window closes, no more founders —
    // starvation-driven departures are permanent until food is restored.
    const daysSinceStart = state.day - this.startDay;
    const foundingWindow = daysSinceStart <= Math.floor(state.daysPerYear / 4) + 2;
    const unstaffedTypes = foundingWindow ? this.countUnstaffedProductionTypes() : 0;
    const needsFounder = unstaffedTypes > 0 && openSlots > 0 && state.popCap > 0;

    if (needsFounder) {
      // Spawn a founder regardless of food supply — one per unstaffed type, max 1/day.
      // Each founder arrives with a small bread ration to sustain themselves
      // while the production chain gets established.
      this.spawnVillager();
      state.stockpiles.bread += 5;
      state.hungerDays = 0;
    } else if (state.foodSurplus > 0 && state.population < state.popCap) {
      // High happiness boosts immigration probability; low happiness suppresses it.
      // Formula: 0.7 + happiness * 0.3 / 100 ensures ~0.82 at base happiness=40,
      // 0.7 at minimum, 1.0 at maximum — reliably recovers from starvation dips
      // while still making happiness meaningfully affect immigration rate.
      const happinessFactor = 0.7 + (state.happiness / 100) * 0.3;
      const immigrationRoll = this.rng.nextFloat();
      if (immigrationRoll < happinessFactor) {
        this.spawnVillager();
      }
      state.hungerDays = 0;
    } else if (state.foodSurplus < 0) {
      state.hungerDays++;
      if (state.hungerDays >= 3) {
        this.removeVillager();
        state.hungerDays = 0;
      }
    } else if (state.stockpiles.bread === 0 && state.foodSurplus === 0) {
      // Bread stockpile is empty even though surplus is technically 0
      // (production exactly matched consumption). Persistent empty bread is
      // still hunger — don't reset the counter.
    } else {
      state.hungerDays = 0;
    }

    // Low happiness: even with food, villagers may leave
    if (state.happiness < 30 && state.population > 0) {
      const departRoll = this.rng.nextFloat();
      if (departRoll < 0.2) {
        this.removeVillager();
        pushEvent(state, `Day ${state.day}: a villager left (low morale, pop ${state.population}).`);
      }
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

  /**
   * Count how many distinct production building types have at least one
   * connected building with NO assigned worker. Used for founding-phase
   * bootstrapping so every building type gets its first worker.
   */
  private countUnstaffedProductionTypes(): number {
    const state = this.state;
    const staffed = new Set<string>();
    const present = new Set<string>();
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      present.add(entity.building.type);
      if (rs.workerCount > 0) staffed.add(entity.building.type);
    }
    let unstaffed = 0;
    for (const t of present) {
      if (!staffed.has(t)) unstaffed++;
    }
    return unstaffed;
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
