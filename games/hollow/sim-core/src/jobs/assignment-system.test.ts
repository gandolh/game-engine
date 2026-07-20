/**
 * Component-level tests for chunk hollow-14b's `HollowJobAssignmentSystem`,
 * exercising the real production class directly over a hand-built World
 * (mirroring `governance/governance-system.test.ts`'s harness pattern) —
 * this lets each scenario engineer a specific genome/stockpile configuration
 * without the villager deliberator's own movement muddying the exact
 * mechanism under test. See `../sim-bootstrap.jobs.test.ts` for the
 * full-sim-level wiring + stockpile-growth + determinism tests.
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import type { HollowEntity, Genome } from "../components";
import { makeOccupation } from "../components";
import { GOOD_FOOD, GOOD_MATERIALS } from "../economy";
import { ONT_JOBS, type RoleChangedBody } from "../protocols";
import { CommunityRegistry } from "../community";
import { HollowJobAssignmentSystem, type JobAssignmentSystemOptions } from "./assignment-system";

type Agent = HollowEntity & { id: number };

function makeGenome(
  aptitude: Partial<Record<string, number>> = {},
  behavior: Partial<Record<string, number>> = {},
): Genome {
  return {
    behavior: {
      sociability: 0.5,
      risk: 0.5,
      aggression: 0.5,
      loyalty: 0.5,
      greed: 0.5,
      industriousness: 0.5,
      curiosity: 0.5,
      ...behavior,
    },
    aptitude: { food: 0.5, material: 0.5, ...aptitude },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function spawnAgent(world: World<HollowEntity>, genome: Genome, communityId: number | null = null): Agent {
  const e = world.spawn({
    genome,
    communityId,
    occupation: makeOccupation(),
  } satisfies HollowEntity);
  return e as Agent;
}

interface RecordedEvent {
  ontology: string;
  body: Record<string, unknown>;
}

function makeJobsHarness(opts?: JobAssignmentSystemOptions) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const registry = new CommunityRegistry();
  const system = new HollowJobAssignmentSystem(world, registry, bus, { intervalTicks: 1, ...opts });
  const events: RecordedEvent[] = [];
  bus.subscribeOntology(ONT_JOBS.ROLE_CHANGED, (msg) => events.push({ ontology: msg.ontology, body: msg.body }));
  let tick = 0;
  return {
    world,
    registry,
    events,
    step(): void {
      system.run({ tick } as SimContext);
      bus.flush();
      bus.notifySubscribers();
      tick++;
    },
  };
}

describe("HollowJobAssignmentSystem — role-fit assignment (chunk hollow-14b)", () => {
  it("loners self-assign each of the five roles by aptitude fit alone, and ROLE_CHANGED fires once per agent", () => {
    const h = makeJobsHarness();

    const foodGatherer = spawnAgent(h.world, makeGenome({ food: 1, material: 0.1 }));
    const materialGatherer = spawnAgent(h.world, makeGenome({ food: 0.1, material: 1 }));
    // material apt 0.8 + curiosity 1 beats a pure material fit of 0.8 itself
    // via crafter's 0.7*material + 0.3*curiosity blend (0.7*0.8 + 0.3*1 = 0.86).
    const crafter = spawnAgent(h.world, makeGenome({ food: 0.1, material: 0.8 }, { curiosity: 1 }));
    const teacher = spawnAgent(h.world, makeGenome({}, { curiosity: 1, sociability: 1, loyalty: 0.1 }));
    const caretaker = spawnAgent(h.world, makeGenome({}, { curiosity: 0.1, sociability: 1, loyalty: 1 }));

    h.step();

    expect(h.registry).toBeDefined(); // (loners aren't in any community — nothing to look up there)
    const roleOf = (a: Agent): string => a.occupation!.role;
    expect(roleOf(foodGatherer)).toBe("food-gatherer");
    expect(roleOf(materialGatherer)).toBe("material-gatherer");
    expect(roleOf(crafter)).toBe("crafter");
    expect(roleOf(teacher)).toBe("teacher");
    expect(roleOf(caretaker)).toBe("caretaker");

    // Every agent moved OFF "unassigned" exactly once this pass.
    expect(h.events.length).toBe(5);
    for (const e of h.events) {
      const body = e.body as unknown as RoleChangedBody;
      expect(body.oldRole).toBe("unassigned");
      expect(body.communityId).toBeNull();
    }
  });

  it("re-running with nothing changed emits no further ROLE_CHANGED events", () => {
    const h = makeJobsHarness();
    spawnAgent(h.world, makeGenome({ food: 1, material: 0.1 }));
    h.step();
    expect(h.events.length).toBe(1);
    h.step();
    h.step();
    expect(h.events.length).toBe(1); // still just the one, original assignment
  });

  it("a LED community's food shortage nudges a borderline material-leaning member toward food-gatherer", () => {
    const h = makeJobsHarness();
    // Slightly material-leaning: pure aptitude alone picks material-gatherer
    // (material fit 0.6 > food fit 0.5, and clears crafter's blended 0.57).
    const member = spawnAgent(h.world, makeGenome({ food: 0.5, material: 0.6 }));
    const community = h.registry.form([member.id], [], 0);
    member.communityId = community.id;
    community.leaderId = member.id; // a LED community -- demand applies
    community.stockpile[GOOD_FOOD] = 0; // critically short
    community.stockpile[GOOD_MATERIALS] = 50; // ample -- material demand term is 0

    h.step();
    expect(member.occupation!.role).toBe("food-gatherer");
  });

  it("the SAME shortage does nothing before the community has a leader (bootstrap: pure aptitude self-assignment)", () => {
    const h = makeJobsHarness();
    const member = spawnAgent(h.world, makeGenome({ food: 0.5, material: 0.6 }));
    const community = h.registry.form([member.id], [], 0);
    member.communityId = community.id;
    // leaderId left null -- no governance pass has ever run for this community yet.
    community.stockpile[GOOD_FOOD] = 0;
    community.stockpile[GOOD_MATERIALS] = 50;

    h.step();
    expect(member.occupation!.role).toBe("material-gatherer"); // pure aptitude, demand ignored
  });

  it("a material shortage in a LED community symmetrically nudges a borderline food-leaning member toward material-gatherer", () => {
    const h = makeJobsHarness();
    const member = spawnAgent(h.world, makeGenome({ food: 0.6, material: 0.5 }));
    const community = h.registry.form([member.id], [], 0);
    member.communityId = community.id;
    community.leaderId = member.id;
    community.stockpile[GOOD_FOOD] = 50;
    community.stockpile[GOOD_MATERIALS] = 0;

    h.step();
    expect(member.occupation!.role).toBe("material-gatherer");
  });

  it("is periodic: with intervalTicks > 1, assignment only runs on the configured cadence", () => {
    const h = makeJobsHarness({ intervalTicks: 3 });
    const member = spawnAgent(h.world, makeGenome({ food: 1, material: 0.1 }));
    h.step(); // tick 0 -- 0 % 3 === 0, runs immediately
    expect(member.occupation!.role).toBe("food-gatherer");
    expect(h.events.length).toBe(1);
    h.step(); // tick 1 -- no-op
    h.step(); // tick 2 -- no-op
    expect(h.events.length).toBe(1);
  });
});
