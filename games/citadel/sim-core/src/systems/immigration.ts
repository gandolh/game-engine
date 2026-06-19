/**
 * ImmigrationSystem — daily population dynamics.
 *
 * Once per in-game day boundary, FOR EACH PLAYER (Citadel 28):
 *   - Consume bread for the player's population (1 bread / villager / day).
 *   - foodSurplus = bread in the player's stockpile this day minus consumption.
 *   - BOOTSTRAP: if the player's pop=0 and they have connected worker slots,
 *     spawn the first pioneer villager unconditionally.
 *   - If bread is in surplus AND there are open worker slots, spawn one immigrant.
 *   - If bread was in deficit for 3 consecutive days, remove one villager.
 *   - The player's gameOver becomes true when its population hits 0 (after >0).
 *
 * Single-player is the 1-player case → byte-identical. The day-boundary guard +
 * founding-window anchor are shared (the clock is shared); per-player "had pop"
 * and "tithed once" flags are tracked by player id. One immigration RNG fork,
 * pulled in stable player-id order, keeps solo replays identical.
 *
 * Stage: "population" (after villagers).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import type { Rng } from "@engine/core";
import type { GoodType } from "../entities/building";

/** Citadel 09: fraction of each stored good siphoned to the relief reserve per day under the tithe. */
const TITHE_SIPHON_RATE = 0.1;

export class ImmigrationSystem implements System {
  readonly name = "ImmigrationSystem";

