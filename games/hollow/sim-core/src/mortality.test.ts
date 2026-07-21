import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng, type SimContext } from "@engine/core";
import { bootstrapHollowSim } from "./sim-bootstrap";
import type { HollowEntity } from "./components";
import { makeCorpse, makeDisease } from "./components";
import {
  HollowDiseaseSystem,
  HollowCorpseSystem,
  HollowCareActSystem,
  daysToTicks,
  isDayBoundary,
} from "./mortality";
import { GRAVEYARD_TILE } from "./world";
import { ONT_FAMILY, ONT_MORTALITY } from "./protocols";

const ctxAt = (tick: number): SimContext => ({ tick });

/** Minimal living agent for the system-level tests (only the components each
 *  system actually queries). */
function spawnAgent(
  world: World<HollowEntity>,
  id: number,
  gx: number,
  gy: number,
  extra: Partial<HollowEntity> = {},
): HollowEntity {
  return world.spawn({
    id,
    agent: { gx, gy, moveTarget: null },
    beliefs: { data: {}, revision: 0 },
    ...extra,
  } as HollowEntity);
}

describe("day helpers (chunk hollow-15)", () => {
  it("daysToTicks scales by ticksPerDay and is defensive on a degenerate day length", () => {
    expect(daysToTicks(3, 20)).toBe(60);
    expect(daysToTicks(5, 200)).toBe(1000);
    expect(daysToTicks(3, 0)).toBe(0);
    expect(daysToTicks(3, Number.NaN)).toBe(0);
  });
  it("isDayBoundary fires on multiples of ticksPerDay, never tick 0", () => {
    expect(isDayBoundary(0, 20)).toBe(false);
    expect(isDayBoundary(20, 20)).toBe(true);
    expect(isDayBoundary(21, 20)).toBe(false);
    expect(isDayBoundary(40, 20)).toBe(true);
  });
});

describe("HollowCorpseSystem — rot + disease spread (chunk hollow-15)", () => {
  it("an unburied corpse starts rotting once past the rot delay", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const corpse = world.spawn({ id: 500, corpse: makeCorpse(9, 0, 5, 5) } as HollowEntity);
    const sys = new HollowCorpseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      rotDelayDays: 1, // 20 ticks
      infectProbPerTick: 0, // isolate the rot check
    });
    sys.run(ctxAt(10)); // before the delay
    expect(corpse.corpse!.rotting).toBe(false);
    sys.run(ctxAt(20)); // at the delay
    expect(corpse.corpse!.rotting).toBe(true);
  });

  it("a rotting corpse infects a nearby uninfected agent (forced prob=1), but not one out of range", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    world.spawn({ id: 500, corpse: { ...makeCorpse(9, 0, 5, 5), rotting: true } } as HollowEntity);
    const near = spawnAgent(world, 1, 6, 6); // Chebyshev 1 — in range
    const far = spawnAgent(world, 2, 40, 40); // far away
    const infected: number[] = [];
    bus.subscribeOntology(ONT_MORTALITY.INFECTED, (m) => infected.push(m.body.agentId as number));

    const sys = new HollowCorpseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      spreadRadius: 3,
      infectProbPerTick: 1, // deterministic infect
    });
    sys.run(ctxAt(100));
    bus.flush();
    bus.notifySubscribers();

    expect(near.disease).toBeDefined();
    expect(far.disease).toBeUndefined();
    expect(infected).toEqual([1]);
  });

  it("a carried corpse follows its carrier and does NOT spread disease", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const carrier = spawnAgent(world, 2, 30, 30); // live grave-digger, elsewhere
    const corpse = world.spawn({
      id: 500,
      corpse: { ...makeCorpse(9, 0, 5, 5), rotting: true, carriedBy: 2 },
    } as HollowEntity);
    const victim = spawnAgent(world, 1, 5, 5); // still standing where the body fell
    const sys = new HollowCorpseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      infectProbPerTick: 1,
    });
    sys.run(ctxAt(100));
    // The body tracked the carrier's tile...
    expect(corpse.corpse!.gx).toBe(carrier.agent!.gx);
    expect(corpse.corpse!.gy).toBe(carrier.agent!.gy);
    // ...and being carried, it infected nobody (not even the victim on its
    // original tile).
    expect(victim.disease).toBeUndefined();
  });

  it("a carried corpse whose carrier has vanished is dropped where it lies", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const corpse = world.spawn({
      id: 500,
      corpse: { ...makeCorpse(9, 0, 5, 5), carriedBy: 999 }, // no live agent 999
    } as HollowEntity);
    const sys = new HollowCorpseSystem(world, bus, createRng(1), { ticksPerDay: 20, infectProbPerTick: 0 });
    sys.run(ctxAt(100));
    expect(corpse.corpse!.carriedBy).toBeNull();
  });
});

