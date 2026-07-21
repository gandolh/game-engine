/**
 * HollowLifecycleSystem — chunk hollow-05's aging + death pass. Two jobs,
 * in this fixed order every tick:
 *
 *  1. AGE + STAGE — every agent's `lifecycle.ageTicks` advances by 1;
 *     `stage` is recomputed from the configured thresholds (`stageForAge`,
 *     components/lifecycle.ts). A child who just became an adult and is
 *     still resident in a parent's household (i.e. not one of its two
 *     partners) is released from that household — see
 *     `releaseFromChildhoodHousehold` — so it's actually eligible for
 *     `HollowPairBondSystem`'s `householdId == null` gate next tick, rather
 *     than being permanently stuck as a "child resident" forever.
 *
 *  2. DEATH — evaluated in ASCENDING id order (determinism — CLAUDE.md),
 *     one of four causes (chunk hollow-15 added "disease"):
 *       - "starvation": `beliefs.data.foodDepletedTicks` (tracked by
 *         HollowPerceiveSystem, hollow-03) has held at/above
 *         `starvationDeathTicks` — a strictly larger threshold than the
 *         STARVATION_TICKS onset grace window (economy/constants.ts), so
 *         death is a further-escalated consequence of the SAME signal, not
 *         a separate mechanism.
 *       - "oldAge": only rolled for `elder`-stage agents, via a per-tick
 *         hazard that rises linearly with ticks spent past the elder
 *         threshold (family/constants.ts's OLD_AGE_HAZARD_* derivation),
 *         drawn from `rng.fork("lifecycle")` in the SAME ascending-id order
 *         every tick (rolled unconditionally for every elder, even one that
 *         already died of starvation this tick, so the `Rng` draw sequence
 *         never depends on which agents happen to be starving — a
 *         determinism simplification, not a correctness requirement).
 *       - "disease": chunk hollow-15 — reads `beliefs.data.pendingDeathCause
 *         === "disease"`, set THIS tick by the DISEASE stage
 *         (mortality/disease-system.ts) when a sick agent loses its 10%/day
 *         mortality roll on an in-game-day boundary. Routed here (rather than
 *         despawning in the disease system) so a disease death shares the ONE
 *         corpse-spawn + inheritance + cleanup path.
 *       - "violence": a SEAM ONLY for hollow-06 (no combat system exists
 *         yet) — reads an optional `beliefs.data.violentDeath` flag that
 *         nothing in this brief ever sets, so this branch is dead code
 *         today, by design.
 *     Priority when multiple causes would apply the same tick: starvation,
 *     then disease, then violence, then old age (the first three are terminal
 *     "something specific killed this agent" signals; old age is a
 *     background hazard that only matters when nothing more specific did).
 *
 *     On death, `handleDeath` runs, in order: inheritance (owned inventory
 *     -> a co-resident household kin's shared stock, else the community
 *     stockpile, else dropped), `lineage.markDeath`, household
 *     dissolve/demember, `communityId` clear, release any corpse the deceased
 *     was carrying (chunk hollow-15), spawn a corpse entity at the death tile
 *     (chunk hollow-15), then `world.despawn` — see `handleDeath`/`inherit`/
 *     `leaveHousehold`/`spawnCorpse` for the exact rules.
 *
 * Runs in its own "LIFECYCLE" stage, after PAIRBOND/REPRODUCTION (so a
 * birth this tick isn't aged or evaluated for death the same tick it
 * spawns) and BEFORE NEEDS-DECAY (so a despawned agent isn't decayed after
 * death) — see sim-bootstrap.ts's scheduler-order comment.
 */
import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { stageForAge, addGoods, makeCorpse } from "../components";
import { ONT_FAMILY, type FamilyDeathBody, type FamilyStageChangedBody } from "../protocols";
import type { HouseholdRegistry } from "./registry";
import type { LineageRegistry, DeathCause } from "../lineage";
import type { CommunityRegistry } from "../community";
import {
  STAGE_CHILD_ADULT_TICKS,
  STAGE_ADULT_ELDER_TICKS,
  OLD_AGE_HAZARD_BASE,
  OLD_AGE_HAZARD_PER_TICK,
  OLD_AGE_HAZARD_MAX,
  STARVATION_DEATH_TICKS,
} from "./constants";

export interface LifecycleSystemOptions {
  childAdultTicks?: number;
  adultElderTicks?: number;
  oldAgeHazardBase?: number;
  oldAgeHazardPerTick?: number;
  oldAgeHazardMax?: number;
  starvationDeathTicks?: number;
}

type LifecycleEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  needs: NonNullable<HollowEntity["needs"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  beliefs: NonNullable<HollowEntity["beliefs"]>;
  lifecycle: NonNullable<HollowEntity["lifecycle"]>;
  communityId: number | null;
  householdId: number | null;
};

export class HollowLifecycleSystem implements System {
  readonly name = "HollowLifecycleSystem";

