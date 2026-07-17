/**
 * HollowTrustAccrualSystem — the BASELINE trust mechanism this chunk owns
 * (explicit social verbs — gift/steal/betray/rumor — are hollow-06's job and
 * will nudge the same ledger via `applyRelationshipDelta` later). Two
 * sources of accrual, both mild and tunable (community/constants.ts):
 *
 *  1. Proximity — every pair of agents standing on the exact SAME tile this
 *     tick gets a small mutual trust nudge in both directions.
 *  2. Shared activity — every pair of agents whose current top intention
 *     targets the SAME resource node this tick gets an additional nudge
 *     (stacks with proximity if they're also co-located) — this captures
 *     "working the same resource node" even before they've physically
 *     arrived on the same tile.
 *
 * Every KNOWN ledger entry also decays toward `UNIT_TRUST_SCALE.neutral`
 * each tick, BEFORE this tick's accrual — see constants.ts's
 * `TRUST_DECAY_TOWARD_NEUTRAL_RATE` doc for why that ordering is the
 * "decays toward neutral over time/distance" half of the brief's rule.
 *
 * Runs in its own "TRUST-ACCRUAL" stage, right after ACT (sim-bootstrap.ts)
 * — proximity/shared-activity are only knowable once this tick's movement
 * has happened, and `HollowCommunitySystem` (next stage) needs the ledger
 * already updated with this tick's accrual before it reads the trust graph.
 *
 * Determinism: agent ids are always sorted ascending before any pairing or
 * grouping — ids are collected into plain arrays and explicitly `.sort()`ed
 * rather than trusting `World.query`'s (currently spawn-order-matching, but
 * not contractually guaranteed) iteration order, or any Map's insertion
 * order used only for O(1) lookups.
 */
import type { SimContext, System, World } from "@engine/core";
import { applyRelationshipDelta, UNIT_TRUST_SCALE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import {
  TRUST_PROXIMITY_DELTA,
  TRUST_SHARED_NODE_DELTA,
  TRUST_DECAY_TOWARD_NEUTRAL_RATE,
  TRUST_CLEANUP_EPSILON,
} from "./constants";

export interface TrustAccrualSystemOptions {
  proximityDelta?: number;
  sharedNodeDelta?: number;
  decayRate?: number;
}

type TrustEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
  intentions: NonNullable<HollowEntity["intentions"]>;
};

export class HollowTrustAccrualSystem implements System {
  readonly name = "HollowTrustAccrualSystem";
  private readonly proximityDelta: number;
  private readonly sharedNodeDelta: number;
  private readonly decayRate: number;

  constructor(
    private readonly world: World<HollowEntity>,
    opts: TrustAccrualSystemOptions = {},
  ) {
    this.proximityDelta = opts.proximityDelta ?? TRUST_PROXIMITY_DELTA;
    this.sharedNodeDelta = opts.sharedNodeDelta ?? TRUST_SHARED_NODE_DELTA;
    this.decayRate = opts.decayRate ?? TRUST_DECAY_TOWARD_NEUTRAL_RATE;
  }

  run(_ctx: SimContext): void {
    const entities: TrustEntity[] = [];
    for (const e of this.world.query("agent", "relationships", "intentions")) {
      entities.push(e as TrustEntity);
    }
    entities.sort((a, b) => a.id - b.id);
    const byId = new Map<number, TrustEntity>();
    for (const e of entities) byId.set(e.id, e);

    this.decayAll(entities);
    this.accrueProximity(entities, byId);
    this.accrueSharedActivity(entities, byId);
  }

  private decayAll(entities: readonly TrustEntity[]): void {
    const neutral = UNIT_TRUST_SCALE.neutral;
    for (const e of entities) {
      for (const [peerId, score] of e.relationships.byId) {
        const next = score + (neutral - score) * this.decayRate;
        if (Math.abs(next - neutral) < TRUST_CLEANUP_EPSILON) {
          e.relationships.byId.delete(peerId);
        } else {
          e.relationships.byId.set(peerId, next);
        }
      }
    }
  }

  private accrueProximity(entities: readonly TrustEntity[], byId: Map<number, TrustEntity>): void {
    const byTile = new Map<string, number[]>();
    for (const e of entities) {
      const key = `${e.agent.gx},${e.agent.gy}`;
      let bucket = byTile.get(key);
      if (!bucket) {
        bucket = [];
        byTile.set(key, bucket);
      }
      bucket.push(e.id);
    }
    for (const tileKey of [...byTile.keys()].sort()) {
      this.accrueGroup(byTile.get(tileKey)!, byId, this.proximityDelta);
    }
  }

  private accrueSharedActivity(entities: readonly TrustEntity[], byId: Map<number, TrustEntity>): void {
    const byNode = new Map<number, number[]>();
    for (const e of entities) {
      const intention = e.intentions.queue[0];
      if (!intention) continue;
      if (intention.kind !== "seek_food" && intention.kind !== "work") continue;
      const nodeId = intention.data.nodeId as number | undefined;
      if (nodeId === undefined) continue;
      let bucket = byNode.get(nodeId);
      if (!bucket) {
        bucket = [];
        byNode.set(nodeId, bucket);
      }
      bucket.push(e.id);
    }
    for (const nodeId of [...byNode.keys()].sort((a, b) => a - b)) {
      this.accrueGroup(byNode.get(nodeId)!, byId, this.sharedNodeDelta);
    }
  }

  /** Applies `delta` symmetrically to every pair within `ids` (sorted
   *  ascending before pairing). */
  private accrueGroup(ids: readonly number[], byId: Map<number, TrustEntity>, delta: number): void {
    if (ids.length < 2) return;
    const sorted = [...ids].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = byId.get(sorted[i]!)!;
        const b = byId.get(sorted[j]!)!;
        applyRelationshipDelta(a.relationships, b.id, delta);
        applyRelationshipDelta(b.relationships, a.id, delta);
      }
    }
  }
}
