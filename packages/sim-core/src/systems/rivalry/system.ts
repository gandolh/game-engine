

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  RIVAL_CUTOFF,
  RIVAL_REARM,
  ALLIANCE_TRUST_THRESHOLD,
  pairKey,
  directedKey,
  type ActiveRivalry,
  type ActiveAlliance,
  type FreshRivalry,
} from "./types";

export class RivalrySystem implements System {
  readonly name = "RivalrySystem";

  private readonly latchedRivalKeys = new Set<string>();

  private readonly announcedAllianceKeys = new Set<string>();

  private readonly freshThisTick: FreshRivalry[] = [];

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    this.freshThisTick.length = 0;
    const farmers = this.sortedFarmers();
    this.detectRivalries(farmers);
    this.detectNewAlliances(farmers);
  }

  private detectRivalries(farmers: ReadonlyArray<{ id: number; entity: GameEntity }>): void {
    for (const from of farmers) {
      for (const to of farmers) {
        if (from.id === to.id) continue;
        const trust = from.entity.trust?.byId.get(to.id) ?? 0.5;
        const key = directedKey(from.id, to.id);
        if (trust < RIVAL_CUTOFF) {
          if (!this.latchedRivalKeys.has(key)) {
            this.latchedRivalKeys.add(key);
            this.freshThisTick.push({ aId: from.id, bId: to.id, score: trust, kind: "rivalry" });
          }
        } else if (trust > RIVAL_REARM) {

          this.latchedRivalKeys.delete(key);
        }

      }
    }
  }

  private detectNewAlliances(farmers: ReadonlyArray<{ id: number; entity: GameEntity }>): void {
    for (let i = 0; i < farmers.length; i++) {
      for (let j = i + 1; j < farmers.length; j++) {
        const fa = farmers[i]!;
        const fb = farmers[j]!;
        const key = pairKey(fa.id, fb.id);
        if (this.announcedAllianceKeys.has(key)) continue;
        const trustAtoB = fa.entity.trust?.byId.get(fb.id) ?? 0.5;
        const trustBtoA = fb.entity.trust?.byId.get(fa.id) ?? 0.5;
        if (trustAtoB >= ALLIANCE_TRUST_THRESHOLD && trustBtoA >= ALLIANCE_TRUST_THRESHOLD) {
          this.announcedAllianceKeys.add(key);
          const loId = fa.id < fb.id ? fa.id : fb.id;
          const hiId = fa.id < fb.id ? fb.id : fa.id;
          this.freshThisTick.push({ aId: loId, bId: hiId, score: 0, kind: "alliance" });
        }
      }
    }
  }

  private sortedFarmers(): Array<{ id: number; entity: GameEntity }> {
    const farmers: Array<{ id: number; entity: GameEntity }> = [];
    for (const f of this.world.query("farmer")) {
      if (f.id !== undefined) farmers.push({ id: f.id, entity: f });
    }
    farmers.sort((a, b) => a.id - b.id);
    return farmers;
  }

  freshlyFormedThisTick(): readonly FreshRivalry[] {
    return this.freshThisTick.slice().sort(compareFresh);
  }

  activeRivalries(): readonly ActiveRivalry[] {
    const farmers = this.sortedFarmers();
    const out: ActiveRivalry[] = [];
    for (const from of farmers) {
      for (const to of farmers) {
        if (from.id === to.id) continue;
        const trust = from.entity.trust?.byId.get(to.id) ?? 0.5;
        if (trust < RIVAL_CUTOFF) {
          out.push({ aId: from.id, bId: to.id, score: trust });
        }
      }
    }
    return out;
  }

  activeAlliances(): readonly ActiveAlliance[] {
    const farmers = this.sortedFarmers();
    const out: ActiveAlliance[] = [];
    for (let i = 0; i < farmers.length; i++) {
      for (let j = i + 1; j < farmers.length; j++) {
        const fa = farmers[i]!;
        const fb = farmers[j]!;
        const trustAtoB = fa.entity.trust?.byId.get(fb.id) ?? 0.5;
        const trustBtoA = fb.entity.trust?.byId.get(fa.id) ?? 0.5;
        if (trustAtoB >= ALLIANCE_TRUST_THRESHOLD && trustBtoA >= ALLIANCE_TRUST_THRESHOLD) {
          const loId = fa.id < fb.id ? fa.id : fb.id;
          const hiId = fa.id < fb.id ? fb.id : fa.id;
          out.push({ aId: loId, bId: hiId });
        }
      }
    }
    return out;
  }

  nameOf(id: number): string {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f.farmer.name;
    }
    return `#${id}`;
  }
}

function compareFresh(a: FreshRivalry, b: FreshRivalry): number {

  const ka = a.kind === "rivalry" ? directedKey(a.aId, a.bId) : pairKey(a.aId, a.bId);
  const kb = b.kind === "rivalry" ? directedKey(b.aId, b.bId) : pairKey(b.aId, b.bId);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
