/**
 * Full-sim-level tests for chunk hollow-06a's social-verb wiring, driven
 * through the REAL `bootstrapHollowSim` loop (mirrors
 * sim-bootstrap.family.test.ts's rationale: hand-built harnesses in
 * social/*.test.ts prove each system in isolation; these prove END-TO-END
 * wiring — scheduler order, options threading, and interaction with
 * hollow-05's lifecycle system). Intentions are injected directly (this
 * dispatch does NOT touch deliberation — see the brief) by forcing an
 * agent's `fsm.current` to `"ACT"` with the desired intention as its queue,
 * which keeps `HollowDeliberateSystem` (which only re-plans `"PERCEIVE"`-
 * state agents) from immediately overwriting it.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions, type BootedHollowSim } from "./sim-bootstrap";
import type { HollowEntity } from "./components";
import { GOOD_FOOD } from "./economy";

type Agent = HollowEntity & { id: number };

function findAgent(sim: BootedHollowSim, id: number): Agent {
  for (const e of sim.world.query("agent", "fsm", "intentions", "beliefs", "relationships", "inventory")) {
    if (e.id === id) return e as Agent;
  }
  throw new Error(`agent ${id} not found`);
}

/** Forces `actorId`'s next-tick ACT to execute exactly `intention` by
 *  setting `fsm.current: "ACT"` (so HollowDeliberateSystem, which only
 *  re-plans "PERCEIVE"-state agents, leaves it alone) with `intention` as
 *  the sole queued item. */
function forceIntention(sim: BootedHollowSim, actorId: number, intention: { kind: string; data: Record<string, unknown>; priority: number }): void {
  const agent = findAgent(sim, actorId);
  agent.fsm!.current = "ACT";
  agent.intentions!.queue = [intention];
}

function livingIds(sim: BootedHollowSim): number[] {
  const ids: number[] = [];
  for (const e of sim.world.query("agent")) ids.push(e.id!);
  return ids.sort((a, b) => a - b);
}

describe("social verbs emerge correctly through the real bootstrapHollowSim scheduler (chunk hollow-06a)", () => {
  it("a forced-lethal attack sets violentDeath, and the SAME tick's LIFECYCLE stage kills the target with cause 'violence', recorded in lineage", () => {
    const sim = bootstrapHollowSim({ seed: 11, ticksPerDay: 20, population: 4, attackLethalityProb: 1 });
    const [attackerId, targetId] = livingIds(sim);

    forceIntention(sim, attackerId!, { kind: "attack", data: { targetId }, priority: 1 });
    sim.tick();

    // Same-tick death: ACT (attack) runs before LIFECYCLE in the scheduler
    // order (sim-bootstrap.ts), so the kill lands within this one tick().
    expect(livingIds(sim)).not.toContain(targetId);
    const entry = sim.lineage.all().find((e) => e.id === targetId);
    expect(entry).toBeDefined();
    expect(entry!.deathCause).toBe("violence");
    expect(sim.getSnapshot().diedCount).toBe(1);
  });

  it("a forced-non-lethal attack leaves the target alive, only dropping trust", () => {
    const sim = bootstrapHollowSim({ seed: 12, ticksPerDay: 20, population: 4, attackLethalityProb: 0 });
    const [attackerId, targetId] = livingIds(sim);

    forceIntention(sim, attackerId!, { kind: "attack", data: { targetId }, priority: 1 });
    sim.tick();

    expect(livingIds(sim)).toContain(targetId);
    const target = findAgent(sim, targetId!);
    expect(target.beliefs!.data.violentDeath).toBeUndefined();
    expect(target.relationships!.byId.get(attackerId!)!).toBeLessThan(0.5);
  });
});

describe("determinism (chunk hollow-06a's social verbs)", () => {
  it("two bootstrapHollowSim runs with the same seed + an identical injected verb workload produce identical resulting snapshots/ledgers", () => {
    const opts: HollowSimOptions = { seed: 909, ticksPerDay: 20, population: 6, stealDetectionProb: 0.5, attackLethalityProb: 0.5 };
    const a = bootstrapHollowSim(opts);
    const b = bootstrapHollowSim(opts);

    // Same seed -> identical founding population (ids/positions/genomes),
    // so the SAME injected workload against the SAME agent ids is valid
    // for both sims.
    const [id1, id2, id3] = livingIds(a);
    expect(livingIds(b)).toEqual([id1, id2, id3, ...livingIds(b).slice(3)]);

    findAgent(a, id1!).inventory!.goods[GOOD_FOOD] = 20;
    findAgent(b, id1!).inventory!.goods[GOOD_FOOD] = 20;

    const workload: { kind: string; data: Record<string, unknown>; priority: number }[] = [
      { kind: "gift", data: { targetId: id2, good: GOOD_FOOD, amount: 3 }, priority: 1 },
      { kind: "steal", data: { targetId: id3, good: GOOD_FOOD, amount: 2 }, priority: 1 },
      { kind: "rumor", data: { targetId: id2 }, priority: 1 },
      { kind: "attack", data: { targetId: id3 }, priority: 1 },
      { kind: "teach", data: { targetId: id2, skill: "material" }, priority: 1 },
    ];

    for (let tick = 0; tick < 25; tick++) {
      const verb = workload[tick % workload.length]!;
      forceIntention(a, id1!, verb);
      forceIntention(b, id1!, verb);
      a.tick();
      b.tick();
      if (tick % 7 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }

    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    expect(a.lineage.all()).toEqual(b.lineage.all());
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
