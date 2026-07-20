/**
 * Hollow sim bootstrap — transport-agnostic, deterministic sim core.
 *
 * Chunk hollow-03 is the FIRST real gameplay: a seeded starting population
 * with depleting needs, spatially-located resource nodes with finite/
 * renewing stock, and a minimal BDI loop (perceive → deliberate → act) that
 * turns need pressure into travel + harvest + consumption. See
 * `economy/constants.ts` for the tuning derivation and `protocols/starvation.ts`
 * for the scarcity → population-regulation signal.
 *
 * `bootstrapHollowSim` must stay usable from:
 *   - a headless Node script (tools/hollow-sim) — no Worker, no DOM;
 *   - a browser Web Worker (@hollow/client's src/worker/sim-worker.ts);
 *   - a test, driving the scheduler directly.
 * Nothing Worker- or DOM-specific belongs in this file (the sim ↔ render
 * boundary convention — see CLAUDE.md's "Architecture essentials").
 *
 * Scheduler order — SHOCK → PERCEIVE → DELIBERATE → ACT → TRUST-ACCRUAL →
 * COMMUNITY → BELONGING → PAIRBOND → REPRODUCTION → LIFECYCLE → NEEDS-DECAY
 * → RESOURCE-REGEN:
 *  0. SHOCK (HollowShockSystem, chunk hollow-11a): applies any environmental
 *     shock (famine/boom/disaster/plague) scheduled for THIS tick, and
 *     recomputes the resource world's regen multiplier / drains any active
 *     plague. Runs FIRST — before PERCEIVE — for two reasons: (a) shocks
 *     must apply at a tick BOUNDARY only, never mid-tick, and stage 0 is the
 *     one unambiguous boundary every tick has; (b) putting it before
 *     PERCEIVE means this tick's agents already perceive the POST-shock
 *     world (reduced food regen, a zeroed node, a drained need) rather than
 *     perceiving it a tick late. See `shock/system.ts`'s header for the
 *     full determinism/replay contract.
 *  1. PERCEIVE (HollowPerceiveSystem): folds needs into the starvation
 *     belief/signal, and re-arms any agent that finished its last intention
 *     last tick (empty queue, still in "ACT") back to "PERCEIVE" so it gets
 *     re-planned THIS tick. HollowSocialWitnessSystem (chunk hollow-06a)
 *     runs right after it, in the same stage: it folds the PRIOR tick's
 *     rumor/steal-detected broadcasts into bystanders' relationship
 *     ledgers — see social/witness-system.ts's header for the one-tick
 *     delivery-delay rationale.
 *  2. DELIBERATE (HollowDeliberateSystem): the engine's generic PERCEIVE→ACT
 *     dispatch — runs the "villager" deliberator for every agent PERCEIVE
 *     just re-armed (or that started the tick already in "PERCEIVE"),
 *     filling its intention queue, then flips it to "ACT".
 *  3. ACT (HollowActSystem): executes the top intention of every "ACT"-state
 *     agent — including ones DELIBERATE just filled THIS tick, so a
 *     newly-planned intention starts executing the same tick it's chosen,
 *     not the next one. HollowSocialActSystem (chunk hollow-06a) runs right
 *     after it, in the same stage: it executes the nine social-verb
 *     intention kinds (gift/share/help_labor/teach/trade/steal/sabotage/
 *     rumor/attack) that HollowActSystem's own switch whitelists through
 *     rather than dropping — see systems/act.ts's default-case comment.
 *  4. TRUST-ACCRUAL (HollowTrustAccrualSystem, chunk hollow-04): decays
 *     every known relationship-ledger entry toward neutral, then accrues
 *     mild mutual trust for agents co-located or sharing a resource-node
 *     target THIS tick. Runs right after ACT specifically because
 *     proximity/shared-activity are only knowable once this tick's movement
 *     has happened (see systems/act.ts's `stepToward`) — running it any
 *     earlier would read stale (pre-move) positions.
 *  5. COMMUNITY (HollowCommunitySystem, chunk hollow-04): the PERIODIC
 *     (not every-tick) community-detection + dynamics pass — leave, split,
 *     merge, grow, form — over the CURRENT trust ledger. Runs immediately
 *     after TRUST-ACCRUAL so it always reads this tick's up-to-date scores,
 *     and BEFORE BELONGING so belonging replenish/decay reflects any
 *     join/leave/split/merge/dissolve that just happened this tick, not
 *     last tick's stale membership.
 *  6. BELONGING (HollowBelongingSystem, chunk hollow-04): couples
 *     `communityId` to the `belonging` need — members replenish, non-
 *     members (never-joined, defected, or dissolved-out) decay. Must run
 *     AFTER COMMUNITY (see above) and BEFORE NEEDS-DECAY (whose generic
 *     `decayPerTick` for `belonging` is a no-op stub — see
 *     economy/constants.ts — so it doesn't fight this system).
 *  7. PAIRBOND (HollowPairBondSystem, chunk hollow-05): bonds eligible
 *     unattached adult pairs into new households. Runs AFTER BELONGING so
 *     it reads this tick's up-to-date trust/community state, and BEFORE
 *     REPRODUCTION (a household must exist before it can roll for a birth).
 *  8. REPRODUCTION (HollowReproductionSystem, chunk hollow-05): rolls each
 *     eligible household for a new pregnancy (gated by food security) and
 *     spawns any child whose gestation just completed. Runs BEFORE
 *     LIFECYCLE so a same-tick birth isn't aged or evaluated for death the
 *     same tick it spawns.
 *  9. LIFECYCLE (HollowLifecycleSystem, chunk hollow-05): ages every agent,
 *     recomputes life stage, and evaluates death (starvation/old-age/
 *     violence-seam), handling inheritance/household/community cleanup and
 *     `world.despawn`. Runs AFTER PAIRBOND/REPRODUCTION (see above) and
 *     BEFORE NEEDS-DECAY so we don't decay needs on agents that die this
 *     tick.
 * 10. NEEDS-DECAY (engine's `createNeedsDecaySystem`): drains every need by
 *     its `decayPerTick`. Runs AFTER perceive/deliberate/act (and hollow-04's
 *     trust/community/belonging systems, and hollow-05's pairbond/
 *     reproduction/lifecycle systems) so this tick's harvesting/resting/
 *     eating/belonging is reflected before decay applies — an agent that
 *     just topped off `food` this tick shouldn't also lose ground to decay
 *     in the same tick.
 * 11. RESOURCE-REGEN (`createResourceRegenSystem`): advances every node's
 *     stock by one tick of regeneration. Runs last so a node fully drained
 *     by this tick's harvesting still gets its regen tick rather than being
 *     skipped for the tick it hit zero.
 *
 * A note on "20 Hz": that cadence is a TRANSPORT concern — how often a
 * Worker's `setInterval` calls `tick()` in real time (mirroring
 * @citadel/client's sim-worker.ts, which paces itself via
 * `1000 / (20 * speed)`). `@engine/core` exposes no `FixedStepClock`
 * abstraction (there is only `Scheduler.tick(ctx)`, which advances by tick
 * COUNT, not wall time), so the 20 Hz pacing lives in the Worker, not here.
 * This module only counts ticks — a tick's output depends solely on the tick
 * count, never on wall-clock time (determinism is load-bearing; see
 * CLAUDE.md).
 */
