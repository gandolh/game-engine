/**
 * Determinism proofs for `applyPersonaSeed` (chunk hollow-11a). These are
 * the sim-core-side acceptance tests the brief calls "the whole point":
 * same seed + same `PersonaSeed` must roll byte-identical founder genomes,
 * locked genes must hold their authored value exactly, archetype counts
 * must produce the right population composition, and applying a persona
 * seed must NOT perturb any OTHER system's `Rng` draw order (positions,
 * decay-rate jitter, ...).
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "../sim-bootstrap";
import { applyPersonaSeed, personaSeedToSimOptions, expandArchetypes } from "./apply";
import type { PersonaSeed } from "./types";
import { ARCHETYPE_PRESETS } from "./presets";
import type { HollowEntity } from "../components";

const BASE_OPTS: HollowSimOptions = { seed: 0xf00d, ticksPerDay: 20, population: 4 };

function sortedFounders(sim: ReturnType<typeof bootstrapHollowSim>) {
  return [...sim.world.query("genome")].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

function genomeSnapshot(founders: ReadonlyArray<{ genome: NonNullable<HollowEntity["genome"]> }>) {
  return founders.map((f) => ({
    behavior: { ...f.genome.behavior },
    aptitude: { ...f.genome.aptitude },
    appearance: { ...f.genome.appearance },
  }));
}

describe("applyPersonaSeed — determinism (chunk hollow-11a)", () => {
  it("same seed + same PersonaSeed roll byte-identical founder genomes across two independent bootstraps", () => {
    const seed: PersonaSeed = {
      archetypes: [
        { preset: "cooperator", count: 2 },
        { preset: "opportunist", count: 2 },
      ],
    };

    const simA = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(simA, seed);
    const simB = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(simB, seed);

    expect(genomeSnapshot(sortedFounders(simA))).toEqual(genomeSnapshot(sortedFounders(simB)));
  });

  it("archetype counts produce the right population composition (cooperator vs opportunist trait skew)", () => {
    const seed: PersonaSeed = {
      archetypes: [
        { preset: "cooperator", count: 2 },
        { preset: "opportunist", count: 2 },
      ],
    };
    const sim = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(sim, seed);
    const founders = sortedFounders(sim);
    expect(founders).toHaveLength(4);

    const cooperatorTemplate = ARCHETYPE_PRESETS["cooperator"]!.behavior;
    const opportunistTemplate = ARCHETYPE_PRESETS["opportunist"]!.behavior;

    // Founders 0-1: cooperator — high loyalty/sociability, low greed/aggression.
    for (const f of founders.slice(0, 2)) {
      expect(f.genome.behavior["loyalty"]).toBeGreaterThan(cooperatorTemplate.loyalty! - 0.15);
      expect(f.genome.behavior["sociability"]).toBeGreaterThan(cooperatorTemplate.sociability! - 0.15);
      expect(f.genome.behavior["greed"]).toBeLessThan(cooperatorTemplate.greed! + 0.15);
    }
    // Founders 2-3: opportunist — high greed/risk.
    for (const f of founders.slice(2, 4)) {
      expect(f.genome.behavior["greed"]).toBeGreaterThan(opportunistTemplate.greed! - 0.15);
      expect(f.genome.behavior["risk"]).toBeGreaterThan(opportunistTemplate.risk! - 0.15);
    }
  });

  it("locked genes hold their authored value EXACTLY; unlocked genes vary from the template but are identical across two runs", () => {
    const seed: PersonaSeed = {
      archetypes: [
        {
          preset: "cooperator",
          count: 2,
          overrides: { behavior: { loyalty: 0.99 }, lock: ["loyalty"] },
        },
      ],
    };
    // population MUST match the archetype total (2) — otherwise the extra
    // founders are left untouched (natural randomGenome), which is a
    // deliberate, separately-tested behavior (see "archetype counts..."
    // above), not what THIS test is proving.
    const opts: HollowSimOptions = { seed: 0xf00d, ticksPerDay: 20, population: 2 };
    const simA = bootstrapHollowSim(opts);
    applyPersonaSeed(simA, seed);
    const simB = bootstrapHollowSim(opts);
    applyPersonaSeed(simB, seed);

    const foundersA = sortedFounders(simA);
    const foundersB = sortedFounders(simB);

    for (const f of [...foundersA, ...foundersB]) {
      expect(f.genome.behavior["loyalty"]).toBe(0.99); // locked, exact, no roll
    }
    // Unlocked genes (e.g. sociability) are identical ACROSS runs (fork-deterministic) ...
    expect(foundersA[0]!.genome.behavior["sociability"]).toBe(foundersB[0]!.genome.behavior["sociability"]);
    expect(foundersA[1]!.genome.behavior["sociability"]).toBe(foundersB[1]!.genome.behavior["sociability"]);
    // ... but the two founders (rolled independently, same fork stream advancing)
    // aren't forced to the same value as each other.
    expect(foundersA[0]!.genome.behavior["sociability"]).not.toBe(foundersA[1]!.genome.behavior["sociability"]);
  });

  it("a legacy-only seed (founderGenomeBias/founders) still applies with v1's exact no-Rng-draw semantics", () => {
    const seed: PersonaSeed = {
      founderGenomeBias: { aggression: 0.9 },
      founders: [{ behavior: { curiosity: 0.95 } }],
    };
    const sim = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(sim, seed);
    const founders = sortedFounders(sim);
    for (const f of founders) expect(f.genome.behavior["aggression"]).toBe(0.9);
    expect(founders[0]!.genome.behavior["curiosity"]).toBe(0.95);
  });

  it("does NOT perturb any other system's draw order — positions and need-decay jitter are unaffected", () => {
    const simPlain = bootstrapHollowSim(BASE_OPTS);
    const simPersona = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(simPersona, {
      archetypes: [{ preset: "loner", count: 4 }],
    });

    const plainFounders = [...simPlain.world.query("agent", "needs")].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const personaFounders = [...simPersona.world.query("agent", "needs")].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    expect(personaFounders.map((f) => ({ gx: f.agent.gx, gy: f.agent.gy }))).toEqual(
      plainFounders.map((f) => ({ gx: f.agent.gx, gy: f.agent.gy })),
    );
    expect(personaFounders.map((f) => f.needs.byKind["food"]!.decayPerTick)).toEqual(
      plainFounders.map((f) => f.needs.byKind["food"]!.decayPerTick),
    );
  });

  it("two runs with the SAME persona-seed produce identical snapshots after ticking (advances deterministically)", () => {
    const seed: PersonaSeed = {
      archetypes: [
        { preset: "nurturer", count: 2 },
        { preset: "hoarder", count: 2 },
      ],
    };
    const simA = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(simA, seed);
    const simB = bootstrapHollowSim(BASE_OPTS);
    applyPersonaSeed(simB, seed);

    for (let i = 0; i < 200; i++) {
      simA.tick();
      simB.tick();
    }
    expect(JSON.stringify(simA.getSnapshot())).toBe(JSON.stringify(simB.getSnapshot()));
  });

  it("expandArchetypes flattens in array order and rejects an unknown preset", () => {
    const expanded = expandArchetypes({
      archetypes: [
        { preset: "cooperator", count: 2 },
        { preset: "loner", count: 1 },
      ],
    });
    expect(expanded.map((e) => e.preset.label)).toEqual(["Cooperator", "Cooperator", "Loner"]);
    expect(() => expandArchetypes({ archetypes: [{ preset: "nope", count: 1 }] })).toThrow(/unknown archetype preset/);
  });

  it("personaSeedToSimOptions maps seed/density fields and derives population from archetype counts", () => {
    const opts = personaSeedToSimOptions({
      seed: 42,
      foodNodeCount: 5,
      archetypes: [
        { preset: "cooperator", count: 3 },
        { preset: "loner", count: 2 },
      ],
    });
    expect(opts).toEqual({ seed: 42, population: 5, foodNodeCount: 5 });

    // exactOptionalPropertyTypes guard: an entirely-empty seed produces an
    // entirely-empty partial (no explicit `undefined` keys).
    expect(personaSeedToSimOptions({})).toEqual({});
  });
});
