/**
 * Env parsing for the Hollow headless research CLI (chunk hollow-07) —
 * mirrors `tools/run-sim/src/env.ts`'s "read `process.env`, export plain
 * consts" shape, plus the RESEARCH PROFILE this tool defaults to.
 *
 * ── why a "research profile" instead of production constants ───────────────
 * `@hollow/sim-core`'s PRODUCTION lifecycle constants (family/constants.ts —
 * adultElderTicks 8000, gestation 250, birthWindow 500) make a single
 * generation take ~10k+ ticks: far too slow to observe multiple generations
 * on constrained hardware in a headless research run. `RESEARCH_PROFILE`
 * below is the validated compressed-but-stable profile copied verbatim from
 * `sim-bootstrap.family.test.ts`'s `STABLE_LIFECYCLE` (+ a starting
 * population) — controller-swept across seeds {1,7,33,101,202} to give a
 * bounded, self-limiting, never-extinct, multi-generation population in a
 * few thousand ticks. This is the ONE place that profile is duplicated;
 * keep it in sync with `STABLE_LIFECYCLE` if that test's profile ever moves.
 * Every field is overridable by its own env var (see `buildSimOptions`
 * below) so a caller can still explore off-profile scenarios.
 */
import type { HollowSimOptions } from "@hollow/sim-core/sim-bootstrap";

function numEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  return Number(raw);
}

function strEnv(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? undefined : raw;
}

/** Root sim seed — all randomness forks from this (never `Math.random()`). */
export const SEED = numEnv("SEED") ?? 0x1a1100;

/** Sampling window, in ticks — one metrics.csv row per this many ticks. */
export const TICKS_PER_YEAR = numEnv("TICKS_PER_YEAR") ?? 100;

const MAX_YEARS_RAW = numEnv("MAX_YEARS");

/** Open-ended-with-safety-cap: enough years (at the profile below) to reach
 *  >= 5 generations without runaway wall-clock/memory on constrained hardware. */
export const MAX_YEARS = MAX_YEARS_RAW ?? 15;

/** `CHECK_DETERMINISM`'s own (smaller) default run length — the brief asks
 *  for the determinism check to default to something small regardless of
 *  the normal run's `MAX_YEARS` default, since it runs the whole sim TWICE
 *  per seed. An explicit `MAX_YEARS` env override still applies to both
 *  paths (a caller who deliberately wants a bigger determinism sweep can
 *  ask for one — see this tool's `check-determinism` script/doc). */
export const DETERMINISM_MAX_YEARS = MAX_YEARS_RAW ?? 3;

/** Metrics time-series export format. */
export const EXPORT = (strEnv("EXPORT") ?? "csv").toLowerCase();

/** Output directory (created if missing) for metrics/events/lineage. */
export const EXPORT_DIR = strEnv("EXPORT_DIR") ?? "./hollow-out";

/** Optional path to a JSON founder-genome-seed file — see `persona.ts`. */
export const PERSONA_SEED = strEnv("PERSONA_SEED");

/** Optional path to a JSON `Intervention[]` log (chunk hollow-11a) — see
 *  `intervention-log.ts`. When set, the run REPLAYS these shocks instead of
 *  (or alongside) any live scheduling, reproducing a prior run's
 *  interventions exactly — see `sim-bootstrap.ts`'s `loadInterventionLog`. */
export const INTERVENTION_LOG = strEnv("INTERVENTION_LOG");

export const CHECK_DETERMINISM =
  process.env["CHECK_DETERMINISM"] === "1" || process.argv.includes("--check-determinism");

/**
 * THE VALIDATED STABLE RESEARCH PROFILE — see this file's header. Copied
 * verbatim from `games/hollow/sim-core/src/sim-bootstrap.family.test.ts`'s
 * `STABLE_LIFECYCLE`, plus `population: 24` (that test uses `START_POP = 16`;
 * 24 gives a slightly larger founding pool for a longer, more legible run).
 */
