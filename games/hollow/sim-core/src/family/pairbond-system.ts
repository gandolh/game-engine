/**
 * HollowPairBondSystem — chunk hollow-05's pair-bonding pass. Every tick,
 * greedily bonds eligible ADULT, currently-unbonded agent pairs into new
 * households. Eligibility (ALL required):
 *   - both `lifecycle.stage === "adult"`;
 *   - both `householdId == null` (unbonded — v1 is one partner at a time);
 *   - not close kin (`lineage.areCloseKin` — shared parent or parent/child);
 *   - mutual trust >= `trustThreshold` in BOTH directions
 *     (`relationshipScore`, engine's UNIT_TRUST_SCALE);
 *   - trait-compatibility >= `compatThreshold` (a deterministic metric over
 *     a fixed subset of behavior genes — see `traitCompatibility` below);
 *   - within `proximityTiles` (Chebyshev distance) of each other right now.
 *
 * Deterministic pairing: candidates are sorted ascending by id; for each
 * unbonded `a` (in that order) we scan `b` candidates after it (also
 * ascending) and bond the FIRST eligible match, then move on — so the
 * result depends only on the (already-deterministic) trust ledger, genomes,
 * and positions, never on iteration/Map order. No `Rng` is used or needed
 * here: eligibility is a pure boolean function of already-deterministic
 * state, so there is no genuine coin-flip to fork for (mirrors
 * `community/registry.ts`'s id-assignment rationale).
 *
 * Runs in its own "PAIRBOND" stage, after BELONGING (so it reads this
 * tick's up-to-date trust/community state) and before REPRODUCTION (a
 * household must exist before it can roll for a birth) — see
 * sim-bootstrap.ts's scheduler-order comment.
 */
import type { SimContext, System, World, MessageBus } from "@engine/core";
import { PERFORMATIVE, relationshipScore } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { ONT_FAMILY, type FamilyBondedBody } from "../protocols";
import type { HouseholdRegistry } from "./registry";
import type { LineageRegistry } from "../lineage";
import {
  PAIRBOND_TRUST_THRESHOLD,
  PAIRBOND_COMPAT_THRESHOLD,
  PAIRBOND_PROXIMITY_TILES,
  PAIRBOND_COMPAT_GENES,
} from "./constants";

export interface PairBondSystemOptions {
  trustThreshold?: number;
  compatThreshold?: number;
  proximityTiles?: number;
}

type PairBondEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  lifecycle: NonNullable<HollowEntity["lifecycle"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
  genome: NonNullable<HollowEntity["genome"]>;
  householdId: number | null;
};

export class HollowPairBondSystem implements System {
  readonly name = "HollowPairBondSystem";
  private readonly trustThreshold: number;
  private readonly compatThreshold: number;
  private readonly proximityTiles: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    private readonly households: HouseholdRegistry,
    private readonly lineage: LineageRegistry,
    opts: PairBondSystemOptions = {},
  ) {
    this.trustThreshold = opts.trustThreshold ?? PAIRBOND_TRUST_THRESHOLD;
    this.compatThreshold = opts.compatThreshold ?? PAIRBOND_COMPAT_THRESHOLD;
    this.proximityTiles = opts.proximityTiles ?? PAIRBOND_PROXIMITY_TILES;
  }

  run(ctx: SimContext): void {
    const candidates: PairBondEntity[] = [];
    for (const e of this.world.query("agent", "lifecycle", "relationships", "genome", "householdId")) {
      const entity = e as PairBondEntity;
      if (entity.lifecycle.stage === "adult" && entity.householdId == null) {
        candidates.push(entity);
      }
    }
    candidates.sort((a, b) => a.id - b.id);

    const bonded = new Set<number>();
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i]!;
      if (bonded.has(a.id)) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j]!;
        if (bonded.has(b.id)) continue;
        if (!this.eligible(a, b)) continue;

        const household = this.households.form(a.id, b.id, ctx.tick);
        a.householdId = household.id;
        b.householdId = household.id;
        bonded.add(a.id);
        bonded.add(b.id);

        const body: FamilyBondedBody = {
          householdId: household.id,
          partnerAId: household.partnerA,
          partnerBId: household.partnerB,
          tick: ctx.tick,
        };
        this.emit(ONT_FAMILY.BONDED, body as unknown as Record<string, unknown>, ctx.tick);
        break;
      }
    }
  }

  private eligible(a: PairBondEntity, b: PairBondEntity): boolean {
    if (this.lineage.areCloseKin(a.id, b.id)) return false;
    if (!this.withinProximity(a, b)) return false;
    const trustAB = relationshipScore(a.relationships, b.id);
    const trustBA = relationshipScore(b.relationships, a.id);
    if (trustAB < this.trustThreshold || trustBA < this.trustThreshold) return false;
    if (this.traitCompatibility(a, b) < this.compatThreshold) return false;
    return true;
  }

  private withinProximity(a: PairBondEntity, b: PairBondEntity): boolean {
    const dx = Math.abs(a.agent.gx - b.agent.gx);
    const dy = Math.abs(a.agent.gy - b.agent.gy);
    return Math.max(dx, dy) <= this.proximityTiles;
  }

  /** 1 - normalized L1 distance over a fixed subset of behavior genes
   *  (`PAIRBOND_COMPAT_GENES`, family/constants.ts) — a deterministic,
   *  symmetric [0,1] compatibility score (1 = identical on those genes).
   *  Each gene lives in [0,1] (components/genome.ts), so the per-gene L1
   *  distance is already in [0,1] and the mean over the subset needs no
   *  further normalization. */
  private traitCompatibility(a: PairBondEntity, b: PairBondEntity): number {
    let sum = 0;
    for (const gene of PAIRBOND_COMPAT_GENES) {
      const va = a.genome.behavior[gene] ?? 0;
      const vb = b.genome.behavior[gene] ?? 0;
      sum += Math.abs(va - vb);
    }
    const meanDistance = sum / PAIRBOND_COMPAT_GENES.length;
    return 1 - meanDistance;
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      { performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body },
      tick,
    );
  }
}
