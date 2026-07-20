/**
 * Built-in archetype presets (chunk hollow-11a) — DATA, not logic, so 11b's
 * authoring GUI can list/render this table directly (`ARCHETYPE_PRESETS`) and
 * so a later brief can add a preset without touching `apply.ts`'s roll logic.
 *
 * Each preset is a partial BEHAVIOR-gene template (see components/genome.ts's
 * `BEHAVIOR_GENES`) plus an optional per-gene variance override. A gene the
 * template doesn't mention is left fully unauthored — `apply.ts` rolls it
 * across the full `[GENE_MIN, GENE_MAX]` range, exactly like `randomGenome`
 * would, so an archetype only skews the traits its name/description claims
 * to skew and leaves the rest naturally random. Aptitude + appearance genes
 * are NOT part of a preset (none of the five below describe a skill or a
 * body/tone) — they're always fully random unless a `PersonaSeed` entry's
 * own `overrides.aptitude`/`overrides.appearance` says otherwise.
 */
import type { BehaviorGene } from "../components";

export interface ArchetypePreset {
  readonly label: string;
  /** Authored target values for a SUBSET of `BEHAVIOR_GENES`. */
  readonly behavior: Partial<Record<BehaviorGene, number>>;
  /** Per-gene ± roll width around each `behavior` template value. A gene
   *  present in `behavior` but absent here falls back to `DEFAULT_GENE_VARIANCE`. */
  readonly variance?: Partial<Record<BehaviorGene, number>>;
}

/** Default ± roll width for an authored (template or override) continuous
 *  gene in `[GENE_MIN, GENE_MAX]` (a 0..1 range) — wide enough that two
 *  founders of the same archetype are visibly distinct individuals, narrow
 *  enough that the archetype's signature trait skew always survives the
 *  roll (0.85 ± 0.08 never crosses back below the 0.5 neutral midpoint). */
export const DEFAULT_GENE_VARIANCE = 0.08;

/** Default ± roll width for an authored continuous APPEARANCE gene
 *  (height/build, each a ~0.3-wide range around 1.0) — proportionally
 *  similar to `DEFAULT_GENE_VARIANCE` over the narrower range. */
export const DEFAULT_APPEARANCE_VARIANCE = 0.03;

export const ARCHETYPE_PRESETS: Readonly<Record<string, ArchetypePreset>> = {
  cooperator: {
    label: "Cooperator",
    behavior: { sociability: 0.85, loyalty: 0.85, greed: 0.15, aggression: 0.15 },
  },
  opportunist: {
    label: "Opportunist",
    behavior: { greed: 0.85, risk: 0.85 },
  },
  hoarder: {
    label: "Hoarder",
    behavior: { greed: 0.9, loyalty: 0.15 },
  },
  loner: {
    label: "Loner",
    behavior: { sociability: 0.1 },
  },
  nurturer: {
    label: "Nurturer",
    behavior: { loyalty: 0.85, sociability: 0.8, curiosity: 0.8 },
  },
};
