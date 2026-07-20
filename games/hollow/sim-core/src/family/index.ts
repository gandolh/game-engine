export type { Household } from "./household";
export { HouseholdRegistry } from "./registry";
export { crossoverGenomes, randomGenome } from "./genetics";
export { HollowPairBondSystem } from "./pairbond-system";
export type { PairBondSystemOptions } from "./pairbond-system";
export { HollowReproductionSystem } from "./reproduction-system";
export type { ReproductionSystemOptions } from "./reproduction-system";
export { HollowLifecycleSystem } from "./lifecycle-system";
export type { LifecycleSystemOptions } from "./lifecycle-system";
export {
  STAGE_CHILD_ADULT_TICKS,
  STAGE_ADULT_ELDER_TICKS,
  OLD_AGE_HAZARD_BASE,
  OLD_AGE_HAZARD_PER_TICK,
  OLD_AGE_HAZARD_MAX,
  STARVATION_DEATH_TICKS,
  PAIRBOND_TRUST_THRESHOLD,
  PAIRBOND_COMPAT_THRESHOLD,
  PAIRBOND_PROXIMITY_TILES,
  PAIRBOND_COMPAT_GENES,
  BIRTH_WINDOW_TICKS,
  BIRTH_CHANCE,
  BIRTH_FOOD_SECURITY_FRACTION,
  BIRTH_PERCAPITA_FOOD_TARGET,
  GESTATION_TICKS,
  MUTATION_STEP_BOUND,
  MUTATION_ROLE_FLIP_PROBABILITY,
  INDUSTRIOUSNESS_REST_INFLUENCE,
} from "./constants";