import { MessageBus, Scheduler, World, createRng, type Rng } from "@engine/core";
import { createNeedsDecaySystem } from "@engine/core/agent";
import type { HollowEntity } from "./components";
import { spawnPopulation } from "./population";
import { ResourceWorld, createResourceRegenSystem } from "./world";
import { HollowPerceiveSystem } from "./systems/perceive";
import { HollowDeliberateSystem } from "./systems/deliberate";
import { HollowActSystem } from "./systems/act";
import {
  DEFAULT_FOOD_NODE_COUNT,
  DEFAULT_MATERIAL_NODE_COUNT,
  DEFAULT_POPULATION,
  FOOD_NODE_MAX_STOCK,
  FOOD_NODE_REGEN_PER_TICK,
  MATERIAL_NODE_MAX_STOCK,
  MATERIAL_NODE_REGEN_PER_TICK,
} from "./economy";
import {
  CommunityRegistry,
  HollowTrustAccrualSystem,
  HollowCommunitySystem,
  HollowBelongingSystem,
  TRUST_PROXIMITY_DELTA,
  TRUST_SHARED_NODE_DELTA,
  TRUST_DECAY_TOWARD_NEUTRAL_RATE,
  COMMUNITY_CHECK_INTERVAL_TICKS,
  COMMUNITY_MIN_SIZE,
  COMMUNITY_MIN_MEMBERS,
  COMMUNITY_MIN_DENSITY,
  COMMUNITY_TRUST_THRESHOLD,
  COMMUNITY_JOIN_TRUST_THRESHOLD,
  COMMUNITY_LEAVE_TRUST_THRESHOLD,
  COMMUNITY_MERGE_CROSS_TRUST_THRESHOLD,
  COMMUNITY_MERGE_TERRITORY_RADIUS,
  BELONGING_MEMBER_REPLENISH_PER_TICK,
  BELONGING_NONMEMBER_DECAY_PER_TICK,
} from "./community";
import {
  HouseholdRegistry,
  HollowPairBondSystem,
  HollowReproductionSystem,
  HollowLifecycleSystem,
  STAGE_CHILD_ADULT_TICKS,
  STAGE_ADULT_ELDER_TICKS,
  OLD_AGE_HAZARD_BASE,
  OLD_AGE_HAZARD_PER_TICK,
  OLD_AGE_HAZARD_MAX,
  STARVATION_DEATH_TICKS,
  PAIRBOND_TRUST_THRESHOLD,
  PAIRBOND_COMPAT_THRESHOLD,
  PAIRBOND_PROXIMITY_TILES,
  BIRTH_WINDOW_TICKS,
  BIRTH_CHANCE,
  BIRTH_FOOD_SECURITY_FRACTION,
  BIRTH_PERCAPITA_FOOD_TARGET,
  GESTATION_TICKS,
} from "./family";
import { LineageRegistry } from "./lineage";
import { ONT_FAMILY, ONT_SOCIAL, type Shock, type Intervention } from "./protocols";
import {
  HollowSocialActSystem,
  HollowSocialWitnessSystem,
  STEAL_DETECTION_PROB,
  ATTACK_LETHALITY_PROB,
  SABOTAGE_DETECTION_PROB,
} from "./social";
import { HollowShockSystem } from "./shock";

