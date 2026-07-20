/**
 * applyPersonaSeed — pure, deterministic, browser-safe (no `node:fs`/
 * `node:path`/`process` anywhere in this file or its imports).
 *
 * ── determinism contract ────────────────────────────────────────────────
 * Every random roll here draws from `sim.personaRng` — a fork
 * (`rng.fork("persona-authoring")`) carved out UNCONDITIONALLY at bootstrap
 * time (`sim-bootstrap.ts`, right after hollow-06a's steal-detection/attack/
 * sabotage-detection forks — always the SAME fixed point in the root `Rng`'s
 * fork sequence, whether or not a persona seed is ever applied). Because
 * that fork always exists at the same point regardless of use, calling (or
 * not calling) `applyPersonaSeed` never shifts any OTHER system's draw
 * order — the "persona non-perturbation" property the brief requires.
 *
 * Draw order (fixed, mirrors `family/genetics.ts`'s `randomGenome`): for
 * each founder in the expanded archetype list (`archetypes[0]`'s copies,
 * then `archetypes[1]`'s, ...), in ASCENDING founder-id order:
 * `BEHAVIOR_GENES` (in that const array's order), then `APTITUDE_SKILLS`,
 * then appearance (height, build, skinTone, hairTone) — always that order.
 * A LOCKED gene consumes NO draw (a direct clamp-set, like the legacy
 * overlay below); every UNLOCKED gene consumes exactly one `rng.range`/
 * `rng.pick` call, whether or not the preset/override supplies a base value
 * to roll around — so the draw count for a given `PersonaSeed` depends only
 * on which genes are locked, never on which branch fires, which is what
 * makes two independent bootstraps of the same seed+`PersonaSeed` produce
 * byte-identical unlocked-gene rolls.
 *
 * ── mutate in place, never replace ──────────────────────────────────────
 * `rollFounderGenomeInto` writes onto the founder's EXISTING `Genome` object
 * field-by-field rather than assigning a fresh object to `founder.genome` —
 * `LineageRegistry.record` (lineage/registry.ts) is handed that SAME object
 * reference at spawn time (population.ts) and keeps it forever; replacing
 * the reference here would leave the permanent lineage record holding the
 * founder's original random genome instead of its authored one.
 */
