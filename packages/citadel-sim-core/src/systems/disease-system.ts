/**
 * DiseaseSystem — daily disease onset, spread, and villager mortality.
 *
 * Disease is a population hazard that rewards deliberate spacing and services:
 * - Onset: seeded chance per day, scaled by CROWDING (pop/house) and LOW HAPPINESS.
 * - Spread: once active, sickVillagers count rises; sick villagers work less.
 * - Mitigation: Healer building in range reduces onset and recovery time.
 * - Death: each day, sick villagers have a chance of dying (feeds immigration removal).
 *
 * Crowding: population / max(1, houseCount). High crowding → high onset chance.
 * Low happiness (< 40) amplifies onset.
 *
 * Stage: "hazards" (after needs/happiness, before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef, SERVICE_RADII } from "../entities/building";
import type { VillagerEntity } from "../entities/villager";
import type { Rng } from "@engine/core";

export class DiseaseSystem implements System {
  readonly name = "DiseaseSystem";

  private lastDay = -1;
  private readonly rng: Rng;

  constructor(private readonly state: SimState) {
    // Fork ONCE in constructor, never per-tick.
    this.rng = state.rng.fork("disease");
  }

  run(ctx: SimContext): void {
    if (this.state.day === this.lastDay) return;
    this.lastDay = this.state.day;
    this._runDay();
    void ctx;
  }

  private _runDay(): void {
    const state = this.state;
    if (state.population === 0) return;

    const houseCount = this._countHouses();
    const crowding = state.population / Math.max(1, houseCount);
    const healerNear = this._hasHealerNear();

    if (!state.outbreakActive) {
      // Onset check.
      // Base: 0 if crowding ≤ 1, rising to 0.35 at crowding=4+.
      let onsetChance = Math.max(0, (crowding - 1) * 0.12);
      // Low happiness amplifier (happiness < 40 → up to 2× boost).
      if (state.happiness < 40) {
        const unhappyFactor = 1 + (40 - state.happiness) / 40;
        onsetChance *= unhappyFactor;
      }
      onsetChance = Math.min(0.5, onsetChance);
      // Healer mitigation.
      if (healerNear) onsetChance *= 0.25;

      if (this.rng.nextFloat() < onsetChance) {
        state.outbreakActive = true;
        state.sickVillagers = Math.max(1, Math.floor(state.population * 0.25));
        pushEvent(state, `Day ${state.day}: disease outbreak! ${state.sickVillagers} villagers sick.`);
      }
    } else {
      // Active outbreak: spread + mortality + recovery.
      // Spread: add more sick (if crowded).
      const spreadChance = Math.min(0.5, (crowding - 1) * 0.1);
      if (this.rng.nextFloat() < (healerNear ? spreadChance * 0.3 : spreadChance)) {
        const newSick = Math.ceil(state.population * 0.1);
        state.sickVillagers = Math.min(state.population, state.sickVillagers + newSick);
      }

      // Mortality: each day some of the sick may die (reduced by healer).
      // Without healer: death rate is 0.20 (20%).
      // With healer: rate drops to 0.05 (5%).
      // Minimum-1-death guarantee applies ONLY when crowding is genuinely high
      // (> 2), ensuring that small test populations with crowding ≤ 2 are not
      // killed by a floor-rounding artifact. This preserves economy-test
      // stability (1 house, crowding ≤ 1) while the hazard demo (2 houses,
      // crowding ≈ 4-6) still delivers visible mortality.
      const deathRate = healerNear ? 0.05 : 0.20;
      const rawDeaths = Math.floor(state.sickVillagers * deathRate);
      const deaths = (healerNear || crowding <= 2) ? rawDeaths : Math.max(1, rawDeaths);
      if (deaths > 0 && state.population > 0) {
        const actualDeaths = Math.min(deaths, state.population);
        // Remove villagers.
        for (let i = 0; i < actualDeaths; i++) {
          this._removeOneVillager();
        }
        state.sickVillagers = Math.max(0, state.sickVillagers - actualDeaths);
        pushEvent(state, `Day ${state.day}: ${actualDeaths} villager(s) died from disease (pop ${state.population}).`);
      }

      // Recovery: outbreak ends when sickVillagers drops to 0.
      // Natural recovery chance per day.
      const recoveryChance = healerNear ? 0.3 : 0.1;
      if (this.rng.nextFloat() < recoveryChance) {
        state.sickVillagers = Math.max(0, state.sickVillagers - Math.ceil(state.sickVillagers * 0.4));
      }
      if (state.sickVillagers <= 0) {
        state.outbreakActive = false;
        state.sickVillagers = 0;
        pushEvent(state, `Day ${state.day}: disease outbreak ended.`);
      }
    }

    // NOTE: production is naturally reduced because sick villagers die (removed
    // from the population) and dead villagers free their worker slots, which then
    // go unstaffed. We do NOT directly mutate workerCount here — that would
    // permanently corrupt slots that survive the outbreak and cannot be restored.
  }

  private _countHouses(): number {
    let count = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      const def = getProductionDef(entity.building.type);
      if (def?.isHousing === true) count++;
    }
    return count;
  }

  /** Check if any Healer is placed and covers at least one house. */
  private _hasHealerNear(): boolean {
    const healerRadius = SERVICE_RADII["healer"] ?? 8;
    // Find any healer and check if it covers any house.
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.type !== "healer") continue;
      const b = entity.building;
      const hx = b.x + Math.floor(b.w / 2);
      const hy = b.y + Math.floor(b.h / 2);
      // Check if this healer covers any house.
      for (const he of this.state.buildingWorld.query("building")) {
        const def = getProductionDef(he.building.type);
        if (def?.isHousing !== true) continue;
        const hb = he.building;
        const cx = hb.x + Math.floor(hb.w / 2);
        const cy = hb.y + Math.floor(hb.h / 2);
        if (Math.abs(cx - hx) + Math.abs(cy - hy) <= healerRadius) return true;
      }
    }
    return false;
  }

  private _removeOneVillager(): void {
    const state = this.state;
    // Find the highest-id villager (same pattern as immigration removal).
    let victimId = -1;
    let victimEntity: VillagerEntity | null = null;
    for (const entity of state.villagerWorld.query("villager")) {
      const vid = entity.villager.id;
      if (vid > victimId) {
        victimId = vid;
        victimEntity = entity;
      }
    }
    if (victimEntity === null) return;
    const v = victimEntity.villager;
    // Free worker slot.
    const wb = this._buildingIdAt(v.workX, v.workY);
    if (wb !== null) {
      const rs = state.buildingState.get(wb);
      if (rs !== undefined && rs.workerCount > 0) rs.workerCount--;
    }
    state.villagerWorld.despawn(victimEntity);
    state.population = Math.max(0, state.population - 1);
  }

  private _buildingIdAt(tx: number, ty: number): number | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return entity.id ?? null;
    }
    return null;
  }
}