export type { HollowEntity } from "./components";

export interface HollowSimOptions {
  /** Seed for the sim's root `Rng` — all randomness must fork from this (never `Math.random()`). */
  seed: number;
  /** Ticks per in-game day. No day/night system exists yet (chunk hollow-03); carried through
   *  for shape-parity with `@farm/sim-core`'s and `@citadel/sim-core`'s bootstrap options, so
   *  later briefs that add a day clock don't need to change this option's name. */
  ticksPerDay: number;

  /** Starting population size. Defaults to `DEFAULT_POPULATION` (economy/constants.ts). */
  population?: number;

  /** Resource-node generation knobs — override the economy defaults to build scarce/ample
   *  scenarios (e.g. for the scarcity-sweep tests). Each defaults to its economy constant. */
  foodNodeCount?: number;
  materialNodeCount?: number;
  foodNodeMaxStock?: number;
  foodNodeRegenPerTick?: number;
  materialNodeMaxStock?: number;
  materialNodeRegenPerTick?: number;

  // Community (chunk hollow-04) knobs — each defaults to its
  // community/constants.ts constant, same override pattern as the resource
  // knobs above (e.g. for building deliberately clustered/fragmented test
  // scenarios).
  /** Trust nudge applied per tick to co-located agent pairs. */
  trustProximityDelta?: number;
  /** Extra trust nudge for agent pairs sharing a resource-node target. */
  trustSharedNodeDelta?: number;
  /** Fraction of the gap to neutral trust closed per tick. */
  trustDecayRate?: number;
  /** How often (in ticks) the community detection/dynamics pass runs. */
  communityCheckIntervalTicks?: number;
  /** Minimum cluster size to crystallize/remain a community. */
  communityMinSize?: number;
  /** Membership floor below which a community dissolves. */
  communityMinMembers?: number;
  /** Minimum internal-pair density for a cluster to count as "dense". */
  communityMinDensity?: number;
  /** Mutual-trust edge threshold used by FORM/SPLIT's detection graph. */
  communityTrustThreshold?: number;
  /** Combined trust threshold for a non-member to GROW into a community. */
  communityJoinTrustThreshold?: number;
  /** A member's trust-to-group floor below which it defects (LEAVE). */
  communityLeaveTrustThreshold?: number;
  /** Cross-trust threshold for two communities to MERGE. */
  communityMergeCrossTrustThreshold?: number;
  /** Territory-overlap tile radius for the MERGE rule. */
  communityMergeTerritoryRadius?: number;
  /** Per-tick `belonging` replenishment for community members. */
  belongingMemberReplenishPerTick?: number;
  /** Per-tick `belonging` decay for non-members. */
  belongingNonMemberDecayPerTick?: number;

