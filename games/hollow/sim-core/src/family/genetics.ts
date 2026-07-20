/**
 * Genetics — draws a founder's genome from scratch (`randomGenome`,
 * population.ts) or a child's genome by crossover+mutation of both parents
 * (`crossoverGenomes`, family/reproduction-system.ts).
 *
 * Determinism: both functions draw from a caller-supplied `Rng` in a FIXED
 * order (BEHAVIOR_GENES, then APTITUDE_SKILLS, then height, build,
 * skinTone, hairTone — always that order, components/genome.ts's const
 * arrays) so two calls with the same `Rng` state produce byte-identical
 * genomes regardless of caller.
 */
import type { Rng } from "@engine/core";
import {
  BEHAVIOR_GENES,
  APTITUDE_SKILLS,
  GENE_MIN,
  GENE_MAX,
  APPEARANCE_HEIGHT_MIN,
  APPEARANCE_HEIGHT_MAX,
  APPEARANCE_BUILD_MIN,
  APPEARANCE_BUILD_MAX,
  SKIN_TONE_ROLES,
  HAIR_TONE_ROLES,
  type Genome,
  type Appearance,
} from "../components";
import { MUTATION_STEP_BOUND, MUTATION_ROLE_FLIP_PROBABILITY } from "./constants";

/** A fresh, uniformly-random genome — used only for FOUNDERS (population.ts).
 *  Children always go through `crossoverGenomes` instead. */
export function randomGenome(rng: Rng): Genome {
  const behavior: Record<string, number> = {};
  for (const gene of BEHAVIOR_GENES) behavior[gene] = rng.range(GENE_MIN, GENE_MAX);

  const aptitude: Record<string, number> = {};
  for (const skill of APTITUDE_SKILLS) aptitude[skill] = rng.range(GENE_MIN, GENE_MAX);

  const appearance: Appearance = {
    height: rng.range(APPEARANCE_HEIGHT_MIN, APPEARANCE_HEIGHT_MAX),
    build: rng.range(APPEARANCE_BUILD_MIN, APPEARANCE_BUILD_MAX),
    skinTone: rng.pick(SKIN_TONE_ROLES),
    hairTone: rng.pick(HAIR_TONE_ROLES),
  };

  return { behavior, aptitude, appearance };
}

/** Per-gene blend of two parent values (random weight, so the child isn't
 *  always exactly the midpoint) plus a small bounded mutation step, clamped
 *  to [min, max]. */
function blendContinuousGene(a: number, b: number, rng: Rng, min: number, max: number): number {
  const w = rng.nextFloat();
  const blended = a * w + b * (1 - w);
  const mutated = blended + rng.range(-MUTATION_STEP_BOUND, MUTATION_STEP_BOUND);
  return Math.max(min, Math.min(max, mutated));
}

/** Picks one parent's categorical value (50/50), with a rare mutation
 *  role-flip to a DIFFERENT role from `roles`. */
function pickCategoricalGene<T extends string>(a: T, b: T, roles: readonly T[], rng: Rng): T {
  const picked = rng.nextFloat() < 0.5 ? a : b;
  if (rng.nextFloat() < MUTATION_ROLE_FLIP_PROBABILITY) {
    const others = roles.filter((r) => r !== picked);
    if (others.length > 0) return rng.pick(others);
  }
  return picked;
}

/** Crossover + mutation of two parent genomes into a child genome — see
 *  this file's header for the determinism/draw-order note. */
export function crossoverGenomes(parentA: Genome, parentB: Genome, rng: Rng): Genome {
  const behavior: Record<string, number> = {};
  for (const gene of BEHAVIOR_GENES) {
    behavior[gene] = blendContinuousGene(
      parentA.behavior[gene] ?? GENE_MIN,
      parentB.behavior[gene] ?? GENE_MIN,
      rng,
      GENE_MIN,
      GENE_MAX,
    );
  }

  const aptitude: Record<string, number> = {};
  for (const skill of APTITUDE_SKILLS) {
    aptitude[skill] = blendContinuousGene(
      parentA.aptitude[skill] ?? GENE_MIN,
      parentB.aptitude[skill] ?? GENE_MIN,
      rng,
      GENE_MIN,
      GENE_MAX,
    );
  }

  const appearance: Appearance = {
    height: blendContinuousGene(
      parentA.appearance.height,
      parentB.appearance.height,
      rng,
      APPEARANCE_HEIGHT_MIN,
      APPEARANCE_HEIGHT_MAX,
    ),
    build: blendContinuousGene(
      parentA.appearance.build,
      parentB.appearance.build,
      rng,
      APPEARANCE_BUILD_MIN,
      APPEARANCE_BUILD_MAX,
    ),
    skinTone: pickCategoricalGene(parentA.appearance.skinTone, parentB.appearance.skinTone, SKIN_TONE_ROLES, rng),
    hairTone: pickCategoricalGene(parentA.appearance.hairTone, parentB.appearance.hairTone, HAIR_TONE_ROLES, rng),
  };

  return { behavior, aptitude, appearance };
}
