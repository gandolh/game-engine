// RivalrySystem — passive, read-only LABELER over the unified trust axis. It no
// longer accumulates adverse events; rivalry/friendship/alliance are derived each
// tick from the directional `trust` map maintained by TrustSystem.
//
// Split from rivalry.ts.
//
// Placement (see sim-bootstrap): runs in the read-only snoop band — after
// TrustSystem (which moves the trust axis) and BEFORE EventFeedSystem so
// EventFeedSystem can read freshlyFormedThisTick() in the same tick. Both come
// after InboxDispatch and before PerceiveSystem.
//
// Labeling (see ./types):
//   - rivalry : DIRECTIONAL — `from`'s trust toward `to` < RIVAL_CUTOFF.
//   - alliance: undirected mutual trust >= ALLIANCE_TRUST_THRESHOLD.
//
// Hysteresis: a fresh rivalry fires once when a directed pair first drops below
// RIVAL_CUTOFF, then latches. It only re-arms (eligible to fire fresh again) once
// trust climbs back above RIVAL_REARM. Alliances announce once (no un-announce).
//
// Determinism guarantees:
//   - No Date.now / Math.random.
//   - Query iteration order is stable within a run (ECS world insertion-order),
//     and farmer scans are id-sorted.
//   - freshThisTick is sorted by key before being returned.
//   - Same seed → same labels (derived purely from trust, which is deterministic).

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

  /** Directed keys that have fired a fresh-rivalry and are latched (awaiting re-arm). */
  private readonly latchedRivalKeys = new Set<string>();

  /** Alliance pair keys we have already announced (one-shot feed lines). */
  private readonly announcedAllianceKeys = new Set<string>();

  /** Relationships that crossed a boundary THIS tick (sorted on read, rebuilt each tick). */
  private readonly freshThisTick: FreshRivalry[] = [];

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    this.freshThisTick.length = 0;
    const farmers = this.sortedFarmers();
    this.detectRivalries(farmers);
    this.detectNewAlliances(farmers);
  }

  /** Directional: for each ordered (from, to), read from→to trust and label/latch. */
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
          // Recovered past the re-arm mark → eligible to fire fresh again later.
          this.latchedRivalKeys.delete(key);
        }
        // In the hysteresis band [RIVAL_CUTOFF, RIVAL_REARM]: hold the latch as-is.
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

  /** All currently-active directional rivalries (from→to trust < RIVAL_CUTOFF). */
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
  // Group rivalries (directed key) and alliances (undirected key) by their string key.
  const ka = a.kind === "rivalry" ? directedKey(a.aId, a.bId) : pairKey(a.aId, a.bId);
  const kb = b.kind === "rivalry" ? directedKey(b.aId, b.bId) : pairKey(b.aId, b.bId);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
