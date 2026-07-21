export type { HollowAgent, MoveTarget } from "./agent";
export type { Inventory } from "./inventory";
export { makeInventory, addGoods, takeGoods } from "./inventory";
export type { Ownership } from "./ownership";
export type { HollowEntity, HollowFsmState } from "./entity";
export type {
  Genome,
  Appearance,
  BehaviorGene,
  AptitudeSkill,
  SkinToneRole,
  HairToneRole,
} from "./genome";
export {
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
} from "./genome";
export type { Lifecycle, Stage, StageThresholds } from "./lifecycle";
export { stageForAge } from "./lifecycle";
export type { Skills } from "./skills";
export { makeSkills, practiceSkill } from "./skills";
export type { Feud } from "./feud";
export { makeFeud } from "./feud";
export type { Occupation, JobRole } from "./occupation";
export { JOB_ROLES, makeOccupation } from "./occupation";
export type { Disease } from "./disease";
export { makeDisease } from "./disease";
export type { Corpse } from "./corpse";
export { makeCorpse } from "./corpse";