describe("HollowDiseaseSystem — daily mortality + recovery (chunk hollow-15)", () => {
  it("only acts on an in-game-day boundary", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const a = spawnAgent(world, 1, 0, 0, { disease: makeDisease(0) });
    const sys = new HollowDiseaseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      mortalityProbPerDay: 1,
    });
    sys.run(ctxAt(7)); // not a boundary
    expect(a.beliefs!.data.pendingDeathCause).toBeUndefined();
  });

  it("a forced-lethal roll flags a disease death for LIFECYCLE to pick up", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const a = spawnAgent(world, 1, 0, 0, { disease: makeDisease(0) });
    const sys = new HollowDiseaseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      mortalityProbPerDay: 1,
    });
    sys.run(ctxAt(20));
    expect(a.beliefs!.data.pendingDeathCause).toBe("disease");
  });

  it("a survivor recovers on its own after the self-recovery days", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const a = spawnAgent(world, 1, 0, 0, { disease: { infectedTick: 0, sickDays: 4, treated: false } });
    const recovered: number[] = [];
    bus.subscribeOntology(ONT_MORTALITY.RECOVERED, (m) => recovered.push(m.body.agentId as number));
    const sys = new HollowDiseaseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      mortalityProbPerDay: 0, // survives
      selfRecoveryDays: 5,
      medicRecoveryDays: 2,
    });
    sys.run(ctxAt(20)); // sickDays 4 -> 5 >= 5 -> recovers
    bus.flush();
    bus.notifySubscribers();
    expect(a.disease).toBeUndefined();
    expect(recovered).toEqual([1]);
  });

  it("a medic-treated patient recovers in the shorter medic window (2 days, not 5)", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    // treated, 1 day sick so far.
    const a = spawnAgent(world, 1, 0, 0, { disease: { infectedTick: 0, sickDays: 1, treated: true } });
    const sys = new HollowDiseaseSystem(world, bus, createRng(1), {
      ticksPerDay: 20,
      mortalityProbPerDay: 0,
      selfRecoveryDays: 5,
      medicRecoveryDays: 2,
    });
    sys.run(ctxAt(20)); // sickDays 1 -> 2 >= 2 (treated target) -> recovers
    expect(a.disease).toBeUndefined();
  });
});

