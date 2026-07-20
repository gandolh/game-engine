/**
 * Full-sim-level tests for chunk hollow-06b's social-verb DELIBERATION —
 * driven through the REAL `bootstrapHollowSim` loop (mirrors
 * sim-bootstrap.social.test.ts's rationale for hollow-06a: hand-built
 * harnesses in agents/villager.test.ts and social/*.test.ts prove the
 * deliberator/effects in isolation; these prove END-TO-END emergence —
 * verbs actually get CHOSEN by real deliberation in a real run, genome
 * measurably shifts that choice, and the choice has a measurable knock-on
 * effect, all without anything being force-injected. Per the brief, this is
 * exactly where "green tests, inert feature" has bitten this project twice
 * before (peer-interaction dormancy, hazard inertness) — every assertion
 * below reads real `socialCounts`/inventory/skill numbers out of a real run.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions, type BootedHollowSim } from "./sim-bootstrap";
import type { HollowEntity, BehaviorGene } from "./components";
import { GOOD_MATERIALS } from "./economy";
import { SKILL_MATERIAL } from "./social";

type Agent = HollowEntity & { id: number };

function livingIds(sim: BootedHollowSim): number[] {
  const ids: number[] = [];
  for (const e of sim.world.query("agent")) ids.push(e.id!);
  return ids.sort((a, b) => a - b);
}

function findAgent(sim: BootedHollowSim, id: number): Agent {
  for (const e of sim.world.query("agent", "genome", "relationships", "inventory", "skills")) {
    if (e.id === id) return e as Agent;
  }
  throw new Error(`agent ${id} not found`);
}

/** Overwrites EVERY currently-living agent's given behavior genes — builds
 *  a deliberately-skewed cohort for the flip test. Test-only (option (a)
 *  from the brief: "tests directly mutate each agent's genome.behavior[gene]
 *  to build cohorts" — no production change needed). */
function forceCohortGenome(sim: BootedHollowSim, overrides: Partial<Record<BehaviorGene, number>>): void {
  for (const e of sim.world.query("genome")) {
    for (const [gene, value] of Object.entries(overrides)) {
      e.genome.behavior[gene] = value!;
    }
  }
}

const COOPERATIVE_VERBS = ["gift", "share", "help", "teach", "trade"] as const;
const ANTAGONISTIC_VERBS = ["steal", "sabotage", "rumor", "attack"] as const;

function sumVerbs(counts: Readonly<Record<string, number>>, verbs: readonly string[]): number {
  return verbs.reduce((sum, v) => sum + (counts[v] ?? 0), 0);
}

describe("social verbs EMERGE from real deliberation through bootstrapHollowSim (chunk hollow-06b)", () => {
  it("a modest population, run for ~800 ticks, produces BOTH cooperative and antagonistic social counts without any injected intention", () => {
    const sim = bootstrapHollowSim({ seed: 42, ticksPerDay: 20, population: 24 });
    for (let i = 0; i < 800; i++) sim.tick();

    const counts = sim.getSnapshot().socialCounts;
    const cooperative = sumVerbs(counts, COOPERATIVE_VERBS);
    const antagonistic = sumVerbs(counts, ANTAGONISTIC_VERBS);

    expect(cooperative).toBeGreaterThan(0);
    expect(antagonistic).toBeGreaterThan(0);
  });
});

describe("genome measurably drives verb choice — the flip test (chunk hollow-06b)", () => {
  it("an all-aggressive/disloyal cohort produces MORE antagonistic and LESS cooperative activity than an all-loyal/sociable cohort, same seed", () => {
    const opts: HollowSimOptions = { seed: 909, ticksPerDay: 20, population: 24 };

    const aggressive = bootstrapHollowSim(opts);
    forceCohortGenome(aggressive, {
      sociability: 0,
      risk: 1,
      aggression: 1,
      loyalty: 0,
      greed: 1,
      curiosity: 0,
    });

    const loyal = bootstrapHollowSim(opts);
    forceCohortGenome(loyal, {
      sociability: 1,
      risk: 0,
      aggression: 0,
      loyalty: 1,
      greed: 0,
      curiosity: 1,
    });

    const TICKS = 700;
    for (let i = 0; i < TICKS; i++) {
      aggressive.tick();
      loyal.tick();
    }

    const aggressiveCounts = aggressive.getSnapshot().socialCounts;
    const loyalCounts = loyal.getSnapshot().socialCounts;

    const aggressiveAntagonistic = sumVerbs(aggressiveCounts, ANTAGONISTIC_VERBS);
    const loyalAntagonistic = sumVerbs(loyalCounts, ANTAGONISTIC_VERBS);
    const aggressiveCooperative = sumVerbs(aggressiveCounts, COOPERATIVE_VERBS);
    const loyalCooperative = sumVerbs(loyalCounts, COOPERATIVE_VERBS);

    // Concrete numbers surfaced in the report (see this test's console output
    // via the assertions below failing with a useful diff if this regresses).
    expect(aggressiveAntagonistic).toBeGreaterThan(loyalAntagonistic);
    expect(loyalCooperative).toBeGreaterThan(aggressiveCooperative);
    // Not just "different" -- genuinely present, not two zeros.
    expect(aggressiveAntagonistic).toBeGreaterThan(0);
    expect(loyalCooperative).toBeGreaterThan(0);
  });
});

