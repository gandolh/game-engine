/**
 * DiseaseSystem — daily disease onset, spread, and villager mortality.
 *
 * Disease is a population hazard that rewards deliberate spacing and services:
 * - Onset: seeded chance per day, scaled by CROWDING (pop/house) and LOW HAPPINESS.
 * - Spread: once active, sickVillagers count rises; sick villagers work less.
 * - Mitigation: Healer building in range reduces onset and recovery time.
 * - Death: each day, sick villagers have a chance of dying (feeds immigration removal).
 *
 * Citadel 28: per-player hazard — each player's crowding/happiness drives its own
 * outbreak over its own population. Solo = 1-player case (byte-identical). One
 * shared "disease" RNG, pulled in stable player-id order.
 *
 * Stage: "hazards" (after needs/happiness, before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef, SERVICE_RADII } from "../entities/building";
import type { VillagerEntity } from "../entities/villager";
import type { Rng } from "@engine/core";
import { createRng } from "@engine/core";

export class DiseaseSystem implements System {
  readonly name = "DiseaseSystem";

  private lastDay = -1;
  private readonly baseRng: Rng;
  private readonly rivalBase: Rng;
  private readonly perPlayerRng = new Map<number, Rng>();

  constructor(private readonly state: SimState) {
    // Fork the base RNG ONCE in constructor, never per-tick.
    this.baseRng = state.rng.fork("disease");
    // Citadel 33: rival hazard streams from a separate createRng tree (no
    // state.rng consumption → solo byte-identical).
    this.rivalBase = createRng(state.rng.snapshot().seed).fork("disease-rivals");
  }

  /** Citadel 33: per-player hazard RNG (player 0 = legacy stream → solo unchanged). */
  private rngFor(p: PlayerState): Rng {
    let r = this.perPlayerRng.get(p.id);
    if (r === undefined) {
      r = p.id === 0 ? this.baseRng : this.rivalBase.fork(`p${p.id}`);
      this.perPlayerRng.set(p.id, r);
    }
    return r;
  }

  run(ctx: SimContext): void {
    if (this.state.day === this.lastDay) return;
    this.lastDay = this.state.day;
    for (const p of this.state.players) this._runDay(p);
    void ctx;
  }

  private _runDay(p: PlayerState): void {
    const state = this.state;
    if (p.population === 0) return;

    const houseCount = this._countHouses(p);
    const crowding = p.population / Math.max(1, houseCount);
    const healerNear = this._hasHealerNear(p);

    if (!p.outbreakActive) {
      // Onset check.
      let onsetChance = Math.max(0, (crowding - 1) * 0.12);
      if (p.happiness < 40) {
        const unhappyFactor = 1 + (40 - p.happiness) / 40;
        onsetChance *= unhappyFactor;
      }
      onsetChance = Math.min(0.5, onsetChance);
      if (healerNear) onsetChance *= 0.25;

      if (this.rngFor(p).nextFloat() < onsetChance) {
        p.outbreakActive = true;
        p.sickVillagers = Math.max(1, Math.floor(p.population * 0.25));
        pushEvent(state, `Day ${state.day}: disease outbreak! ${p.sickVillagers} villagers sick.`);
      }
    } else {
      // Active outbreak: spread + mortality + recovery.
      const spreadChance = Math.min(0.5, (crowding - 1) * 0.1);
      if (this.rngFor(p).nextFloat() < (healerNear ? spreadChance * 0.3 : spreadChance)) {
        const newSick = Math.ceil(p.population * 0.1);
        p.sickVillagers = Math.min(p.population, p.sickVillagers + newSick);
      }

      const deathRate = healerNear ? 0.05 : 0.20;
      const rawDeaths = Math.floor(p.sickVillagers * deathRate);
      const deaths = (healerNear || crowding <= 2) ? rawDeaths : Math.max(1, rawDeaths);
      if (deaths > 0 && p.population > 0) {
        const actualDeaths = Math.min(deaths, p.population);
        for (let i = 0; i < actualDeaths; i++) {
          this._removeOneVillager(p);
        }
        p.sickVillagers = Math.max(0, p.sickVillagers - actualDeaths);
        pushEvent(state, `Day ${state.day}: ${actualDeaths} villager(s) died from disease (pop ${p.population}).`);
      }

      const recoveryChance = healerNear ? 0.3 : 0.1;
      if (this.rngFor(p).nextFloat() < recoveryChance) {
        p.sickVillagers = Math.max(0, p.sickVillagers - Math.ceil(p.sickVillagers * 0.4));
      }
      if (p.sickVillagers <= 0) {
        p.outbreakActive = false;
        p.sickVillagers = 0;
        pushEvent(state, `Day ${state.day}: disease outbreak ended.`);
      }
    }
  }

  private _countHouses(p: PlayerState): number {
    let count = 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const def = getProductionDef(entity.building.type);
      if (def?.isHousing === true) count++;
    }
    return count;
  }

  /** Check if any Healer owned by p covers at least one of p's houses. */
  private _hasHealerNear(p: PlayerState): boolean {
    const healerRadius = SERVICE_RADII["healer"] ?? 8;
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      if (entity.building.type !== "healer") continue;
      const b = entity.building;
      const hx = b.x + Math.floor(b.w / 2);
      const hy = b.y + Math.floor(b.h / 2);
      for (const he of this.state.buildingWorld.query("building")) {
        if (he.building.ownerId !== p.id) continue;
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

  private _removeOneVillager(p: PlayerState): void {
    const state = this.state;
    // Find the highest-id villager owned by p (same pattern as immigration removal).
    let victimId = -1;
    let victimEntity: VillagerEntity | null = null;
    for (const entity of state.villagerWorld.query("villager")) {
      if (entity.villager.ownerId !== p.id) continue;
      const vid = entity.villager.id;
      if (vid > victimId) {
        victimId = vid;
        victimEntity = entity;
      }
    }
    if (victimEntity === null) return;
    const v = victimEntity.villager;
    const wb = this._buildingIdAt(v.workX, v.workY);
    if (wb !== null) {
      const rs = state.buildingState.get(wb);
      if (rs !== undefined && rs.workerCount > 0) rs.workerCount--;
    }
    state.villagerWorld.despawn(victimEntity);
    p.population = Math.max(0, p.population - 1);
  }

  private _buildingIdAt(tx: number, ty: number): number | null {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return entity.id ?? null;
    }
    return null;
  }
}