export const RESEARCH_PROFILE = {
  population: 24,
  ticksPerDay: 20,
  childAdultTicks: 15,
  adultElderTicks: 200,
  oldAgeHazardBase: 0.006,
  oldAgeHazardPerTick: 0.0012,
  oldAgeHazardMax: 0.2,
  starvationDeathTicks: 120,
  pairbondTrustThreshold: 0.55,
  pairbondCompatThreshold: 0.2,
  pairbondProximityTiles: 12,
  birthWindowTicks: 20,
  birthChance: 0.6,
  birthFoodSecurityFraction: 0.3,
  gestationTicks: 10,
  birthPerCapitaFoodTarget: 6,
  foodNodeCount: 10,
  foodNodeMaxStock: 200,
  foodNodeRegenPerTick: 12,
} as const;

/**
 * Builds the `HollowSimOptions` for a run: `RESEARCH_PROFILE` defaults,
 * `seed` from `SEED` above, each field overridable by its own env var (all
 * named after the option, SCREAMING_SNAKE_CASE). Kept as one explicit object
 * literal (not a generic key-loop over a map) so every field stays visible
 * and type-checked here — no `any`/index-signature casting required.
 */
export function buildSimOptions(seed: number = SEED): HollowSimOptions {
  return {
    seed,
    population: numEnv("POPULATION") ?? RESEARCH_PROFILE.population,
    ticksPerDay: numEnv("TICKS_PER_DAY") ?? RESEARCH_PROFILE.ticksPerDay,
    childAdultTicks: numEnv("CHILD_ADULT_TICKS") ?? RESEARCH_PROFILE.childAdultTicks,
    adultElderTicks: numEnv("ADULT_ELDER_TICKS") ?? RESEARCH_PROFILE.adultElderTicks,
    oldAgeHazardBase: numEnv("OLD_AGE_HAZARD_BASE") ?? RESEARCH_PROFILE.oldAgeHazardBase,
    oldAgeHazardPerTick: numEnv("OLD_AGE_HAZARD_PER_TICK") ?? RESEARCH_PROFILE.oldAgeHazardPerTick,
    oldAgeHazardMax: numEnv("OLD_AGE_HAZARD_MAX") ?? RESEARCH_PROFILE.oldAgeHazardMax,
    starvationDeathTicks: numEnv("STARVATION_DEATH_TICKS") ?? RESEARCH_PROFILE.starvationDeathTicks,
    pairbondTrustThreshold: numEnv("PAIRBOND_TRUST_THRESHOLD") ?? RESEARCH_PROFILE.pairbondTrustThreshold,
    pairbondCompatThreshold: numEnv("PAIRBOND_COMPAT_THRESHOLD") ?? RESEARCH_PROFILE.pairbondCompatThreshold,
    pairbondProximityTiles: numEnv("PAIRBOND_PROXIMITY_TILES") ?? RESEARCH_PROFILE.pairbondProximityTiles,
    birthWindowTicks: numEnv("BIRTH_WINDOW_TICKS") ?? RESEARCH_PROFILE.birthWindowTicks,
    birthChance: numEnv("BIRTH_CHANCE") ?? RESEARCH_PROFILE.birthChance,
    birthFoodSecurityFraction:
      numEnv("BIRTH_FOOD_SECURITY_FRACTION") ?? RESEARCH_PROFILE.birthFoodSecurityFraction,
    gestationTicks: numEnv("GESTATION_TICKS") ?? RESEARCH_PROFILE.gestationTicks,
    birthPerCapitaFoodTarget: numEnv("BIRTH_PERCAPITA_FOOD_TARGET") ?? RESEARCH_PROFILE.birthPerCapitaFoodTarget,
    foodNodeCount: numEnv("FOOD_NODE_COUNT") ?? RESEARCH_PROFILE.foodNodeCount,
    foodNodeMaxStock: numEnv("FOOD_NODE_MAX_STOCK") ?? RESEARCH_PROFILE.foodNodeMaxStock,
    foodNodeRegenPerTick: numEnv("FOOD_NODE_REGEN_PER_TICK") ?? RESEARCH_PROFILE.foodNodeRegenPerTick,
  };
}

export function determinismSeeds(): number[] {
  const raw = process.env["SEEDS"];
  if (raw !== undefined && raw !== "") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  return [SEED];
}