  // Lifecycle / genetics / pair-bonding / reproduction (chunk hollow-05)
  // knobs — each defaults to its family/constants.ts constant, same
  // override pattern as above (e.g. for shrinking stage/gestation ticks so
  // a test can force a scenario without a huge tick budget).
  /** Age (ticks) below which an agent is a "child". */
  childAdultTicks?: number;
  /** Age (ticks) below which an agent is an "adult" (at/above: "elder"). */
  adultElderTicks?: number;
  /** Per-tick old-age death hazard right at the elder threshold. */
  oldAgeHazardBase?: number;
  /** Added to the old-age hazard per tick spent past the elder threshold. */
  oldAgeHazardPerTick?: number;
  /** Clamp on the old-age hazard, however old an elder gets. */
  oldAgeHazardMax?: number;
  /** Consecutive `foodDepletedTicks` before starvation actually kills. */
  starvationDeathTicks?: number;
  /** Mutual-trust floor (both directions) for pair-bonding. */
  pairbondTrustThreshold?: number;
  /** Trait-compatibility floor for pair-bonding. */
  pairbondCompatThreshold?: number;
  /** Chebyshev-tile proximity radius required to pair-bond. */
  pairbondProximityTiles?: number;
  /** How often (in ticks) each household rolls for a new pregnancy. */
  birthWindowTicks?: number;
  /** Chance of conceiving on a birth-window roll that clears food security. */
  birthChance?: number;
  /** `food`-need fraction floor (and not-`starving`) for a partner to be food-secure. */
  birthFoodSecurityFraction?: number;
  /** Per-capita food-regen target for the density-dependent birth brake — the
   *  load-bearing population stabilizer (see BIRTH_PERCAPITA_FOOD_TARGET).
   *  Lower ⇒ births throttle at a lower carrying capacity. */
  birthPerCapitaFoodTarget?: number;
  /** Ticks between a successful conception roll and the child spawning. */
  gestationTicks?: number;

  // Social-verb (chunk hollow-06a) knobs — each defaults to its
  // social/constants.ts constant. Only the three probability-gated verb
  // outcomes are exposed here (per the brief: force each to 0/1 so a test
  // can deterministically pick the detected/undetected or lethal/non-lethal
  // branch); every other social tunable is a plain constant (no override
  // demand from any test).
  /** Probability a `steal` is detected. */
  stealDetectionProb?: number;
  /** Probability an `attack` is lethal. */
  attackLethalityProb?: number;
  /** Probability a `sabotage` is detected. */
  sabotageDetectionProb?: number;
}

export interface HollowAppearanceSnapshot {
  readonly height: number;
  readonly build: number;
  readonly skinTone: string;
  readonly hairTone: string;
}

export interface HollowAgentSnapshot {
  readonly id: number;
  readonly kind: string;
  readonly gx: number;
  readonly gy: number;
  /** Raw need values (not fractions), keyed by need kind (food/rest/wealth/safety/belonging). */
  readonly needs: Readonly<Record<string, number>>;
  readonly inventory: Readonly<Record<string, number>>;
  readonly starving: boolean;
  /** The community (chunk hollow-04) this agent belongs to, or `null`. */
  readonly communityId: number | null;
  /** Age in ticks since birth (chunk hollow-05). */
  readonly ageTicks: number;
  /** Life stage — "child" | "adult" | "elder" (chunk hollow-05). */
  readonly stage: string;
  /** The household (chunk hollow-05) this agent belongs to, or `null`. */
  readonly householdId: number | null;
  /** Heritable appearance genes, for the M2 renderer (chunk hollow-05). */
  readonly appearance: HollowAppearanceSnapshot;
  /**
   * RENDER-ONLY coarse action label for the CURRENT tick (chunk hollow-09a) —
   * "idle" | "walk" | "eat" | "work" | "rest", a social-verb name ("gift" |
   * "share" | "help" | "teach" | "trade" | "steal" | "sabotage" | "rumor" |
   * "attack"). Mirrors `HollowAgent.currentAction` (components/agent.ts) —
   * see that field's doc for the write-only determinism guard. Consumed by
   * the client renderer to pose/glyph agents (chunk hollow-09b); 09a itself
   * only produces this field, it doesn't render agents yet.
   */
  readonly action: string;
}

export interface HollowResourceNodeSnapshot {
  readonly id: number;
  readonly kind: string;
  readonly gx: number;
  readonly gy: number;
  readonly stock: number;
  readonly maxStock: number;
}

export interface HollowCommunityNormsSnapshot {
  readonly shareRate: number;
  readonly cooperationExpectation: number;
}

/** Data-only snapshot of one emergent community (chunk hollow-04) — see
 *  `community/community.ts` for the live (mutable) shape this is copied
 *  from. */
export interface HollowCommunitySnapshot {
  readonly id: number;
  readonly members: readonly number[];
  readonly territory: readonly { readonly gx: number; readonly gy: number }[];
  readonly stockpile: Readonly<Record<string, number>>;
  readonly norms: HollowCommunityNormsSnapshot;
}

