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
 * Scheduler order — PERCEIVE → DELIBERATE → ACT → NEEDS-DECAY → RESOURCE-REGEN:
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
 *  4. NEEDS-DECAY (engine's `createNeedsDecaySystem`): drains every need by
 *     its `decayPerTick`. Runs AFTER perceive/deliberate/act so this tick's
 *     harvesting/resting/eating is reflected before decay applies — an
 *     agent that just topped off `food` this tick shouldn't also lose
 *     ground to decay in the same tick.
 *  5. RESOURCE-REGEN (`createResourceRegenSystem`): advances every node's
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
}

export interface HollowResourceNodeSnapshot {
  readonly id: number;
  readonly kind: string;
  readonly gx: number;
  readonly gy: number;
  readonly stock: number;
  readonly maxStock: number;
}

/** Data-only snapshot for a headless observer (no render state — see CLAUDE.md's sim↔render boundary). */
export interface HollowSnapshot {
  readonly tick: number;
  readonly aliveCount: number;
  readonly agents: readonly HollowAgentSnapshot[];
  readonly resourceNodes: readonly HollowResourceNodeSnapshot[];
}

export interface BootedHollowSim {
  world: World<HollowEntity>;
  bus: MessageBus;
  scheduler: Scheduler;
  rng: Rng;
  resources: ResourceWorld;
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

  spawnPopulation(world, rng, { population: opts.population ?? DEFAULT_POPULATION });

  const scheduler = new Scheduler();
  scheduler
    .stage("PERCEIVE")
    .add(new HollowPerceiveSystem(world, bus))
    .stage("DELIBERATE")
    .add(new HollowDeliberateSystem(world, resources))
    .stage("ACT")
    .add(new HollowActSystem(world, resources))
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
      for (const entity of world.query("agent", "needs", "inventory", "personality", "beliefs")) {
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
      return { tick: tickCount, aliveCount: agents.length, agents, resourceNodes };
    },
  };
}
