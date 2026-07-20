/**
 * Genome — heritable traits (chunk hollow-05). A genome is drawn at spawn
 * (population.ts, founders, via `family/genetics.ts`'s `randomGenome`) or by
 * crossover+mutation of two parents (family/reproduction-system.ts,
 * children, via `crossoverGenomes`); nothing in this package writes to it
 * after an agent is born (no genetic engineering, no drift from living).
 *
 * - `behavior`: a fixed set of personality-shaping genes, each a float in
 *   [GENE_MIN, GENE_MAX]. hollow-05 wires at least one (`industriousness`)
 *   into the villager deliberator (see agents/villager.ts) so genome
 *   measurably affects behavior; the rest are heritable/inspectable now and
 *   get more deliberator hooks in later briefs.
 * - `aptitude`: per-skill AFFINITY (also [GENE_MIN, GENE_MAX]) — how
 *   naturally suited an agent is to a skill domain. This is heritable
 *   POTENTIAL only; skill LEVEL (how good an agent has actually gotten
 *   through practice) is lived state, not genome, and is out of scope for
 *   v1 — a seam for a later brief.
 * - `appearance`: height/build are continuous floats (a size/build
 *   multiplier around 1.0); skinTone/hairTone are CATEGORICAL — string
 *   literals naming a palette ROLE from @hollow/client's `HOLLOW_PAL`
 *   (hollow-palette.ts), not a color. sim-core stays render-free (CLAUDE.md
 *   layering) and must not import the client, so the role names are
 *   hard-coded here as small const arrays kept in sync with `HOLLOW_PAL`'s
 *   tone roles by convention (skin: skin/skinMid/skinLight/skinDark/
 *   skinDeep; hair: hairBlack/hairBrown/hairBlonde/hairRed/hairGrey) — the
 *   client renderer looks these role-name strings up in its own palette.
 */

export const BEHAVIOR_GENES = [
  "sociability",
  "risk",
  "aggression",
  "loyalty",
  "greed",
  "industriousness",
  "curiosity",
] as const;
export type BehaviorGene = (typeof BEHAVIOR_GENES)[number];

export const APTITUDE_SKILLS = ["food", "material"] as const;
export type AptitudeSkill = (typeof APTITUDE_SKILLS)[number];

export const GENE_MIN = 0;
export const GENE_MAX = 1;

export const APPEARANCE_HEIGHT_MIN = 0.85;
export const APPEARANCE_HEIGHT_MAX = 1.15;
export const APPEARANCE_BUILD_MIN = 0.85;
export const APPEARANCE_BUILD_MAX = 1.15;

/** Skin-tone palette ROLE NAMES (see header) — mirrors
 *  @hollow/client/src/render/hollow-palette.ts's `HOLLOW_PAL` skin roles. A
 *  string literal from this array, never a color. */
export const SKIN_TONE_ROLES = ["skin", "skinMid", "skinLight", "skinDark", "skinDeep"] as const;
export type SkinToneRole = (typeof SKIN_TONE_ROLES)[number];

/** Hair-tone palette ROLE NAMES — mirrors `HOLLOW_PAL`'s hair roles. */
export const HAIR_TONE_ROLES = ["hairBlack", "hairBrown", "hairBlonde", "hairRed", "hairGrey"] as const;
export type HairToneRole = (typeof HAIR_TONE_ROLES)[number];

export interface Appearance {
  height: number;
  build: number;
  skinTone: SkinToneRole;
  hairTone: HairToneRole;
}

/**
 * `behavior`/`aptitude` are `Record<string, number>` (not keyed by the
 * literal gene-name unions above) so callers that iterate `BEHAVIOR_GENES`/
 * `APTITUDE_SKILLS` to fill or read them don't fight index-signature
 * variance; the const arrays above are the single source of truth for which
 * keys are actually populated.
 */
export interface Genome {
  behavior: Record<string, number>;
  aptitude: Record<string, number>;
  appearance: Appearance;
}