  private lastDay = -1;
  private startDay = -1;
  private readonly hadPopulation = new Set<number>(); // player ids that have had >0 pop
  private readonly tithedOnce = new Set<number>();     // player ids that fired the tithe event
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
      for (const p of state.players) p.lastDayBreadStart = p.stockpiles.bread;
      return;
    }

    // Per-player day processing in stable id order (determinism).
    for (const p of state.players) this._runDayFor(p);

    void ctx;
  }

  private _runDayFor(p: PlayerState): void {
    const state = this.state;

    // Citadel 09 — TITHE: before consumption, siphon a small % (10%, floored)
    // of every stored good from the player's pool into its relief reserve.
    if (p.activeDecrees.has("tithe")) {
      let siphonedAny = false;
      for (const good of Object.keys(p.stockpiles) as GoodType[]) {
        const take = Math.floor(p.stockpiles[good] * TITHE_SIPHON_RATE);
        if (take <= 0) continue;
        p.stockpiles[good] -= take;
        p.reliefReserve[good] += take;
        siphonedAny = true;
      }
      if (siphonedAny && !this.tithedOnce.has(p.id)) {
        this.tithedOnce.add(p.id);
        pushEvent(state, `Day ${state.day}: the tithe fills the relief reserve.`);
      }
    }

    // Bread produced since last day boundary (before consumption).
    const breadNow = p.stockpiles.bread;

    // Consume bread for the population (1 bread/person/day).
    const consumption = p.population;
    // Rationing decree: reduce consumption by 25%
    const actualConsumption = p.activeDecrees.has("rationing")
      ? Math.floor(consumption * 0.75)
      : consumption;
    let afterConsumption = breadNow - actualConsumption;

    // Citadel 09 — TITHE starvation cushion.
    let cushioned = 0;
    if (afterConsumption < 0 && p.reliefReserve.bread > 0) {
      const shortfall = -afterConsumption;
      cushioned = Math.min(shortfall, p.reliefReserve.bread);
      p.reliefReserve.bread -= cushioned;
      afterConsumption += cushioned;
      if (cushioned > 0) {
        pushEvent(state, `Day ${state.day}: relief reserve fed ${cushioned} bread to the hungry.`);
      }
    }

    if (afterConsumption >= 0) {
      p.stockpiles.bread = afterConsumption;
    } else {
      p.stockpiles.bread = 0;
    }
    const rawSurplus = breadNow - p.lastDayBreadStart - actualConsumption;
    p.foodSurplus = cushioned > 0 && afterConsumption >= 0 ? Math.max(0, rawSurplus + cushioned) : rawSurplus;

    // --- Open worker slots across the player's buildings ---
    let openSlots = 0;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      openSlots += Math.max(0, def.workerSlots - rs.workerCount);
    }

    // Founding phase.
    const daysSinceStart = state.day - this.startDay;
    const foundingWindow = daysSinceStart <= Math.floor(state.daysPerYear / 4) + 2;
    const unstaffedTypes = foundingWindow ? this.countUnstaffedProductionTypes(p) : 0;
    const needsFounder = unstaffedTypes > 0 && openSlots > 0 && p.popCap > 0;

    if (needsFounder) {
      this.spawnVillager(p);
      p.stockpiles.bread += 5;
      p.hungerDays = 0;
    } else if (p.foodSurplus > 0 && p.population < p.popCap) {
      const happinessFactor = 0.7 + (p.happiness / 100) * 0.3;
      const immigrationRoll = this.rng.nextFloat();
      if (immigrationRoll < happinessFactor) {
        this.spawnVillager(p);
      }
      p.hungerDays = 0;
    } else if (p.foodSurplus < 0) {
      p.hungerDays++;
      if (p.hungerDays >= 3) {
        this.removeVillager(p);
        p.hungerDays = 0;
      }
    } else if (p.stockpiles.bread === 0 && p.foodSurplus === 0) {
      // Persistent empty bread is still hunger — don't reset the counter.
    } else {
      p.hungerDays = 0;
    }

    // Low happiness: even with food, villagers may leave
    if (p.happiness < 30 && p.population > 0) {
      const departRoll = this.rng.nextFloat();
      if (departRoll < 0.2) {
        this.removeVillager(p);
        pushEvent(state, `Day ${state.day}: a villager left (low morale, pop ${p.population}).`);
      }
    }

    p.lastDayBreadStart = p.stockpiles.bread;

    if (p.population > 0) this.hadPopulation.add(p.id);

    // Game over (for this player) only once a town that existed dies out.
    if (this.hadPopulation.has(p.id) && p.population === 0 && !p.gameOver) {
      p.gameOver = true;
      pushEvent(state, `Day ${state.day}: the town has died out.`);
    }
  }

  private spawnVillager(p: PlayerState): void {
    const state = this.state;
    // Use rng to keep a deterministic decision hook even though placement is fixed.
    this.rng.nextU32();
    const home = this.firstHousing(p);
    const id = state.nextVillagerId++;
    const v: VillagerComponent = {
      id,
      ownerId: p.id,
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
    p.population++;
    pushEvent(state, `Day ${state.day}: an immigrant arrived (pop ${p.population}).`);
  }

  private removeVillager(p: PlayerState): void {
    const state = this.state;
    // Remove the highest-id villager OWNED BY p (deterministic), freeing its slot.
    let victim: { id: number; entity: { villager: VillagerComponent; id?: number } } | null = null;
    for (const entity of state.villagerWorld.query("villager")) {
      if (entity.villager.ownerId !== p.id) continue;
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
    p.population = Math.max(0, p.population - 1);
    pushEvent(state, `Day ${state.day}: a villager starved (pop ${p.population}).`);
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
   * Count how many distinct production building types owned by `p` have at least
   * one connected building with NO assigned worker.
   */
  private countUnstaffedProductionTypes(p: PlayerState): number {
    const state = this.state;
    const staffed = new Set<string>();
    const present = new Set<string>();
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
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

  /** First house center owned by `p`, else map center. */
  private firstHousing(p: PlayerState): { x: number; y: number } {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const def = getProductionDef(entity.building.type);
      if (def?.isHousing === true) {
        const b = entity.building;
        return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
      }
    }
    return { x: Math.floor(this.state.width / 2), y: Math.floor(this.state.height / 2) };
  }
}
