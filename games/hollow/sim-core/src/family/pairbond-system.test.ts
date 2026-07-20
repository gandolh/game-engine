/**
 * Real-structure tests for HollowPairBondSystem, exercising the actual
 * production class directly over a hand-built World (mirrors
 * community/dynamics.test.ts's harness pattern) so scenarios can engineer
 * specific trust/proximity/genome combinations precisely.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import type { HollowEntity, Genome, Stage } from "../components";
import { BEHAVIOR_GENES } from "../components";
import { ONT_FAMILY, type FamilyBondedBody } from "../protocols";
import { LineageRegistry } from "../lineage";
import { HouseholdRegistry } from "./registry";
import { HollowPairBondSystem, type PairBondSystemOptions } from "./pairbond-system";

type Agent = HollowEntity & { id: number };

function flatGenome(value: number): Genome {
  const behavior: Record<string, number> = {};
  for (const gene of BEHAVIOR_GENES) behavior[gene] = value;
  return { behavior, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } };
}

function spawnAgent(
  world: World<HollowEntity>,
  lineage: LineageRegistry,
  opts: { gx: number; gy: number; stage: Stage; genomeValue?: number; parents?: [number, number] | null },
): Agent {
  const e = world.spawn({
    agent: { gx: opts.gx, gy: opts.gy, moveTarget: null },
    lifecycle: { birthTick: 0, ageTicks: 0, stage: opts.stage },
    relationships: { byId: new Map() },
    genome: flatGenome(opts.genomeValue ?? 0.5),
    householdId: null,
  } satisfies HollowEntity) as Agent;
  lineage.record({ id: e.id, genome: e.genome!, parents: opts.parents ?? null, birthTick: 0 });
  return e;
}

function makeHarness(opts?: PairBondSystemOptions) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const households = new HouseholdRegistry();
  const lineage = new LineageRegistry();
  const system = new HollowPairBondSystem(world, bus, households, lineage, opts);
  const events: FamilyBondedBody[] = [];
  bus.subscribeOntology(ONT_FAMILY.BONDED, (msg) => events.push(msg.body as unknown as FamilyBondedBody));
  let tick = 0;
  return {
    world,
    households,
    lineage,
    events,
    spawn: (o: Parameters<typeof spawnAgent>[2]) => spawnAgent(world, lineage, o),
    step(): void {
      system.run({ tick } as SimContext);
      bus.flush();
      bus.notifySubscribers();
      tick++;
    },
    run(n: number): void {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

/** Sets mutual trust BOTH directions (the "eligible" baseline every scenario
 *  below starts from unless a specific test deliberately withholds it). */
function setMutualTrust(a: Agent, b: Agent, score: number): void {
  a.relationships!.byId.set(b.id, score);
  b.relationships!.byId.set(a.id, score);
}

