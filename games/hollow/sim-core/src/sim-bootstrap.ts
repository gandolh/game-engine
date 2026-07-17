/**
 * Hollow sim bootstrap — transport-agnostic, deterministic sim core.
 *
 * Chunk hollow-03 is the FIRST real gameplay: a seeded starting population
 * with depleting needs, spatially-located resource nodes with finite/
 * renewing stock, and a minimal BDI loop (perceive → deliberate → act) that
 * turns need pressure into travel + harvest + consumption. See
 * `economy/constants.ts` for the tuning derivation and `protocols/starvation.ts`
 * for the scarcity → population-regulation signal (mechanism only — this
 * chunk never despawns an agent; that's hollow-05).
 *
 * `bootstrapHollowSim` must stay usable from:
 *   - a headless Node script (tools/hollow-sim) — no Worker, no DOM;
 *   - a browser Web Worker (@hollow/client's src/worker/sim-worker.ts);
 *   - a test, driving the scheduler directly.
 * Nothing Worker- or DOM-specific belongs in this file (the sim ↔ render
 * boundary convention — see CLAUDE.md's "Architecture essentials").
 *
 * Scheduler order — PERCEIVE → DELIBERATE → ACT → TRUST-ACCRUAL → COMMUNITY
 * → BELONGING → NEEDS-DECAY → RESOURCE-REGEN:
 *  1. PERCEIVE (HollowPerceiveSystem): folds needs into the starvation
 *     belief/signal, and re-arms any agent that finished its last intention
 *     last tick (empty queue, still in "ACT") back to "PERCEIVE" so it gets
 *     re-planned THIS tick.
 *  2. DELIBERATE (HollowDeliberateSystem): the engine's generic PERCEIVE→ACT
 *     dispatch — runs the "villager" deliberator for every agent PERCEIVE
 *     just re-armed (or that started the tick already in "PERCEIVE"),
 *     filling its intention queue, then flips it to "ACT".
 *  3. ACT (HollowActSystem): executes the top intention of every "ACT"-state
 *     agent — including ones DELIBERATE just filled THIS tick, so a
 *     newly-planned intention starts executing the same tick it's chosen,
 *     not the next one.
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
 *  7. NEEDS-DECAY (engine's `createNeedsDecaySystem`): drains every need by
 *     its `decayPerTick`. Runs AFTER perceive/deliberate/act (and hollow-04's
 *     trust/community/belonging systems) so this tick's harvesting/resting/
 *     eating/belonging is reflected before decay applies — an agent that
 *     just topped off `food` this tick shouldn't also lose ground to decay
 *     in the same tick.
 *  8. RESOURCE-REGEN (`createResourceRegenSystem`): advances every node's
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

  spawnPopulation(world, rng, { population: opts.population ?? DEFAULT_POPULATION });

  const scheduler = new Scheduler();
  scheduler
    .stage("PERCEIVE")
    .add(new HollowPerceiveSystem(world, bus))
    .stage("DELIBERATE")
    .add(new HollowDeliberateSystem(world, resources))
    .stage("ACT")
    .add(new HollowActSystem(world, resources))
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
      };
    },
  };
}