  private readonly childAdultTicks: number;
  private readonly adultElderTicks: number;
  private readonly oldAgeHazardBase: number;
  private readonly oldAgeHazardPerTick: number;
  private readonly oldAgeHazardMax: number;
  private readonly starvationDeathTicks: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    private readonly households: HouseholdRegistry,
    private readonly communities: CommunityRegistry,
    private readonly lineage: LineageRegistry,
    private readonly rng: Rng,
    opts: LifecycleSystemOptions = {},
  ) {
    this.childAdultTicks = opts.childAdultTicks ?? STAGE_CHILD_ADULT_TICKS;
    this.adultElderTicks = opts.adultElderTicks ?? STAGE_ADULT_ELDER_TICKS;
    this.oldAgeHazardBase = opts.oldAgeHazardBase ?? OLD_AGE_HAZARD_BASE;
    this.oldAgeHazardPerTick = opts.oldAgeHazardPerTick ?? OLD_AGE_HAZARD_PER_TICK;
    this.oldAgeHazardMax = opts.oldAgeHazardMax ?? OLD_AGE_HAZARD_MAX;
    this.starvationDeathTicks = opts.starvationDeathTicks ?? STARVATION_DEATH_TICKS;
  }

  run(ctx: SimContext): void {
    const entities: LifecycleEntity[] = [];
    for (const e of this.world.query(
      "agent",
      "needs",
      "inventory",
      "beliefs",
      "lifecycle",
      "communityId",
      "householdId",
    )) {
      entities.push(e as LifecycleEntity);
    }
    entities.sort((a, b) => a.id - b.id);

    for (const entity of entities) this.ageOne(entity, ctx.tick);

    const byId = new Map<number, LifecycleEntity>();
    for (const e of entities) byId.set(e.id, e);

    for (const entity of entities) {
      const cause = this.evaluateDeath(entity);
      if (cause) {
        this.handleDeath(entity, cause, ctx.tick, byId);
        // Remove immediately so a LATER (higher id) death evaluated later in
        // this SAME pass correctly sees this agent as no-longer-alive for
        // inheritance/co-residency checks (see `inherit`/`leaveHousehold`).
        byId.delete(entity.id);
      }
    }
  }

  private ageOne(entity: LifecycleEntity, tick: number): void {
    entity.lifecycle.ageTicks += 1;
    const priorStage = entity.lifecycle.stage;
    const nextStage = stageForAge(entity.lifecycle.ageTicks, {
      childAdultTicks: this.childAdultTicks,
      adultElderTicks: this.adultElderTicks,
    });
    if (nextStage === priorStage) return;
    entity.lifecycle.stage = nextStage;

    if (priorStage === "child" && nextStage === "adult") {
      this.releaseFromChildhoodHousehold(entity);
    }

    const body: FamilyStageChangedBody = { agentId: entity.id, stage: nextStage, tick };
    this.emit(ONT_FAMILY.STAGE_CHANGED, body as unknown as Record<string, unknown>, tick);
  }

  private releaseFromChildhoodHousehold(entity: LifecycleEntity): void {
    if (entity.householdId == null) return;
    const household = this.households.get(entity.householdId);
    if (!household) {
      entity.householdId = null;
      return;
    }
    // A child should never itself be a household's partner (households only
    // form between adults, HollowPairBondSystem) — this check is defensive.
    if (household.partnerA === entity.id || household.partnerB === entity.id) return;
    this.households.removeMember(household.id, entity.id);
    entity.householdId = null;
  }

  private evaluateDeath(entity: LifecycleEntity): DeathCause | null {
    const foodDepletedTicks = (entity.beliefs.data.foodDepletedTicks as number | undefined) ?? 0;
    const starved = foodDepletedTicks >= this.starvationDeathTicks;

    // chunk hollow-15: the DISEASE stage (mortality/disease-system.ts, runs
    // just before LIFECYCLE) sets this flag on the day-boundary tick a sick
    // agent loses its 10%/day mortality roll, so a disease death flows through
    // this ONE death path (corpse spawn + inheritance + cleanup) rather than a
    // second despawn site.
    const diseased = entity.beliefs.data.pendingDeathCause === "disease";

    // Seam only (hollow-06) -- never set by anything in this brief.
    const violent = entity.beliefs.data.violentDeath === true;

    let oldAge = false;
    if (entity.lifecycle.stage === "elder") {
      const ticksPastElder = Math.max(0, entity.lifecycle.ageTicks - this.adultElderTicks);
      const hazard = Math.min(
        this.oldAgeHazardMax,
        this.oldAgeHazardBase + ticksPastElder * this.oldAgeHazardPerTick,
      );
      // Rolled unconditionally for every elder (see class doc) -- keeps the
      // rng draw sequence independent of which agents starve/die violently.
      oldAge = this.rng.nextFloat() < hazard;
    }

    if (starved) return "starvation";
    if (diseased) return "disease";
    if (violent) return "violence";
    if (oldAge) return "oldAge";
    return null;
  }

  private handleDeath(
    entity: LifecycleEntity,
    cause: DeathCause,
    tick: number,
    byId: Map<number, LifecycleEntity>,
  ): void {
    this.inherit(entity, byId);
    this.lineage.markDeath(entity.id, tick, cause);
    this.leaveHousehold(entity, byId);
    if (entity.communityId != null) {
      this.communities.removeMember(entity.communityId, entity.id);
      entity.communityId = null;
    }
    // chunk hollow-15: a grave-digger that dies mid-carry drops the body it
    // was hauling (so another digger can collect it) BEFORE we despawn the
    // digger — otherwise the corpse would follow a despawned carrier forever.
    this.releaseCarriedCorpse(entity);
    // chunk hollow-15: every death leaves a body — a corpse entity at the
    // death tile (see components/corpse.ts). It's a DISTINCT entity (no
    // agent/needs), so it's invisible to every living-agent system; the
    // CORPSE stage (mortality/corpse-system.ts, right after LIFECYCLE) takes
    // over its rot/spread lifecycle this same tick.
    this.spawnCorpse(entity, tick);
    this.world.despawn(entity);

    const body: FamilyDeathBody = { agentId: entity.id, cause, tick };
    this.emit(ONT_FAMILY.DEATH, body as unknown as Record<string, unknown>, tick);
  }

  /** Spawns a fresh corpse entity at the deceased's tile (chunk hollow-15). */
  private spawnCorpse(entity: LifecycleEntity, tick: number): void {
    this.world.spawn({
      corpse: makeCorpse(entity.id, tick, entity.agent.gx, entity.agent.gy),
    } as HollowEntity);
  }

  /** If the deceased was a grave-digger carrying a corpse, clears that
   *  corpse's `carriedBy` so it lies where the digger fell and can be
   *  re-collected (chunk hollow-15). No-op for everyone else. */
  private releaseCarriedCorpse(entity: LifecycleEntity): void {
    const carried = entity.agent.carryingCorpseId;
    if (carried == null) return;
    for (const e of this.world.query("corpse")) {
      if (e.id === carried && e.corpse) {
        e.corpse.carriedBy = null;
        break;
      }
    }
  }

  /** Owned inventory goods pass to a co-resident household kin's shared
   *  stock if one is still alive, else the community stockpile, else are
   *  dropped (v1 simplification — mirrors
   *  community/crystallize-system.ts's "nowhere to go" note). */
  private inherit(entity: LifecycleEntity, byId: Map<number, LifecycleEntity>): void {
    const goods = entity.inventory.goods;
    const hasGoods = Object.values(goods).some((v) => v > 0);
    if (!hasGoods) return;

    if (entity.householdId != null) {
      const household = this.households.get(entity.householdId);
      const hasLivingCoResident = household?.memberIds.some((id) => id !== entity.id && byId.has(id));
      if (household && hasLivingCoResident) {
        for (const [kind, amount] of Object.entries(goods)) {
          if (amount > 0) household.sharedStock[kind] = (household.sharedStock[kind] ?? 0) + amount;
        }
        return;
      }
    }
    if (entity.communityId != null) {
      for (const [kind, amount] of Object.entries(goods)) {
        if (amount > 0) this.communities.contribute(entity.communityId, kind, amount);
      }
    }
  }

  /** If the deceased was a household PARTNER, the household dissolves —
   *  any `sharedStock` passes to the surviving partner (if still alive),
   *  and every remaining member (surviving partner + any co-resident
   *  children) is freed to `householdId: null`. If the deceased was only a
   *  co-resident child, it's simply removed from `memberIds`. */
  private leaveHousehold(entity: LifecycleEntity, byId: Map<number, LifecycleEntity>): void {
    if (entity.householdId == null) return;
    const household = this.households.get(entity.householdId);
    if (!household) {
      entity.householdId = null;
      return;
    }
    const wasPartner = household.partnerA === entity.id || household.partnerB === entity.id;
    if (!wasPartner) {
      this.households.removeMember(household.id, entity.id);
      entity.householdId = null;
      return;
    }

    const survivingPartnerId = household.partnerA === entity.id ? household.partnerB : household.partnerA;
    const survivingPartner = byId.get(survivingPartnerId);
    const removed = this.households.dissolve(household.id);
    if (!removed) return;

    if (survivingPartner) {
      for (const [kind, amount] of Object.entries(removed.sharedStock)) {
        if (amount > 0) addGoods(survivingPartner.inventory, kind, amount);
      }
    }
    for (const memberId of removed.memberIds) {
      if (memberId === entity.id) continue;
      const member = byId.get(memberId);
      if (member) member.householdId = null;
    }
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      { performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body },
      tick,
    );
  }
}