describe("HollowPairBondSystem", () => {
  it("bonds two eligible unattached adults: mutual trust + compat + proximity all clear -> a household forms and ONT_FAMILY.BONDED fires", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const b = h.spawn({ gx: 6, gy: 5, stage: "adult" });
    setMutualTrust(a, b, 0.8);

    h.run(1);

    expect(a.householdId).not.toBeNull();
    expect(a.householdId).toBe(b.householdId);
    const household = h.households.get(a.householdId!);
    expect(household).toBeDefined();
    expect([household!.partnerA, household!.partnerB].sort((x, y) => x - y)).toEqual(
      [a.id, b.id].sort((x, y) => x - y),
    );
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.householdId).toBe(household!.id);
  });

  it("stage gating: a child is never bonded, even with a perfectly eligible adult partner", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const child = h.spawn({ gx: 5, gy: 5, stage: "child" });
    const adult = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    setMutualTrust(child, adult, 0.99);

    h.run(5);

    expect(child.householdId).toBeNull();
    expect(adult.householdId).toBeNull();
    expect(h.households.all()).toHaveLength(0);
  });

  it("stage gating: two children are never bonded to each other", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const c1 = h.spawn({ gx: 5, gy: 5, stage: "child" });
    const c2 = h.spawn({ gx: 5, gy: 5, stage: "child" });
    setMutualTrust(c1, c2, 0.99);

    h.run(5);

    expect(c1.householdId).toBeNull();
    expect(c2.householdId).toBeNull();
  });

  it("kin avoidance: two adults sharing a parent never bond, however high trust/compat/proximity are", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult", parents: [100, 101] });
    const b = h.spawn({ gx: 5, gy: 5, stage: "adult", parents: [100, 102] }); // half-sibling
    setMutualTrust(a, b, 0.99);

    h.run(5);

    expect(a.householdId).toBeNull();
    expect(b.householdId).toBeNull();
  });

  it("kin avoidance: a parent and its own (now-adult) child never bond", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const parent = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const child = h.spawn({ gx: 5, gy: 5, stage: "adult", parents: [parent.id, 999] });
    setMutualTrust(parent, child, 0.99);

    h.run(5);

    expect(parent.householdId).toBeNull();
    expect(child.householdId).toBeNull();
  });

  it("one-partner-at-a-time: with three mutually-eligible adults, exactly one pair bonds and the third stays unattached", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const b = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const c = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    setMutualTrust(a, b, 0.9);
    setMutualTrust(a, c, 0.9);
    setMutualTrust(b, c, 0.9);

    h.run(1);

    const bonded = [a, b, c].filter((x) => x.householdId !== null);
    const unbonded = [a, b, c].filter((x) => x.householdId === null);
    expect(bonded).toHaveLength(2);
    expect(unbonded).toHaveLength(1);
    expect(h.households.all()).toHaveLength(1);
  });

  it("one-partner-at-a-time: an already-bonded adult is never re-bonded to a new eligible candidate", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const b = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    setMutualTrust(a, b, 0.9);
    h.run(1);
    const firstHouseholdId = a.householdId;
    expect(firstHouseholdId).not.toBeNull();

    // A third candidate shows up, also fully eligible with `a`.
    const c = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    setMutualTrust(a, c, 0.99);
    h.run(5);

    expect(a.householdId).toBe(firstHouseholdId); // unchanged
    expect(c.householdId).toBeNull(); // c never found a partner (b is taken, a is taken)
    expect(h.households.all()).toHaveLength(1);
  });

  it("does not bond when mutual trust is one-sided (only one direction clears the threshold)", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    const b = h.spawn({ gx: 5, gy: 5, stage: "adult" });
    a.relationships!.byId.set(b.id, 0.9); // a trusts b highly...
    b.relationships!.byId.set(a.id, 0.1); // ...but b does not trust a back

    h.run(5);

    expect(a.householdId).toBeNull();
    expect(b.householdId).toBeNull();
  });

  it("does not bond when out of proximity range", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.5, proximityTiles: 1 });
    const a = h.spawn({ gx: 0, gy: 0, stage: "adult" });
    const b = h.spawn({ gx: 10, gy: 10, stage: "adult" });
    setMutualTrust(a, b, 0.9);

    h.run(5);

    expect(a.householdId).toBeNull();
    expect(b.householdId).toBeNull();
  });

  it("does not bond when trait-compatibility is too low (behavior genes far apart on the compat gene subset)", () => {
    const h = makeHarness({ trustThreshold: 0.6, compatThreshold: 0.9, proximityTiles: 2 });
    const a = h.spawn({ gx: 5, gy: 5, stage: "adult", genomeValue: 0.0 });
    const b = h.spawn({ gx: 5, gy: 5, stage: "adult", genomeValue: 1.0 });
    setMutualTrust(a, b, 0.9);

    h.run(5);

    expect(a.householdId).toBeNull();
    expect(b.householdId).toBeNull();
  });
});