describe("HollowCareActSystem — grave-digger + medic (chunk hollow-15)", () => {
  function digger(world: World<HollowEntity>, id: number, gx: number, gy: number, intention: { kind: string; data: Record<string, unknown> }, carrying: number | null = null): HollowEntity {
    return world.spawn({
      id,
      agent: { gx, gy, moveTarget: null, carryingCorpseId: carrying },
      fsm: { current: "ACT", enteredTick: 0 },
      intentions: { queue: [{ ...intention, priority: 40 }] },
      beliefs: { data: {}, revision: 0 },
    } as HollowEntity);
  }

  it("collect_corpse picks up an adjacent, unburied, un-carried body", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const corpse = world.spawn({ id: 500, corpse: makeCorpse(9, 0, 5, 5) } as HollowEntity);
    const d = digger(world, 1, 5, 5, { kind: "collect_corpse", data: { corpseId: 500 } });
    const sys = new HollowCareActSystem(world, bus, { ticksPerDay: 20 });
    sys.run(ctxAt(1));
    expect(corpse.corpse!.carriedBy).toBe(1);
    expect(d.agent!.carryingCorpseId).toBe(500);
    expect(d.intentions!.queue.length).toBe(0); // intention consumed
  });

  it("bury_corpse at the graveyard despawns the body and emits BURIED", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    world.spawn({ id: 500, corpse: { ...makeCorpse(9, 0, 5, 5), carriedBy: 1 } } as HollowEntity);
    const d = digger(world, 1, GRAVEYARD_TILE.gx, GRAVEYARD_TILE.gy, { kind: "bury_corpse", data: {} }, 500);
    const buried: number[] = [];
    bus.subscribeOntology(ONT_MORTALITY.BURIED, (m) => buried.push(m.body.corpseId as number));
    const sys = new HollowCareActSystem(world, bus, { ticksPerDay: 20 });
    sys.run(ctxAt(1));
    bus.flush();
    bus.notifySubscribers();
    expect([...world.query("corpse")].length).toBe(0);
    expect(d.agent!.carryingCorpseId).toBeNull();
    expect(buried).toEqual([500]);
  });

  it("a medic treats up to the daily cap, and a further patient that day is not treated", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    // Three patients adjacent to the medic, all sick + untreated.
    const p1 = spawnAgent(world, 11, 5, 5, { disease: makeDisease(0) });
    const p2 = spawnAgent(world, 12, 5, 5, { disease: makeDisease(0) });
    const p3 = spawnAgent(world, 13, 5, 5, { disease: makeDisease(0) });
    const p4 = spawnAgent(world, 14, 5, 5, { disease: makeDisease(0) });
    const medic = world.spawn({
      id: 1,
      agent: { gx: 5, gy: 5, moveTarget: null },
      fsm: { current: "ACT", enteredTick: 0 },
      intentions: { queue: [] },
      beliefs: { data: {}, revision: 0 },
    } as HollowEntity);
    const sys = new HollowCareActSystem(world, bus, { ticksPerDay: 20, medicMaxTreatmentsPerDay: 3 });

    // Feed one treat intention per patient across four ticks of the SAME day.
    for (const p of [p1, p2, p3, p4]) {
      medic.intentions!.queue = [{ kind: "treat", data: { patientId: p.id }, priority: 40 }];
      medic.fsm!.current = "ACT";
      sys.run(ctxAt(1)); // dayOfRun 0 for all four
    }

    expect(p1.disease!.treated).toBe(true);
    expect(p2.disease!.treated).toBe(true);
    expect(p3.disease!.treated).toBe(true);
    expect(p4.disease!.treated).toBe(false); // 4th exceeds the daily cap
    expect(medic.agent!.medicTreatsToday).toBe(3);
  });
});

describe("integration — starvation death spawns a corpse (chunk hollow-15)", () => {
  it("a foodless town suffers 3-day starvation deaths, each leaving a corpse in the world", () => {
    const sim = bootstrapHollowSim({ seed: 5, ticksPerDay: 20, population: 8, foodNodeCount: 0, materialNodeCount: 2 });
    const causes: string[] = [];
    sim.bus.subscribeOntology(ONT_FAMILY.DEATH, (m) => causes.push(m.body.cause as string));
    for (let i = 0; i < 400; i++) sim.tick();

    expect(causes.filter((c) => c === "starvation").length).toBeGreaterThan(0);
    const snap = sim.getSnapshot();
    expect(snap.diedCount).toBeGreaterThan(0);
    // Every death leaves a body; with no grave-digger emerging in a tiny
    // foodless town, the corpses accumulate in the world (unburied).
    expect(snap.corpses!.length).toBeGreaterThan(0);
    expect(snap.graveyard).toEqual({ gx: GRAVEYARD_TILE.gx, gy: GRAVEYARD_TILE.gy });
  });
});

describe("determinism — the new forks don't break byte-identity (chunk hollow-15)", () => {
  it("byte-identical snapshot sequences for the same seed over a mortality-heavy run", () => {
    const a = bootstrapHollowSim({ seed: 5, ticksPerDay: 20, population: 8, foodNodeCount: 0 });
    const b = bootstrapHollowSim({ seed: 5, ticksPerDay: 20, population: 8, foodNodeCount: 0 });
    for (let i = 0; i < 300; i++) {
      a.tick();
      b.tick();
      if (i % 29 === 0) {
        expect(JSON.stringify(a.getSnapshot())).toBe(JSON.stringify(b.getSnapshot()));
      }
    }
    expect(JSON.stringify(a.getSnapshot())).toBe(JSON.stringify(b.getSnapshot()));
  });
});
