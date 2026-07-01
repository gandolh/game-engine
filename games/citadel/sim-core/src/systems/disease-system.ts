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
import { pushEvent, removeOneVillager } from "../sim-state";
import { getProductionDef, SERVICE_RADII } from "../entities/building";
import { countNonRoadBuildings } from "./tiers";
import type { Rng } from "@engine/core";
import { createRng } from "@engine/core";

export class DiseaseSystem implements System {
  readonly name = "DiseaseSystem";

  private lastDay = -1;
  private readonly baseRng: Rng;
  private readonly rivalBase: Rng;
  private readonly perPlayerRng = new Map<number, Rng>();

  /**
   * Cozy-pivot Phase D threat-demotion flag. When true, disease never kills
   * (mortality block skipped, no removeOneVillager) and outbreaks are
   * guaranteed to recover; when false, behavior is byte-identical to pre-cozy.
   */
  private readonly cozy: boolean;

  /**
   * Cozy cold-open threat-defer (Chunk 2). When > 0, disease ONSET is suppressed
   * for a player until they own at least this many non-road buildings. 0 (default)
   * = disabled = today's exact behavior; the gate short-circuits BEFORE the onset
   * RNG draw so no RNG is consumed while deferred (an already-active outbreak still
   * progresses/recovers normally).
   */
  private readonly deferUntilBuildings: number;

  constructor(private readonly state: SimState, opts: { cozy?: boolean; deferUntilBuildings?: number } = {}) {
    this.cozy = opts.cozy ?? true;
    this.deferUntilBuildings = opts.deferUntilBuildings ?? 0;
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
      // Cozy cold-open: hold off disease ONSET until the town has grown past its
      // seeded core. Short-circuit BEFORE the onset RNG draw below so no RNG is
      // consumed while deferred (disabled when the threshold is 0 → byte-identical).
      if (this.deferUntilBuildings > 0 && countNonRoadBuildings(state, p.id) < this.deferUntilBuildings) {
        return;
      }
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
        // Cozy: an outbreak is a recoverable slowdown (no mortality, guaranteed
        // recovery below) — the toast reads "under the weather", not an "outbreak"
        // (decisions #3/#5/#9). Sharp string kept verbatim under cozy=false; the
        // Challenge-mode guard matches "disease outbreak" (defer-threats.test.ts).
        pushEvent(state, this.cozy
          ? `Day ${state.day}: ${p.sickVillagers} villager(s) are under the weather.`
          : `Day ${state.day}: disease outbreak! ${p.sickVillagers} villagers sick.`);
      }
    } else {
      // Active outbreak: spread (shared), then mortality + recovery — branched on cozy.
      const spreadChance = Math.min(0.5, (crowding - 1) * 0.1);
      if (this.rngFor(p).nextFloat() < (healerNear ? spreadChance * 0.3 : spreadChance)) {
        const newSick = Math.ceil(p.population * 0.1);
        p.sickVillagers = Math.min(p.population, p.sickVillagers + newSick);
      }

      if (!this.cozy) {
        // Frozen legacy path: disease can kill. Byte-identical to pre-cozy behavior.
        const deathRate = healerNear ? 0.05 : 0.20;
        const rawDeaths = Math.floor(p.sickVillagers * deathRate);
        const deaths = (healerNear || crowding <= 2) ? rawDeaths : Math.max(1, rawDeaths);
        if (deaths > 0 && p.population > 0) {
          const actualDeaths = Math.min(deaths, p.population);
          for (let i = 0; i < actualDeaths; i++) {
            if (!removeOneVillager(this.state, p)) break;
          }
          p.sickVillagers = Math.max(0, p.sickVillagers - actualDeaths);
          pushEvent(state, `Day ${state.day}: ${actualDeaths} villager(s) died from disease (pop ${p.population}).`);
        }

        const recoveryChance = healerNear ? 0.3 : 0.1;
        if (this.rngFor(p).nextFloat() < recoveryChance) {
          p.sickVillagers = Math.max(0, p.sickVillagers - Math.ceil(p.sickVillagers * 0.4));
        }
      } else {
        // Cozy: disease is a recoverable slowdown, never a killer — no mortality block,
        // no removeOneVillager call. Sick villagers "under the weather" still throttle
        // production elsewhere (via sickVillagers count); here we just guarantee recovery.
        // Small deterministic happiness dip while the outbreak drags on — the town
        // visibly slows (Phase B productivity floor) and eases back once it ends.
        p.happiness = Math.max(0, p.happiness - 1);

        // Chance-based recovery (healer makes it faster), same shape as before...
        const recoveryChance = healerNear ? 0.3 : 0.1;
        if (this.rngFor(p).nextFloat() < recoveryChance) {
          p.sickVillagers = Math.max(0, p.sickVillagers - Math.ceil(p.sickVillagers * 0.4));
        }
        // ...plus a guaranteed integer floor so the outbreak can never stall forever,
        // even on a healer-less unlucky rng streak: always shed at least 1/day.
        const guaranteedFloor = Math.max(1, Math.ceil(p.sickVillagers * 0.05));
        p.sickVillagers = Math.max(0, p.sickVillagers - guaranteedFloor);
      }

      if (p.sickVillagers <= 0) {
        p.outbreakActive = false;
        p.sickVillagers = 0;
        pushEvent(state, this.cozy
          ? `Day ${state.day}: the town is back on its feet.`
          : `Day ${state.day}: disease outbreak ended.`);
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

}
