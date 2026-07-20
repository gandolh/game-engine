export { ONT_STARVATION } from "./starvation";
export type { StarvationOntology, StarvationOnsetBody } from "./starvation";
export { ONT_COMMUNITY } from "./community";
export type {
  CommunityOntology,
  CommunityFormedBody,
  CommunityJoinedBody,
  CommunityLeftBody,
  CommunitySplitBody,
  CommunityMergedBody,
  CommunityDissolvedBody,
} from "./community";
export { ONT_FAMILY } from "./family";
export type {
  FamilyOntology,
  FamilyBondedBody,
  FamilyBirthBody,
  FamilyDeathBody,
  FamilyStageChangedBody,
} from "./family";
export { ONT_SOCIAL } from "./social";
export type {
  SocialOntology,
  GiftBody,
  ShareBody,
  HelpLaborBody,
  TeachBody,
  TradeBody,
  StealBody,
  StealDetectedBody,
  SabotageBody,
  RumorBody,
  AttackBody,
} from "./social";
export { ONT_GOVERNANCE } from "./governance";
export type {
  GovernanceOntology,
  GovernanceNormKind,
  GovernanceSanctionAction,
  LeaderChangedBody,
  NormChangedBody,
  SanctionedBody,
} from "./governance";
export { ONT_SHOCK, shockOntology } from "./shock";
export type {
  ShockKind,
  ShockOntology,
  Shock,
  FamineShock,
  BoomShock,
  DisasterShock,
  PlagueShock,
  Intervention,
  ShockAppliedBody,
} from "./shock";
