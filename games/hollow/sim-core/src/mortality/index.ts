export {
  STARVATION_DEATH_DAYS,
  CORPSE_ROT_DELAY_DAYS,
  DISEASE_SPREAD_RADIUS,
  DISEASE_INFECT_PROB_PER_TICK,
  DISEASE_MORTALITY_PROB_PER_DAY,
  DISEASE_SELF_RECOVERY_DAYS,
  DISEASE_MEDIC_RECOVERY_DAYS,
  MEDIC_MAX_TREATMENTS_PER_DAY,
  daysToTicks,
  isDayBoundary,
} from "./constants";
export { HollowDiseaseSystem } from "./disease-system";
export type { DiseaseSystemOptions } from "./disease-system";
export { HollowCorpseSystem } from "./corpse-system";
export type { CorpseSystemOptions } from "./corpse-system";
export { HollowCareActSystem, CARE_ACT_KINDS } from "./care-act-system";
export type { CareActSystemOptions } from "./care-act-system";
export { medicTreatsRemaining, recordMedicTreatment } from "./medic";
