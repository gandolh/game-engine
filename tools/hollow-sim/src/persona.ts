/**
 * PERSONA_SEED — a minimal v1 seam for founder-genome authoring (chunk
 * hollow-07; full authoring UI is M3's job). If `PERSONA_SEED` points at a
 * JSON file, its overrides are applied to the founder population AFTER
 * `bootstrapHollowSim` but BEFORE the first `tick()` — deterministic,
 * because mutating `genome.behavior[gene]` directly consumes no `Rng` draw
 * (nothing else in `@hollow/sim-core` reads a founder's genome before the
 * first tick, so this can't desync any existing draw order).
 *
 * Supported format (both keys optional, and may be combined — `founders`
 * entries are applied AFTER `founderGenomeBias`, so a per-founder override
 * wins over the blanket bias for any gene both specify):
 *
 * ```json
 * {
 *   "founderGenomeBias": { "aggression": 0.9, "loyalty": 0.1 },
 *   "founders": [ { "behavior": { "curiosity": 0.95 } }, {}, { "behavior": { "risk": 0.05 } } ]
 * }
 * ```
 *
 * - `founderGenomeBias`: sets the named `BEHAVIOR_GENES` gene to the given
 *   value (clamped to `[GENE_MIN, GENE_MAX]`) on EVERY founder — a blanket
 *   trait skew for the whole founding population (e.g. "an aggressive,
 *   disloyal founding generation").
 * - `founders`: applies `behavior` overrides to founders in ASCENDING id
 *   order (founder 0 gets `founders[0]`, founder 1 gets `founders[1]`,
 *   ...); an array shorter than the population leaves the remaining
 *   founders unaffected, and a founder with no `behavior` key (or an empty
 *   object) is left as its randomly-drawn genome.
 *
 * If no file is set (or a founder isn't covered by either key), founders
 * keep their natural `randomGenome`-drawn behavior — untouched.
 */
import { readFileSync } from "node:fs";
import { GENE_MAX, GENE_MIN } from "@hollow/sim-core/components";
import type { BootedHollowSim } from "@hollow/sim-core/sim-bootstrap";

export interface FounderOverride {
  behavior?: Record<string, number>;
}

export interface PersonaSeed {
  founderGenomeBias?: Record<string, number>;
  founders?: FounderOverride[];
}

export function loadPersonaSeed(path: string): PersonaSeed {
  const raw = readFileSync(path, "utf8");
  // Parsed straight from disk — an author-facing JSON file, not sim state;
  // shape-validated loosely (missing/extra keys are simply ignored below)
  // rather than schema-enforced, matching the brief's "keep it minimal" note.
  return JSON.parse(raw) as PersonaSeed;
}

function clampGene(value: number): number {
  return Math.max(GENE_MIN, Math.min(GENE_MAX, value));
}

/** Applies `seed` to `sim`'s current founder population. Call ONCE, right
 *  after `bootstrapHollowSim`, before the first `sim.tick()`. */
export function applyPersonaSeed(sim: BootedHollowSim, seed: PersonaSeed): void {
  const founders = [...sim.world.query("genome")].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  if (seed.founderGenomeBias) {
    for (const founder of founders) {
      for (const [gene, value] of Object.entries(seed.founderGenomeBias)) {
        founder.genome.behavior[gene] = clampGene(value);
      }
    }
  }

  if (seed.founders) {
    seed.founders.forEach((override, i) => {
      const founder = founders[i];
      if (!founder || !override.behavior) return;
      for (const [gene, value] of Object.entries(override.behavior)) {
        founder.genome.behavior[gene] = clampGene(value);
      }
    });
  }
}