describe("cause -> effect through deliberation, end-to-end (chunk hollow-06b)", () => {
  it("a deliberation-chosen sabotage measurably destroys the target's materials and dents its material skill", () => {
    const sim = bootstrapHollowSim({ seed: 5, ticksPerDay: 20, population: 4 });
    const [actorId, targetId] = livingIds(sim);
    const actor = findAgent(sim, actorId!);
    const target = findAgent(sim, targetId!);

    // Co-locate (within SOCIAL_CANDIDATE_RADIUS_TILES) so the target is a
    // reachable candidate -- position only, NOT the intention itself.
    actor.agent!.gx = 10;
    actor.agent!.gy = 10;
    target.agent!.gx = 10;
    target.agent!.gy = 10;

    // Force the ACTOR's genome so sabotage is the clear winner of its OWN
    // deliberation this tick: aggression clears SABOTAGE_AGGRESSION_GATE
    // (0.6) but deliberately stays BELOW rumor's (0.8) and attack's (0.99)
    // stricter gates, so those two don't even compete this tick;
    // greed/loyalty/sociability/curiosity at the floor rule out every
    // OTHER verb's hard gate (see agents/social-verbs.ts) -- genome only,
    // not the chosen intention.
    actor.genome!.behavior["aggression"] = 0.7;
    actor.genome!.behavior["greed"] = 0;
    actor.genome!.behavior["loyalty"] = 0;
    actor.genome!.behavior["sociability"] = 0;
    actor.genome!.behavior["curiosity"] = 0;
    // A firmly low (but not exactly-boundary) trust reading toward the
    // target -- pushes sabotage's distrust factor high without also
    // clearing attack's stricter (and separately gated) very-low-trust
    // floor, so sabotage alone wins this tick's arbitration.
    actor.relationships!.byId.set(targetId!, 0.1);

    // Give the target a real stockpile + skill to damage -- otherwise
    // there's nothing to measurably destroy.
    target.inventory!.goods[GOOD_MATERIALS] = 40;
    target.skills!.byKind[SKILL_MATERIAL] = 0.5;

    const materialsBefore = target.inventory!.goods[GOOD_MATERIALS]!;
    const skillBefore = target.skills!.byKind[SKILL_MATERIAL]!;

    sim.tick(); // PERCEIVE -> DELIBERATE (chooses sabotage) -> ACT (executes it), same tick

    const counts = sim.getSnapshot().socialCounts;
    expect(counts["sabotage"]).toBeGreaterThan(0);

    const targetAfter = findAgent(sim, targetId!);
    expect(targetAfter.inventory!.goods[GOOD_MATERIALS]!).toBeLessThan(materialsBefore);
    expect(targetAfter.skills!.byKind[SKILL_MATERIAL]!).toBeLessThan(skillBefore);
  });

  it("a deliberation-chosen teach measurably raises the learner's material skill", () => {
    const sim = bootstrapHollowSim({ seed: 6, ticksPerDay: 20, population: 4 });
    const [actorId, targetId] = livingIds(sim);
    const actor = findAgent(sim, actorId!);
    const target = findAgent(sim, targetId!);

    actor.agent!.gx = 20;
    actor.agent!.gy = 20;
    target.agent!.gx = 20;
    target.agent!.gy = 20;

    // Force the ACTOR's genome so teach is the clear winner: curiosity
    // clears teach's gate; every OTHER verb's hard gate is floored out
    // (aggression/greed for the antagonistic verbs, sociability/loyalty for
    // gift/share/help_labor) -- genome + skill state only, not the intention.
    actor.genome!.behavior["curiosity"] = 1;
    actor.genome!.behavior["sociability"] = 0;
    actor.genome!.behavior["aggression"] = 0;
    actor.genome!.behavior["greed"] = 0;
    actor.genome!.behavior["loyalty"] = 0;
    actor.skills!.byKind[SKILL_MATERIAL] = 1;
    actor.genome!.aptitude[SKILL_MATERIAL] = 1;

    target.skills!.byKind[SKILL_MATERIAL] = 0.1;
    target.genome!.aptitude[SKILL_MATERIAL] = 1; // no artificial cap blocking the rise

    const learnerSkillBefore = target.skills!.byKind[SKILL_MATERIAL]!;

    sim.tick();

    const counts = sim.getSnapshot().socialCounts;
    expect(counts["teach"]).toBeGreaterThan(0);

    const targetAfter = findAgent(sim, targetId!);
    expect(targetAfter.skills!.byKind[SKILL_MATERIAL]!).toBeGreaterThan(learnerSkillBefore);
  });
});

describe("determinism (chunk hollow-06b's social deliberation)", () => {
  it("two bootstrapHollowSim runs with the same seed + options produce identical snapshots (incl. socialCounts) and relationship ledgers", () => {
    const opts: HollowSimOptions = { seed: 606, ticksPerDay: 20, population: 20 };
    const a = bootstrapHollowSim(opts);
    const b = bootstrapHollowSim(opts);

    const TICKS = 500;
    for (let i = 0; i < TICKS; i++) {
      a.tick();
      b.tick();
      if (i % 47 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());

    // Relationship ledgers aren't in the snapshot -- compare them directly.
    const idsA = livingIds(a);
    const idsB = livingIds(b);
    expect(idsA).toEqual(idsB);
    for (const id of idsA) {
      const ra = [...findAgent(a, id).relationships!.byId.entries()].sort();
      const rb = [...findAgent(b, id).relationships!.byId.entries()].sort();
      expect(ra).toEqual(rb);
    }

    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
