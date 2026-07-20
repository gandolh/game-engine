import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import type { Genome } from "../components";
import { BEHAVIOR_GENES, APTITUDE_SKILLS, SKIN_TONE_ROLES, HAIR_TONE_ROLES } from "../components";
import { crossoverGenomes, randomGenome } from "./genetics";
import { MUTATION_STEP_BOUND } from "./constants";

function makeGenome(
  behaviorValue: number,
  aptitudeValue: number,
  height: number,
  build: number,
  skinTone: (typeof SKIN_TONE_ROLES)[number],
  hairTone: (typeof HAIR_TONE_ROLES)[number],
): Genome {
  const behavior: Record<string, number> = {};
  for (const gene of BEHAVIOR_GENES) behavior[gene] = behaviorValue;
  const aptitude: Record<string, number> = {};
  for (const skill of APTITUDE_SKILLS) aptitude[skill] = aptitudeValue;
  return { behavior, aptitude, appearance: { height, build, skinTone, hairTone } };
}

describe("crossoverGenomes — heritability (chunk hollow-05)", () => {
  const parentA = makeGenome(0.2, 0.3, 0.9, 0.9, "skin", "hairBlack");
  const parentB = makeGenome(0.8, 0.7, 1.1, 1.1, "skinDeep", "hairRed");

  it("every continuous gene lies within [min(parentA,parentB) - mutationBound, max(parentA,parentB) + mutationBound]", () => {
    for (let seed = 0; seed < 20; seed++) {
      const child = crossoverGenomes(parentA, parentB, createRng(seed));

      for (const gene of BEHAVIOR_GENES) {
        const lo = Math.min(parentA.behavior[gene]!, parentB.behavior[gene]!) - MUTATION_STEP_BOUND;
        const hi = Math.max(parentA.behavior[gene]!, parentB.behavior[gene]!) + MUTATION_STEP_BOUND;
        expect(child.behavior[gene]!).toBeGreaterThanOrEqual(lo);
        expect(child.behavior[gene]!).toBeLessThanOrEqual(hi);
      }
      for (const skill of APTITUDE_SKILLS) {
        const lo = Math.min(parentA.aptitude[skill]!, parentB.aptitude[skill]!) - MUTATION_STEP_BOUND;
        const hi = Math.max(parentA.aptitude[skill]!, parentB.aptitude[skill]!) + MUTATION_STEP_BOUND;
        expect(child.aptitude[skill]!).toBeGreaterThanOrEqual(lo);
        expect(child.aptitude[skill]!).toBeLessThanOrEqual(hi);
      }
      const heightLo = Math.min(parentA.appearance.height, parentB.appearance.height) - MUTATION_STEP_BOUND;
      const heightHi = Math.max(parentA.appearance.height, parentB.appearance.height) + MUTATION_STEP_BOUND;
      expect(child.appearance.height).toBeGreaterThanOrEqual(heightLo);
      expect(child.appearance.height).toBeLessThanOrEqual(heightHi);

      const buildLo = Math.min(parentA.appearance.build, parentB.appearance.build) - MUTATION_STEP_BOUND;
      const buildHi = Math.max(parentA.appearance.build, parentB.appearance.build) + MUTATION_STEP_BOUND;
      expect(child.appearance.build).toBeGreaterThanOrEqual(buildLo);
      expect(child.appearance.build).toBeLessThanOrEqual(buildHi);
    }
  });

  it("categorical genes (skinTone/hairTone) usually equal one parent's value, allowing the rare mutation flip", () => {
    const N = 100;
    let skinMatches = 0;
    let hairMatches = 0;
    for (let seed = 0; seed < N; seed++) {
      const child = crossoverGenomes(parentA, parentB, createRng(seed * 7919 + 1));
      if (child.appearance.skinTone === parentA.appearance.skinTone || child.appearance.skinTone === parentB.appearance.skinTone) {
        skinMatches++;
      }
      if (child.appearance.hairTone === parentA.appearance.hairTone || child.appearance.hairTone === parentB.appearance.hairTone) {
        hairMatches++;
      }
      // Always a valid role from the palette-role arrays, mutation or not.
      expect(SKIN_TONE_ROLES).toContain(child.appearance.skinTone);
      expect(HAIR_TONE_ROLES).toContain(child.appearance.hairTone);
    }
    // MUTATION_ROLE_FLIP_PROBABILITY is small (0.05) -- the vast majority
    // should match a parent; a generous 0.8 floor absorbs sampling noise
    // without being so loose it'd pass if crossover were broken (e.g.
    // always returning a random unrelated role).
    expect(skinMatches / N).toBeGreaterThan(0.8);
    expect(hairMatches / N).toBeGreaterThan(0.8);
  });

  it("is deterministic: same Rng seed -> identical child genome", () => {
    const childA = crossoverGenomes(parentA, parentB, createRng(555));
    const childB = crossoverGenomes(parentA, parentB, createRng(555));
    expect(childA).toEqual(childB);
  });

  it("two different Rng seeds usually produce genuinely different children (real crossover, not a constant)", () => {
    const childA = crossoverGenomes(parentA, parentB, createRng(1));
    const childB = crossoverGenomes(parentA, parentB, createRng(2));
    expect(childA).not.toEqual(childB);
  });
});

describe("randomGenome — founder seeding", () => {
  it("draws every gene within its documented range, in a fixed deterministic order", () => {
    const genome = randomGenome(createRng(42));
    for (const gene of BEHAVIOR_GENES) {
      expect(genome.behavior[gene]).toBeGreaterThanOrEqual(0);
      expect(genome.behavior[gene]).toBeLessThanOrEqual(1);
    }
    for (const skill of APTITUDE_SKILLS) {
      expect(genome.aptitude[skill]).toBeGreaterThanOrEqual(0);
      expect(genome.aptitude[skill]).toBeLessThanOrEqual(1);
    }
    expect(SKIN_TONE_ROLES).toContain(genome.appearance.skinTone);
    expect(HAIR_TONE_ROLES).toContain(genome.appearance.hairTone);
  });

  it("is deterministic: same seed -> identical genome", () => {
    expect(randomGenome(createRng(9))).toEqual(randomGenome(createRng(9)));
  });
});