/** Data-only snapshot for a headless observer (no render state — see CLAUDE.md's sim↔render boundary). */
export interface HollowSnapshot {
  readonly tick: number;
  readonly aliveCount: number;
  readonly agents: readonly HollowAgentSnapshot[];
  readonly resourceNodes: readonly HollowResourceNodeSnapshot[];
  /** Emergent communities (chunk hollow-04), sorted ascending by id. */
  readonly communities: readonly HollowCommunitySnapshot[];
  /** Running total of births since sim start (chunk hollow-05) — does NOT
   *  count the seeded founding population. */
  readonly bornCount: number;
  /** Running total of deaths since sim start (chunk hollow-05). */
  readonly diedCount: number;
  /** Current number of pair-bonded households (chunk hollow-05). */
  readonly householdCount: number;
  /** Running total of each CONSUMMATED social verb since sim start (chunk
   *  hollow-06b) — keyed by "gift"/"share"/"help"/"teach"/"trade"/"steal"/
   *  "sabotage"/"rumor"/"attack" (mirrors `ONT_SOCIAL`'s vocabulary, minus
   *  the internal `STEAL_DETECTED` sub-event). "Consummated" means the verb
   *  actually executed its effect this tick, not merely that an intention
   *  was queued: gift/share/steal/help_labor/teach only fire their
   *  `ONT_SOCIAL.*` event when something real happened (see
   *  social/act-system.ts's per-verb guards); sabotage/rumor/attack always
   *  emit once dispatched (no "nothing happened" branch); trade counts only
   *  the ACCEPTED branch (a rejected offer isn't a consummated trade). The
   *  observable feed for hollow-06b's anti-inert/flip tests, and the data
   *  hollow-07's export will surface. */
  readonly socialCounts: Readonly<Record<string, number>>;
}

export interface BootedHollowSim {
  world: World<HollowEntity>;
  bus: MessageBus;
  scheduler: Scheduler;
  rng: Rng;
  resources: ResourceWorld;
  /** The community registry (chunk hollow-04) — plain-data, mirroring
   *  `resources` above (see world/resources.ts's header for why communities,
   *  like resource nodes, are NOT ECS entities). */
  communities: CommunityRegistry;
  /** The household registry (chunk hollow-05) — plain-data, same rationale
   *  as `communities` above. */
  households: HouseholdRegistry;
  /** The permanent ancestry record (chunk hollow-05) — every agent ever
   *  spawned, living or dead. See lineage/registry.ts's header for why this
   *  outlives the ECS world's own despawn-on-death bookkeeping. */
  lineage: LineageRegistry;
  /**
   * Dedicated `Rng` fork for founder-genome authoring (chunk hollow-11a,
   * `@hollow/sim-core/persona`'s `applyPersonaSeed`) — `rng.fork("persona-authoring")`,
   * carved out UNCONDITIONALLY right after hollow-06a's three forks (see
   * `bootstrapHollowSim`'s body), so whether or not a persona seed is ever
   * applied never shifts any other system's draw order. Exposed here (not
   * re-derived lazily inside `applyPersonaSeed`) so that fork always sits at
   * the exact same fixed point in the root `Rng`'s fork sequence.
   */
  personaRng: Rng;
  /**
   * Schedules `shock` to apply at the NEXT tick boundary (chunk hollow-11a)
   * and appends the resulting `Intervention` to `interventionLog`. See
   * `shock/system.ts`'s header for the stage placement + fork-keying
   * determinism contract.
   */
  scheduleShock(shock: Shock): Intervention;
  /**
   * Seeds the shock system's pending queue from a PRIOR run's exact
   * `interventionLog` (same tick/seq pairs, same order) — the replay path:
   * bootstrap a fresh sim with the same seed + persona seed, call this
   * once before ticking, then `tick()` forward; each logged intervention
   * applies at its recorded tick exactly as it did the first time.
   */
  loadInterventionLog(entries: readonly Intervention[]): void;
  /** Every intervention scheduled so far (live `scheduleShock` calls plus
   *  any `loadInterventionLog`-seeded ones), in schedule order — the
   *  replayable record (chunk hollow-11a). */
  readonly interventionLog: readonly Intervention[];
  /** Advances the sim by exactly one tick. */
  tick(): void;
  /** Returns a snapshot of the current sim state (render/transport boundary). */
  getSnapshot(): HollowSnapshot;
}

