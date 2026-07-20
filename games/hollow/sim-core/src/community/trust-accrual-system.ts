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
 * ── the hearth carve-out (chunk hollow-14c-2, anti-homogenization) ────────
 * Proximity's "1." above has ONE exception: the hearth-tile group (agents
 * co-located at `world/grid.ts`'s `HEARTH_TILE`, which is where chunk
 * hollow-14c's dusk convergence paths most of the town) gets the much
 * smaller `gatheringDelta` instead, but ONLY during the GATHER phase
 * (`world/day-cycle.ts`'s `dayPhase`) — see `constants.ts`'s
 * `TRUST_GATHERING_DELTA` header for the full rationale: unmodified
 * proximity accrual there would homogenize the whole town's trust graph
 * into one mega-community every few gatherings, since dozens of agents
 * genuinely stack on that one tile. Every other tile (including the hearth
 * tile outside GATHER) is unaffected.
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
import { HEARTH_TILE, dayPhase } from "../world";
import {
  TRUST_PROXIMITY_DELTA,
  TRUST_SHARED_NODE_DELTA,
  TRUST_DECAY_TOWARD_NEUTRAL_RATE,
  TRUST_GATHERING_DELTA,
  TRUST_CLEANUP_EPSILON,
} from "./constants";

/** `${gx},${gy}` tile key for `HEARTH_TILE` — computed once, not per tick;
 *  matches `accrueProximity`'s own `byTile` key format exactly. */
const HEARTH_TILE_KEY = `${HEARTH_TILE.gx},${HEARTH_TILE.gy}`;

export interface TrustAccrualSystemOptions {
  proximityDelta?: number;
  sharedNodeDelta?: number;
  decayRate?: number;
  /** The much-smaller delta applied to the hearth-tile group specifically
   *  during the GATHER phase (chunk hollow-14c-2's anti-homogenization
   *  mechanism — see constants.ts's `TRUST_GATHERING_DELTA` header). */
  gatheringDelta?: number;
  /** The run's day length in ticks — needed to compute `dayPhase(ctx.tick,
   *  ticksPerDay)` and detect the GATHER phase (mirrors
   *  `BelongingSystemOptions.ticksPerDay`'s own required shape). */
  ticksPerDay: number;
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
  private readonly gatheringDelta: number;
  private readonly ticksPerDay: number;

  constructor(
    private readonly world: World<HollowEntity>,
    opts: TrustAccrualSystemOptions,
  ) {
    this.proximityDelta = opts.proximityDelta ?? TRUST_PROXIMITY_DELTA;
    this.sharedNodeDelta = opts.sharedNodeDelta ?? TRUST_SHARED_NODE_DELTA;
    this.decayRate = opts.decayRate ?? TRUST_DECAY_TOWARD_NEUTRAL_RATE;
    this.gatheringDelta = opts.gatheringDelta ?? TRUST_GATHERING_DELTA;
    this.ticksPerDay = opts.ticksPerDay;
  }

  run(ctx: SimContext): void {
    const entities: TrustEntity[] = [];
    for (const e of this.world.query("agent", "relationships", "intentions")) {
      entities.push(e as TrustEntity);
    }
    entities.sort((a, b) => a.id - b.id);
    const byId = new Map<number, TrustEntity>();
    for (const e of entities) byId.set(e.id, e);

    const isGatherPhase = dayPhase(ctx.tick, this.ticksPerDay).phase === "gather";

    this.decayAll(entities);
    this.accrueProximity(entities, byId, isGatherPhase);
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

  private accrueProximity(
    entities: readonly TrustEntity[],
    byId: Map<number, TrustEntity>,
    isGatherPhase: boolean,
  ): void {
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
      // hollow-14c-2: the hearth-tile group gets the much smaller
      // `gatheringDelta` during GATHER — see constants.ts's
      // `TRUST_GATHERING_DELTA` header (the anti-homogenization mechanism).
      // Every other tile, and the hearth tile OUTSIDE gather, still gets the
      // normal proximity delta.
      const delta = isGatherPhase && tileKey === HEARTH_TILE_KEY ? this.gatheringDelta : this.proximityDelta;
      this.accrueGroup(byTile.get(tileKey)!, byId, delta);
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