import type { Rng } from "@engine/core";
import {
  GENE_MIN,
  GENE_MAX,
  BEHAVIOR_GENES,
  APTITUDE_SKILLS,
  APPEARANCE_HEIGHT_MIN,
  APPEARANCE_HEIGHT_MAX,
  APPEARANCE_BUILD_MIN,
  APPEARANCE_BUILD_MAX,
  SKIN_TONE_ROLES,
  HAIR_TONE_ROLES,
  type Genome,
} from "../components";
import type { BootedHollowSim, HollowSimOptions } from "../sim-bootstrap";
import type { PersonaSeed, GeneOverrides } from "./types";
import { ARCHETYPE_PRESETS, DEFAULT_GENE_VARIANCE, DEFAULT_APPEARANCE_VARIANCE, type ArchetypePreset } from "./presets";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** One UNLOCKED continuous-gene roll — always exactly one `rng.range` call.
 *  `authored` (override, else template) is the center to roll around; if
 *  neither is given, rolls fully random across `[min, max]` (mirrors
 *  `randomGenome`'s own unauthored draw). */
function rollContinuous(
  templateValue: number | undefined,
  overrideValue: number | undefined,
  variance: number,
  rng: Rng,
  min: number,
  max: number,
): number {
  const authored = overrideValue ?? templateValue;
  if (authored !== undefined) return clamp(authored + rng.range(-variance, variance), min, max);
  return rng.range(min, max);
}

/** A LOCKED gene's value — the override if given, else the preset template,
 *  else the range's midpoint (a documented fallback for the edge case of
 *  locking a gene neither the preset nor the override actually authors). No
 *  `Rng` draw. */
function lockedValue(
  templateValue: number | undefined,
  overrideValue: number | undefined,
  min: number,
  max: number,
): number {
  const authored = overrideValue ?? templateValue;
  return clamp(authored ?? (min + max) / 2, min, max);
}

/** Categorical (skinTone/hairTone) roll — no variance concept, so an
 *  authored override (locked or not — `lock` is meaningless for a
 *  categorical field once an override is given) applies VERBATIM; only a
 *  fully-unauthored field rolls randomly via `rng.pick`. */
function rollCategorical<T extends string>(overrideValue: T | undefined, roles: readonly T[], rng: Rng): T {
  if (overrideValue !== undefined) return overrideValue;
  return rng.pick(roles);
}

/** Rolls one founder's FULL genome from `preset` + `overrides` directly onto
 *  `target` — see this file's header for why it mutates in place. */
function rollFounderGenomeInto(
  target: Genome,
  preset: ArchetypePreset,
  overrides: GeneOverrides | undefined,
  rng: Rng,
): void {
  const locked = new Set(overrides?.lock ?? []);

  for (const gene of BEHAVIOR_GENES) {
    const templateValue = preset.behavior[gene];
    const overrideValue = overrides?.behavior?.[gene];
    if (locked.has(gene)) {
      target.behavior[gene] = lockedValue(templateValue, overrideValue, GENE_MIN, GENE_MAX);
      continue;
    }
    const variance = preset.variance?.[gene] ?? DEFAULT_GENE_VARIANCE;
    target.behavior[gene] = rollContinuous(templateValue, overrideValue, variance, rng, GENE_MIN, GENE_MAX);
  }

  for (const skill of APTITUDE_SKILLS) {
    const overrideValue = overrides?.aptitude?.[skill];
    if (locked.has(skill)) {
      target.aptitude[skill] = lockedValue(undefined, overrideValue, GENE_MIN, GENE_MAX);
      continue;
    }
    target.aptitude[skill] = rollContinuous(undefined, overrideValue, DEFAULT_GENE_VARIANCE, rng, GENE_MIN, GENE_MAX);
  }

  const appearanceOverride = overrides?.appearance;
  if (locked.has("height")) {
    target.appearance.height = lockedValue(undefined, appearanceOverride?.height, APPEARANCE_HEIGHT_MIN, APPEARANCE_HEIGHT_MAX);
  } else {
    target.appearance.height = rollContinuous(
      undefined,
      appearanceOverride?.height,
      DEFAULT_APPEARANCE_VARIANCE,
      rng,
      APPEARANCE_HEIGHT_MIN,
      APPEARANCE_HEIGHT_MAX,
    );
  }
  if (locked.has("build")) {
    target.appearance.build = lockedValue(undefined, appearanceOverride?.build, APPEARANCE_BUILD_MIN, APPEARANCE_BUILD_MAX);
  } else {
    target.appearance.build = rollContinuous(
      undefined,
      appearanceOverride?.build,
      DEFAULT_APPEARANCE_VARIANCE,
      rng,
      APPEARANCE_BUILD_MIN,
      APPEARANCE_BUILD_MAX,
    );
  }

  target.appearance.skinTone = rollCategorical(appearanceOverride?.skinTone, SKIN_TONE_ROLES, rng);
  target.appearance.hairTone = rollCategorical(appearanceOverride?.hairTone, HAIR_TONE_ROLES, rng);
}

/** Expands `seed.archetypes` into a flat, ordered list — `archetypes[0]`'s
 *  `count` copies first, then `archetypes[1]`'s, ... — assigned to founders
 *  in ASCENDING id order (index for index) by `applyPersonaSeed`. Exported
 *  so 11b's GUI (and tests) can compute "how many founders of which preset"
 *  without duplicating this expansion. */
export function expandArchetypes(
  seed: PersonaSeed,
): { preset: ArchetypePreset; overrides: GeneOverrides | undefined }[] {
  const expanded: { preset: ArchetypePreset; overrides: GeneOverrides | undefined }[] = [];
  for (const entry of seed.archetypes ?? []) {
    const preset = ARCHETYPE_PRESETS[entry.preset];
    if (!preset) throw new Error(`persona: unknown archetype preset "${entry.preset}"`);
    for (let i = 0; i < entry.count; i++) expanded.push({ preset, overrides: entry.overrides });
  }
  return expanded;
}

function clampLegacyGene(value: number): number {
  return clamp(value, GENE_MIN, GENE_MAX);
}

/**
 * Applies `seed` to `sim`'s CURRENT founder population. Call ONCE, right
 * after `bootstrapHollowSim`, before the first `sim.tick()` — same contract
 * as v1. If `seed.archetypes` is absent (a legacy-only or empty seed),
 * founders keep their natural `randomGenome`-drawn behavior except for
 * whatever the legacy `founderGenomeBias`/`founders` overlay below sets.
 */
export function applyPersonaSeed(sim: BootedHollowSim, seed: PersonaSeed): void {
  const founders = [...sim.world.query("genome")].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  const expanded = expandArchetypes(seed);
  if (expanded.length > 0) {
    expanded.forEach((entry, i) => {
      const founder = founders[i];
      // Fewer live founders than archetype entries (population smaller than
      // sum(counts)) — extra entries are silently dropped, see types.ts.
      if (!founder) return;
      rollFounderGenomeInto(founder.genome, entry.preset, entry.overrides, sim.personaRng);
    });
  }

  // --- legacy v1 overlay (backward compat) — direct clamp-set, NO Rng draw,
  // applied AFTER archetypes so an explicit legacy override still wins for
  // any gene both specify (mirrors v1's own founderGenomeBias-then-founders
  // precedence).
  if (seed.founderGenomeBias) {
    for (const founder of founders) {
      for (const [gene, value] of Object.entries(seed.founderGenomeBias)) {
        founder.genome.behavior[gene] = clampLegacyGene(value);
      }
    }
  }
  if (seed.founders) {
    seed.founders.forEach((override, i) => {
      const founder = founders[i];
      if (!founder || !override.behavior) return;
      for (const [gene, value] of Object.entries(override.behavior)) {
        founder.genome.behavior[gene] = clampLegacyGene(value);
      }
    });
  }
}

/**
 * Maps a `PersonaSeed`'s seed/density fields onto `HollowSimOptions`. Built
 * as conditional spreads (not a key-loop) so `exactOptionalPropertyTypes`
 * never sees an explicit `undefined` assigned to an optional field —
 * mirrors `tools/hollow-sim/src/run-core.ts`'s existing spread pattern.
 */
export function personaSeedToSimOptions(seed: PersonaSeed): Partial<HollowSimOptions> {
  const population = seed.population ?? (seed.archetypes ? seed.archetypes.reduce((sum, a) => sum + a.count, 0) : undefined);
  return {
    ...(seed.seed !== undefined ? { seed: seed.seed } : {}),
    ...(population !== undefined ? { population } : {}),
    ...(seed.foodNodeCount !== undefined ? { foodNodeCount: seed.foodNodeCount } : {}),
    ...(seed.foodNodeMaxStock !== undefined ? { foodNodeMaxStock: seed.foodNodeMaxStock } : {}),
    ...(seed.foodNodeRegenPerTick !== undefined ? { foodNodeRegenPerTick: seed.foodNodeRegenPerTick } : {}),
    ...(seed.materialNodeCount !== undefined ? { materialNodeCount: seed.materialNodeCount } : {}),
    ...(seed.materialNodeMaxStock !== undefined ? { materialNodeMaxStock: seed.materialNodeMaxStock } : {}),
    ...(seed.materialNodeRegenPerTick !== undefined ? { materialNodeRegenPerTick: seed.materialNodeRegenPerTick } : {}),
  };
}