export function bootstrapHollowSim(opts: HollowSimOptions): BootedHollowSim {
  const rng = createRng(opts.seed);
  const world = new World<HollowEntity>();
  const bus = new MessageBus();

  // Resource world is built from its own named fork (see world/resources.ts) —
  // constructed BEFORE the population so the villager deliberator's very
  // first tick already has nodes to find.
  const resources = new ResourceWorld(rng, {
    foodNodeCount: opts.foodNodeCount ?? DEFAULT_FOOD_NODE_COUNT,
    materialNodeCount: opts.materialNodeCount ?? DEFAULT_MATERIAL_NODE_COUNT,
    foodNodeMaxStock: opts.foodNodeMaxStock ?? FOOD_NODE_MAX_STOCK,
    foodNodeRegenPerTick: opts.foodNodeRegenPerTick ?? FOOD_NODE_REGEN_PER_TICK,
    materialNodeMaxStock: opts.materialNodeMaxStock ?? MATERIAL_NODE_MAX_STOCK,
    materialNodeRegenPerTick: opts.materialNodeRegenPerTick ?? MATERIAL_NODE_REGEN_PER_TICK,
  });

  // Community registry (chunk hollow-04) — a small managed set, not ECS
  // entities (mirrors `resources` above). No Rng is threaded through: id
  // assignment is a plain incrementing counter (see registry.ts's header
  // for why that's still deterministic), and every genuine tie in the
  // detection/dynamics passes is broken by sorted agent id, not a coin
  // flip (see community/trust.ts's header).
  const communities = new CommunityRegistry();

  // Household + lineage registries (chunk hollow-05) — same plain-data
  // rationale as `communities` above. `lineage` is threaded into
  // `spawnPopulation` below so founders get a permanent generation-0 record.
  const households = new HouseholdRegistry();
  const lineage = new LineageRegistry();

  spawnPopulation(world, rng, {
    population: opts.population ?? DEFAULT_POPULATION,
    lineage,
    childAdultTicks: opts.childAdultTicks ?? STAGE_CHILD_ADULT_TICKS,
    adultElderTicks: opts.adultElderTicks ?? STAGE_ADULT_ELDER_TICKS,
  });

  // hollow-05's three new named forks — constructed AFTER spawnPopulation
  // (which itself forks "population-genomes"/"population-lifecycle" off the
  // root `rng`), so none of hollow-03/04's or spawnPopulation's own draws
  // are disturbed. `reproductionRng` (the birth-window roll) and
  // `geneticsRng` (crossover/mutation) are kept SEPARATE — see
  // family/reproduction-system.ts's header for why.
  const geneticsRng = rng.fork("genetics");
  const lifecycleRng = rng.fork("lifecycle");
  const reproductionRng = rng.fork("reproduction");

  // hollow-06a's three named forks (steal/attack/sabotage's detection and
  // lethality rolls) — constructed AFTER hollow-05's three forks above, for
  // the same "don't disturb existing draw order" reason spelled out there.
  const stealDetectionRng = rng.fork("steal-detection");
  const attackRng = rng.fork("attack");
  const sabotageDetectionRng = rng.fork("sabotage-detection");

  // hollow-11a's two new forks — constructed AFTER hollow-06a's three forks
  // above, for the same "don't disturb existing draw order" reason spelled
  // out there. Carved out UNCONDITIONALLY (not lazily inside
  // applyPersonaSeed/scheduleShock) so their fixed position in the root
  // `Rng`'s fork sequence never depends on whether a persona seed is applied
  // or any shock is ever scheduled — see `BootedHollowSim.personaRng`'s doc
  // and `shock/system.ts`'s header for the full determinism contract.
  const personaRng = rng.fork("persona-authoring");
  const shockRng = rng.fork("shock");

  // Running birth/death totals (chunk hollow-05) — maintained by
  // subscribing to the family ontology rather than re-deriving from
  // `lineage` at snapshot time, mirroring how a later consumer (hollow-07's
  // CLI export) would hook the same events.
  let bornCount = 0;
  let diedCount = 0;
  bus.subscribeOntology(ONT_FAMILY.BIRTH, () => {
    bornCount++;
  });
  bus.subscribeOntology(ONT_FAMILY.DEATH, () => {
    diedCount++;
  });

  // Running per-verb social-action totals (chunk hollow-06b) — same
  // subscription pattern as bornCount/diedCount above. See HollowSnapshot's
  // `socialCounts` field doc for the "consummated" definition per verb.
  const socialCounts: Record<string, number> = {
    gift: 0,
    share: 0,
    help: 0,
    teach: 0,
    trade: 0,
    steal: 0,
    sabotage: 0,
    rumor: 0,
    attack: 0,
  };
  bus.subscribeOntology(ONT_SOCIAL.GIFT, () => {
    socialCounts["gift"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.SHARE, () => {
    socialCounts["share"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.HELP, () => {
    socialCounts["help"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.TEACH, () => {
    socialCounts["teach"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.TRADE, (msg) => {
    // Only the ACCEPTED branch is a consummated trade (see HollowSnapshot's
    // `socialCounts` doc) — a rejected offer still emits `ONT_SOCIAL.TRADE`
    // (social/act-system.ts's `runTrade`) but moved nothing.
    if (msg.body.accepted === true) socialCounts["trade"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.STEAL, () => {
    socialCounts["steal"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.SABOTAGE, () => {
    socialCounts["sabotage"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.RUMOR, () => {
    socialCounts["rumor"]!++;
  });
  bus.subscribeOntology(ONT_SOCIAL.ATTACK, () => {
    socialCounts["attack"]!++;
  });

  // chunk hollow-11a's environmental-shock engine — see shock/system.ts's
  // header for the full stage-placement + determinism/replay contract.
  const shockSystem = new HollowShockSystem(world, resources, bus, shockRng);

  const scheduler = new Scheduler();
  scheduler
    .stage("SHOCK")
    .add(shockSystem)
    .stage("PERCEIVE")
    .add(new HollowPerceiveSystem(world, bus))
    // hollow-06a's third-party trust folding (rumor/steal-detected
    // fan-out) — runs in the same "world/message -> belief/relationship
    // fold" stage as HollowPerceiveSystem, right after it. See
    // social/witness-system.ts's header for the one-tick delivery-delay
    // rationale (it processes messages the PRIOR tick's ACT stage sent).
    .add(new HollowSocialWitnessSystem(world, bus))
    .stage("DELIBERATE")
    .add(new HollowDeliberateSystem(world, resources))
    .stage("ACT")
    .add(new HollowActSystem(world, resources))
    // hollow-06a's social-verb effects (gift/share/help_labor/teach/trade/
    // steal/sabotage/rumor/attack) — a sibling of HollowActSystem in the
    // SAME "ACT" stage (see social/act-system.ts's header for why it's a
    // separate class rather than more `case`s on HollowActSystem).
    .add(
      new HollowSocialActSystem(world, resources, communities, bus, stealDetectionRng, attackRng, sabotageDetectionRng, {
        stealDetectionProb: opts.stealDetectionProb ?? STEAL_DETECTION_PROB,
        attackLethalityProb: opts.attackLethalityProb ?? ATTACK_LETHALITY_PROB,
        sabotageDetectionProb: opts.sabotageDetectionProb ?? SABOTAGE_DETECTION_PROB,
      }),
    )
    .stage("TRUST-ACCRUAL")
    .add(
      new HollowTrustAccrualSystem(world, {
        proximityDelta: opts.trustProximityDelta ?? TRUST_PROXIMITY_DELTA,
        sharedNodeDelta: opts.trustSharedNodeDelta ?? TRUST_SHARED_NODE_DELTA,
        decayRate: opts.trustDecayRate ?? TRUST_DECAY_TOWARD_NEUTRAL_RATE,
      }),
    )
    .stage("COMMUNITY")
    .add(
      new HollowCommunitySystem(world, communities, bus, {
        checkIntervalTicks: opts.communityCheckIntervalTicks ?? COMMUNITY_CHECK_INTERVAL_TICKS,
        minSize: opts.communityMinSize ?? COMMUNITY_MIN_SIZE,
        minMembers: opts.communityMinMembers ?? COMMUNITY_MIN_MEMBERS,
        minDensity: opts.communityMinDensity ?? COMMUNITY_MIN_DENSITY,
        trustThreshold: opts.communityTrustThreshold ?? COMMUNITY_TRUST_THRESHOLD,
        joinTrustThreshold: opts.communityJoinTrustThreshold ?? COMMUNITY_JOIN_TRUST_THRESHOLD,
        leaveTrustThreshold: opts.communityLeaveTrustThreshold ?? COMMUNITY_LEAVE_TRUST_THRESHOLD,
        mergeCrossTrustThreshold:
          opts.communityMergeCrossTrustThreshold ?? COMMUNITY_MERGE_CROSS_TRUST_THRESHOLD,
        mergeTerritoryRadius: opts.communityMergeTerritoryRadius ?? COMMUNITY_MERGE_TERRITORY_RADIUS,
      }),
    )
    .stage("BELONGING")
    .add(
      new HollowBelongingSystem(world, {
        memberReplenishPerTick: opts.belongingMemberReplenishPerTick ?? BELONGING_MEMBER_REPLENISH_PER_TICK,
        nonMemberDecayPerTick: opts.belongingNonMemberDecayPerTick ?? BELONGING_NONMEMBER_DECAY_PER_TICK,
      }),
    )
    .stage("PAIRBOND")
    .add(
      new HollowPairBondSystem(world, bus, households, lineage, {
        trustThreshold: opts.pairbondTrustThreshold ?? PAIRBOND_TRUST_THRESHOLD,
        compatThreshold: opts.pairbondCompatThreshold ?? PAIRBOND_COMPAT_THRESHOLD,
        proximityTiles: opts.pairbondProximityTiles ?? PAIRBOND_PROXIMITY_TILES,
      }),
    )
    .stage("REPRODUCTION")
    .add(
      new HollowReproductionSystem(world, bus, households, lineage, resources, reproductionRng, geneticsRng, {
        birthWindowTicks: opts.birthWindowTicks ?? BIRTH_WINDOW_TICKS,
        birthChance: opts.birthChance ?? BIRTH_CHANCE,
        foodSecurityFraction: opts.birthFoodSecurityFraction ?? BIRTH_FOOD_SECURITY_FRACTION,
        perCapitaFoodTarget: opts.birthPerCapitaFoodTarget ?? BIRTH_PERCAPITA_FOOD_TARGET,
        gestationTicks: opts.gestationTicks ?? GESTATION_TICKS,
      }),
    )
    .stage("LIFECYCLE")
    .add(
      new HollowLifecycleSystem(world, bus, households, communities, lineage, lifecycleRng, {
        childAdultTicks: opts.childAdultTicks ?? STAGE_CHILD_ADULT_TICKS,
        adultElderTicks: opts.adultElderTicks ?? STAGE_ADULT_ELDER_TICKS,
        oldAgeHazardBase: opts.oldAgeHazardBase ?? OLD_AGE_HAZARD_BASE,
        oldAgeHazardPerTick: opts.oldAgeHazardPerTick ?? OLD_AGE_HAZARD_PER_TICK,
        oldAgeHazardMax: opts.oldAgeHazardMax ?? OLD_AGE_HAZARD_MAX,
        starvationDeathTicks: opts.starvationDeathTicks ?? STARVATION_DEATH_TICKS,
      }),
    )
    .stage("NEEDS-DECAY")
    .add(createNeedsDecaySystem(world, { component: "needs", needsOf: (a) => a.needs }))
    .stage("RESOURCE-REGEN")
    .add(createResourceRegenSystem(resources));

  let tickCount = 0;

  return {
    world,
    bus,
    scheduler,
    rng,
    resources,
    communities,
    households,
    lineage,
    personaRng,
    scheduleShock(shock: Shock): Intervention {
      // `tickCount` (not yet incremented — see `tick()` below) is exactly
      // the tick number the NEXT `tick()` call will run, i.e. the next tick
      // boundary — see BootedHollowSim.scheduleShock's doc.
      return shockSystem.schedule(shock, tickCount);
    },
    loadInterventionLog(entries: readonly Intervention[]): void {
      shockSystem.loadLog(entries, tickCount);
    },
    get interventionLog(): readonly Intervention[] {
      return shockSystem.interventionLog;
    },
    tick(): void {
      scheduler.tick({ tick: tickCount });
      // Host-level message delivery (mirrors @farm/server/sim-host.ts calling
      // `bus.notifySubscribers()` after `scheduler.tick()`): Hollow has no
      // separate transport host, so `bootstrapHollowSim`'s own `tick()` plays
      // that role. `flush()` swaps this tick's sent messages (e.g. the
      // starvation-onset broadcast) into `deliverable`, then
      // `notifySubscribers()` dispatches them to any ontology subscriber —
      // same tick they were sent.
      bus.flush();
      bus.notifySubscribers();
      tickCount++;
    },
    getSnapshot(): HollowSnapshot {
      const agents: HollowAgentSnapshot[] = [];
      for (const entity of world.query(
        "agent",
        "needs",
        "inventory",
        "personality",
        "beliefs",
        "communityId",
        "lifecycle",
        "genome",
        "householdId",
      )) {
        const needs: Record<string, number> = {};
        for (const [kind, need] of Object.entries(entity.needs.byKind)) {
          needs[kind] = need.value;
        }
        agents.push({
          id: entity.id ?? -1,
          kind: entity.personality.kind,
          gx: entity.agent.gx,
          gy: entity.agent.gy,
          needs,
          inventory: { ...entity.inventory.goods },
          starving: entity.beliefs.data.starving === true,
          communityId: entity.communityId,
          ageTicks: entity.lifecycle.ageTicks,
          stage: entity.lifecycle.stage,
          householdId: entity.householdId,
          appearance: {
            height: entity.genome.appearance.height,
            build: entity.genome.appearance.build,
            skinTone: entity.genome.appearance.skinTone,
            hairTone: entity.genome.appearance.hairTone,
          },
          action: entity.agent.currentAction ?? "idle",
        });
      }
      const resourceNodes: HollowResourceNodeSnapshot[] = resources.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        gx: node.gx,
        gy: node.gy,
        stock: node.stock,
        maxStock: node.maxStock,
      }));
      const communitiesSnapshot: HollowCommunitySnapshot[] = communities.all().map((c) => ({
        id: c.id,
        members: [...c.members],
        territory: c.territory.map((t) => ({ gx: t.gx, gy: t.gy })),
        stockpile: { ...c.stockpile },
        norms: { shareRate: c.norms.shareRate, cooperationExpectation: c.norms.cooperationExpectation },
      }));
      return {
        tick: tickCount,
        aliveCount: agents.length,
        agents,
        resourceNodes,
        communities: communitiesSnapshot,
        bornCount,
        diedCount,
        householdCount: households.all().length,
        socialCounts: { ...socialCounts },
      };
    },
  };
}
