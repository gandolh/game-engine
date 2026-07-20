/**
 * Real-structure tests for HollowLifecycleSystem, exercising the actual
 * production class directly over a hand-built World (mirrors
 * community/dynamics.test.ts's harness pattern) so death-cause/inheritance
 * scenarios can be engineered precisely and cheaply (no need to run a full
 * villager-driven sim for hundreds of ticks).
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity, Stage } from "../components";
import { NEED_FOOD } from "../economy";
import { ONT_FAMILY, type FamilyDeathBody } from "../protocols";
import { LineageRegistry } from "../lineage";
import { CommunityRegistry } from "../community";
import { HouseholdRegistry } from "./registry";
import { HollowLifecycleSystem, type LifecycleSystemOptions } from "./lifecycle-system";

type Agent = HollowEntity & { id: number };

function spawnAgent(
  world: World<HollowEntity>,
  lineage: LineageRegistry,
  opts: { stage: Stage; ageTicks: number; goods?: Record<string, number>; foodDepletedTicks?: number },
): Agent {
  const e = world.spawn({
    agent: { gx: 0, gy: 0, moveTarget: null },
    needs: { byKind: { [NEED_FOOD]: makeNeed({ decayPerTick: 0 }) } },
    inventory: { goods: { ...opts.goods } },
    beliefs: { data: { foodDepletedTicks: opts.foodDepletedTicks ?? 0 }, revision: 0 },
    lifecycle: { birthTick: 0, ageTicks: opts.ageTicks, stage: opts.stage },
    communityId: null,
    householdId: null,
  } satisfies HollowEntity) as Agent;
  lineage.record({
    id: e.id,
    genome: { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } },
    parents: null,
    birthTick: 0,
  });
  return e;
}

function makeHarness(opts?: LifecycleSystemOptions) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const households = new HouseholdRegistry();
  const communities = new CommunityRegistry();
  const lineage = new LineageRegistry();
  // A no-op Rng stand-in isn't available (no fake in this codebase's Rng
  // shape) -- use a real seeded Rng; the old-age hazard tests instead force
  // certainty via `oldAgeHazardBase: 1` / `oldAgeHazardBase: 0` so the ACTUAL
  // roll outcome is deterministic regardless of the Rng stream.
  const rng = createRng(1);
  const system = new HollowLifecycleSystem(world, bus, households, communities, lineage, rng, opts);
  const deaths: FamilyDeathBody[] = [];
  bus.subscribeOntology(ONT_FAMILY.DEATH, (msg) => deaths.push(msg.body as unknown as FamilyDeathBody));
  let tick = 0;
  return {
    world,
    households,
    communities,
    lineage,
    deaths,
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
    isAlive(id: number): boolean {
      return [...world.query("lifecycle")].some((e) => e.id === id);
    },
  };
}

describe("HollowLifecycleSystem — aging", () => {
  it("advances ageTicks by 1 every tick and transitions stage at the configured thresholds", () => {
    const h = makeHarness({ childAdultTicks: 3, adultElderTicks: 6, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "child", ageTicks: 0 });

    h.run(1);
    expect(a.lifecycle!.ageTicks).toBe(1);
    expect(a.lifecycle!.stage).toBe("child");

    h.run(2); // ageTicks -> 3
    expect(a.lifecycle!.stage).toBe("adult");

    h.run(3); // ageTicks -> 6
    expect(a.lifecycle!.stage).toBe("elder");
  });
});

describe("HollowLifecycleSystem — death causes", () => {
  it("old age: an elder always dies within the configured hazard window when the hazard is forced to certainty", () => {
    const h = makeHarness({
      childAdultTicks: 1,
      adultElderTicks: 2,
      oldAgeHazardBase: 1, // certain death, first elder tick
      oldAgeHazardPerTick: 0,
      oldAgeHazardMax: 1,
      starvationDeathTicks: 1_000_000, // rule out starvation interfering
    });
    const a = h.spawn({ stage: "elder", ageTicks: 10 });

    h.run(1);

    expect(h.isAlive(a.id)).toBe(false);
    const entry = h.lineage.get(a.id)!;
    expect(entry.deathTick).toBe(0);
    expect(entry.deathCause).toBe("oldAge");
    expect(h.deaths).toHaveLength(1);
    expect(h.deaths[0]!.cause).toBe("oldAge");
    expect(h.deaths[0]!.agentId).toBe(a.id);
  });

  it("old age: an elder never dies when the hazard is forced to zero, even after many ticks", () => {
    const h = makeHarness({
      childAdultTicks: 1,
      adultElderTicks: 2,
      oldAgeHazardBase: 0,
      oldAgeHazardPerTick: 0,
      oldAgeHazardMax: 0,
      starvationDeathTicks: 1_000_000,
    });
    const a = h.spawn({ stage: "elder", ageTicks: 10 });

    h.run(50);

    expect(h.isAlive(a.id)).toBe(true);
    expect(h.lineage.get(a.id)!.deathTick).toBeNull();
  });

  it("starvation: an agent whose foodDepletedTicks has held at/above the threshold dies with cause 'starvation'", () => {
    const h = makeHarness({ starvationDeathTicks: 5, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "adult", ageTicks: 100, foodDepletedTicks: 5 });

    h.run(1);

    expect(h.isAlive(a.id)).toBe(false);
    expect(h.lineage.get(a.id)!.deathCause).toBe("starvation");
  });

  it("starvation: an agent below the foodDepletedTicks threshold survives", () => {
    const h = makeHarness({ starvationDeathTicks: 5, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "adult", ageTicks: 100, foodDepletedTicks: 4 });

    h.run(1);

    expect(h.isAlive(a.id)).toBe(true);
  });

  it("priority: starvation wins over a simultaneously-certain old-age roll", () => {
    const h = makeHarness({
      childAdultTicks: 1,
      adultElderTicks: 2,
      oldAgeHazardBase: 1,
      oldAgeHazardMax: 1,
      starvationDeathTicks: 5,
    });
    const a = h.spawn({ stage: "elder", ageTicks: 100, foodDepletedTicks: 5 });

    h.run(1);

    expect(h.lineage.get(a.id)!.deathCause).toBe("starvation");
  });
});

describe("HollowLifecycleSystem — inheritance + household cleanup", () => {
  it("a dying PARTNER's goods pass to the household's sharedStock, which then passes to the surviving partner; the household dissolves", () => {
    const h = makeHarness({ starvationDeathTicks: 1, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "adult", ageTicks: 100, goods: { food: 10 }, foodDepletedTicks: 1 });
    const b = h.spawn({ stage: "adult", ageTicks: 100 });
    const household = h.households.form(a.id, b.id, 0);
    a.householdId = household.id;
    b.householdId = household.id;

    h.run(1);

    expect(h.isAlive(a.id)).toBe(false);
    expect(h.isAlive(b.id)).toBe(true);
    expect(h.households.get(household.id)).toBeUndefined(); // dissolved
    expect(b.householdId).toBeNull();
    expect(b.inventory!.goods.food).toBe(10); // inherited via sharedStock
  });

  it("a dying co-resident CHILD's goods pass to the household's sharedStock; the household is NOT dissolved (only the partners dissolve it)", () => {
    const h = makeHarness({ starvationDeathTicks: 1, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "adult", ageTicks: 100 });
    const b = h.spawn({ stage: "adult", ageTicks: 100 });
    const child = h.spawn({ stage: "child", ageTicks: 5, goods: { materials: 3 }, foodDepletedTicks: 1 });
    const household = h.households.form(a.id, b.id, 0);
    a.householdId = household.id;
    b.householdId = household.id;
    child.householdId = household.id;
    h.households.addMember(household.id, child.id);

    h.run(1);

    expect(h.isAlive(child.id)).toBe(false);
    const survivingHousehold = h.households.get(household.id);
    expect(survivingHousehold).toBeDefined(); // NOT dissolved
    expect(survivingHousehold!.memberIds).toEqual([a.id, b.id].sort((x, y) => x - y));
    expect(survivingHousehold!.sharedStock.materials).toBe(3);
    expect(a.householdId).toBe(household.id);
    expect(b.householdId).toBe(household.id);
  });

  it("goods are dropped (not inherited) when there is no household and no community", () => {
    const h = makeHarness({ starvationDeathTicks: 1, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const a = h.spawn({ stage: "adult", ageTicks: 100, goods: { food: 7 }, foodDepletedTicks: 1 });

    h.run(1); // no throw, no household/community to receive the goods

    expect(h.isAlive(a.id)).toBe(false);
  });

  it("goods pass to the community stockpile when there is a community but no household", () => {
    const h = makeHarness({ starvationDeathTicks: 1, oldAgeHazardBase: 0, oldAgeHazardMax: 0 });
    const community = h.communities.form([1], [], 0);
    const a = h.spawn({ stage: "adult", ageTicks: 100, goods: { food: 4 }, foodDepletedTicks: 1 });
    a.communityId = community.id;
    h.communities.addMember(community.id, a.id);

    h.run(1);

    expect(h.communities.get(community.id)!.stockpile.food).toBe(4);
  });

  it("a child released from a childhood household (ages into adult) is removed from memberIds and freed to householdId:null", () => {
    const h = makeHarness({
      childAdultTicks: 2,
      adultElderTicks: 1_000_000,
      oldAgeHazardBase: 0,
      starvationDeathTicks: 1_000_000,
    });
    const a = h.spawn({ stage: "adult", ageTicks: 100 });
    const b = h.spawn({ stage: "adult", ageTicks: 100 });
    const kid = h.spawn({ stage: "child", ageTicks: 1 }); // becomes adult after 1 more tick
    const household = h.households.form(a.id, b.id, 0);
    a.householdId = household.id;
    b.householdId = household.id;
    kid.householdId = household.id;
    h.households.addMember(household.id, kid.id);

    h.run(1); // ageTicks: 1 -> 2, crosses childAdultTicks

    expect(kid.lifecycle!.stage).toBe("adult");
    expect(kid.householdId).toBeNull();
    expect(h.households.get(household.id)!.memberIds).toEqual([a.id, b.id].sort((x, y) => x - y));
  });
});
