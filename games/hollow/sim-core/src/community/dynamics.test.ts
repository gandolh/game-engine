/**
 * Real-structure tests for the community subsystem, exercising the actual
 * production classes (HollowTrustAccrualSystem, HollowCommunitySystem,
 * HollowBelongingSystem, CommunityRegistry) directly over a hand-built
 * World, rather than through the full villager-driven `bootstrapHollowSim`
 * — this lets scenarios engineer specific co-location patterns (who stands
 * where) without fighting the villager deliberator's own need-driven
 * movement, while still driving 100% real code (not stubs/mocks). See
 * sim-bootstrap.community.test.ts for the full-sim-level emergence +
 * determinism tests.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { NEED_BELONGING } from "../economy";
import { ONT_COMMUNITY, type CommunityFormedBody, type CommunitySplitBody } from "../protocols";
import { CommunityRegistry } from "./registry";
import { HollowTrustAccrualSystem } from "./trust-accrual-system";
import { HollowCommunitySystem, type CommunitySystemOptions } from "./crystallize-system";
import { HollowBelongingSystem } from "./belonging-system";

type Agent = HollowEntity & { id: number };

function spawnAgent(world: World<HollowEntity>, gx: number, gy: number): Agent {
  const e = world.spawn({
    agent: { gx, gy, moveTarget: null },
    needs: { byKind: { [NEED_BELONGING]: makeNeed({ value: 50, decayPerTick: 0 }) } },
    inventory: { goods: {} },
    intentions: { queue: [] },
    relationships: { byId: new Map() },
    communityId: null,
  } satisfies HollowEntity);
  return e as Agent;
}

interface RecordedEvent {
  ontology: string;
  body: Record<string, unknown>;
}

function makeHarness(opts?: CommunitySystemOptions) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const registry = new CommunityRegistry();
  const trust = new HollowTrustAccrualSystem(world);
  const community = new HollowCommunitySystem(world, registry, bus, opts);
  const belonging = new HollowBelongingSystem(world);
  const events: RecordedEvent[] = [];
  for (const ontology of Object.values(ONT_COMMUNITY)) {
    bus.subscribeOntology(ontology, (msg) => events.push({ ontology: msg.ontology, body: msg.body }));
  }
  let tick = 0;
  return {
    world,
    registry,
    events,
    step(): void {
      const ctx: SimContext = { tick };
      trust.run(ctx);
      community.run(ctx);
      belonging.run(ctx);
      bus.flush();
      bus.notifySubscribers();
      tick++;
    },
    run(ticks: number): void {
      for (let i = 0; i < ticks; i++) this.step();
    },
    currentTick(): number {
      return tick;
    },
  };
}

function belongingOf(agent: Agent): number {
  return agent.needs!.byKind[NEED_BELONGING]!.value;
}

describe("community FORM — crystallizes from a real high-trust cluster", () => {
  it("forms exactly one community from 4 co-located agents while 2 isolated agents stay unaffiliated", () => {
    const h = makeHarness({ checkIntervalTicks: 50 });
    const clustered = [1, 2, 3, 4].map(() => spawnAgent(h.world, 5, 5));
    const isolatedA = spawnAgent(h.world, 40, 10);
    const isolatedB = spawnAgent(h.world, 10, 40);

    h.run(300);

    const communities = h.registry.all();
    expect(communities).toHaveLength(1);
    const expectedMembers = clustered.map((a) => a.id).sort((a, b) => a - b);
    expect(communities[0]!.members).toEqual(expectedMembers);

    for (const a of clustered) expect(a.communityId).toBe(communities[0]!.id);
    expect(isolatedA.communityId).toBeNull();
    expect(isolatedB.communityId).toBeNull();

    const formedEvents = h.events.filter((e) => e.ontology === ONT_COMMUNITY.FORMED);
    expect(formedEvents.length).toBeGreaterThanOrEqual(1);
    const body = formedEvents[0]!.body as unknown as CommunityFormedBody;
    expect([...body.memberIds].sort((a, b) => a - b)).toEqual(expectedMembers);
    expect(body.communityId).toBe(communities[0]!.id);
  });

  it("belonging replenishes for members and decays for the never-affiliated", () => {
    const h = makeHarness({ checkIntervalTicks: 50 });
    const clustered = [1, 2, 3].map(() => spawnAgent(h.world, 8, 8));
    const outsider = spawnAgent(h.world, 60, 60);

    expect(clustered.every((a) => belongingOf(a) === 50)).toBe(true);
    expect(belongingOf(outsider)).toBe(50);

    h.run(300);

    for (const a of clustered) {
      expect(a.communityId).not.toBeNull();
      expect(belongingOf(a)).toBeGreaterThan(50);
    }
    expect(outsider.communityId).toBeNull();
    expect(belongingOf(outsider)).toBeLessThan(50);
  });
});

describe("community LEAVE + DISSOLVE — real defection from decayed trust", () => {
  it("two agents that stop participating individually defect (LEAVE) while the rest of the community survives", () => {
    const h = makeHarness({ checkIntervalTicks: 50 });
    // 3 agents stay together the whole run; 2 more start together (so the
    // group of 5 crystallizes as ONE community), then get moved far apart
    // from everyone (including each other) so their trust decays back
    // toward neutral and they individually fall below the LEAVE threshold.
    const core = [1, 2, 3].map(() => spawnAgent(h.world, 5, 5));
    const drifting = [spawnAgent(h.world, 5, 5), spawnAgent(h.world, 5, 5)];

    h.run(100); // let all 5 crystallize into one community

    const formedId = h.registry.all()[0]?.id;
    expect(formedId).toBeDefined();
    expect(h.registry.all()[0]!.members).toHaveLength(5);

    // Send the drifting pair far away from the core AND from each other —
    // they stop accruing trust with anyone at all.
    drifting[0]!.agent!.gx = 60;
    drifting[0]!.agent!.gy = 5;
    drifting[1]!.agent!.gx = 5;
    drifting[1]!.agent!.gy = 60;

    h.run(600);

    const left = h.events.filter((e) => e.ontology === ONT_COMMUNITY.LEFT).map((e) => e.body.agentId);
    const driftingIds = drifting.map((a) => a.id).sort((a, b) => a - b);
    expect([...new Set(left)].sort((a, b) => (a as number) - (b as number))).toEqual(driftingIds);

    for (const a of drifting) expect(a.communityId).toBeNull();
    for (const a of core) expect(a.communityId).toBe(formedId);

    const survivor = h.registry.get(formedId!);
    expect(survivor).toBeDefined();
    expect(survivor!.members).toEqual(core.map((a) => a.id).sort((a, b) => a - b));

    // No dissolve — 3 remaining members still clears minMembers (3).
    expect(h.events.some((e) => e.ontology === ONT_COMMUNITY.DISSOLVED)).toBe(false);
  });

  it("dropping below minMembers dissolves the community, reverting its stockpile evenly to the members still present at dissolution", () => {
    const h = makeHarness({ checkIntervalTicks: 50 });
    // A minSize(3)-member community: A and B stay put together (their
    // mutual trust keeps being reinforced), C alone drifts away — C's
    // trust to A/B decays toward neutral and it individually defects
    // (LEAVE). A's and B's own average trust to "the rest" stays
    // comfortably above the leave threshold throughout (their trust to
    // EACH OTHER stays maxed even as their trust to C decays), so they
    // never defect themselves — but losing even one member from a
    // minSize==minMembers==3 community drops it to 2, below the floor, so
    // it DISSOLVEs anyway with exactly A and B "still present."
    const a = spawnAgent(h.world, 20, 20);
    const b = spawnAgent(h.world, 20, 20);
    const c = spawnAgent(h.world, 20, 20);

    h.run(100); // crystallize as one 3-member community
    const communityId = h.registry.all()[0]!.id;
    expect(h.registry.all()[0]!.members).toEqual([a.id, b.id, c.id].sort((x, y) => x - y));

    // Seed a stockpile directly via the registry mutation hook (this chunk
    // doesn't auto-wire harvest contributions — see community.ts's
    // CommunityNorms.shareRate doc) so DISSOLVE's reversion arithmetic is
    // exercised with something to actually redistribute.
    h.registry.contribute(communityId, "food", 10);

    c.agent!.gx = 60;
    c.agent!.gy = 60;

    h.run(700);

    expect(h.registry.get(communityId)).toBeUndefined();
    expect(a.communityId).toBeNull();
    expect(b.communityId).toBeNull();
    expect(c.communityId).toBeNull();

    const left = h.events.filter((e) => e.ontology === ONT_COMMUNITY.LEFT);
    expect(left).toHaveLength(1);
    expect(left[0]!.body.agentId).toBe(c.id);

    const dissolved = h.events.filter((e) => e.ontology === ONT_COMMUNITY.DISSOLVED);
    expect(dissolved).toHaveLength(1);
    // The dissolve event reports the FULL former roster (including C, whose
    // departure triggered it), not just who was still present.
    expect([...(dissolved[0]!.body.memberIds as number[])].sort((x, y) => x - y)).toEqual(
      [a.id, b.id, c.id].sort((x, y) => x - y),
    );

    // 10 food split between the 2 members STILL PRESENT at dissolution (A
    // and B) — C, having already left, gets none.
    expect(a.inventory!.goods.food).toBe(5);
    expect(b.inventory!.goods.food).toBe(5);
    expect(c.inventory!.goods.food ?? 0).toBe(0);
  });
});

describe("community SPLIT — a fragmenting trust graph cleaves into two", () => {
  it("splits a 6-member community into two 3-member communities once the two halves stop interacting with each other", () => {
    const h = makeHarness({ checkIntervalTicks: 50 });
    // All 6 co-locate first so the whole group crystallizes as ONE
    // community with uniformly high mutual trust...
    const groupA = [1, 2, 3].map(() => spawnAgent(h.world, 5, 5));
    const groupB = [4, 5, 6].map(() => spawnAgent(h.world, 5, 5));

    h.run(100);
    const originalId = h.registry.all()[0]?.id;
    expect(originalId).toBeDefined();
    expect(h.registry.all()[0]!.members).toHaveLength(6);

    // ...then the two halves separate for good: A stays put, B moves far
    // away — A's internal trust (and B's) keeps being reinforced by
    // ongoing co-location, while cross-group (A<->B) trust decays back
    // toward neutral and eventually drops below the community-detection
    // edge threshold, fragmenting the single dense graph into two.
    for (const a of groupB) {
      a.agent!.gx = 45;
      a.agent!.gy = 45;
    }

    h.run(500);

    const splitEvents = h.events.filter((e) => e.ontology === ONT_COMMUNITY.SPLIT);
    expect(splitEvents.length).toBeGreaterThanOrEqual(1);
    const body = splitEvents[0]!.body as unknown as CommunitySplitBody;
    expect(body.originalId).toBe(originalId);
    expect([...body.keptMemberIds].sort((a, b) => a - b)).toEqual(groupA.map((a) => a.id).sort((a, b) => a - b));
    expect([...body.newMemberIds].sort((a, b) => a - b)).toEqual(groupB.map((a) => a.id).sort((a, b) => a - b));
    expect(body.strandedAgentIds).toEqual([]);

    const communities = h.registry.all();
    expect(communities).toHaveLength(2);
    for (const a of groupA) expect(a.communityId).toBe(body.originalId);
    for (const a of groupB) expect(a.communityId).toBe(body.newId);
  });
});
