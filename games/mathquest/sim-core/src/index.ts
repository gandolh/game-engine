export {
  bootstrapMathquestSim,
  type MathquestSimOptions,
  type BootedMathquestSim,
  type MathquestEntity,
  type RunMode,
  type RunView,
  type GameSnapshot,
} from "./sim-bootstrap";

export {
  describeUpgrade,
  offerUpgrades,
  xpForSolve,
  xpToNext,
  UPGRADES,
  ZERO_STATS,
  type StatBonuses,
  type UpgradeKind,
  type UpgradeOffer,
} from "./run/progression";

export {
  rollLoot,
  toItemView,
  foldItemBonus,
  type Item,
  type ItemView,
  type LootTier,
} from "./run/loot";

export type {
  AnswerResponse,
  ChoiceProblem,
  CombatAction,
  CombatPhase,
  CombatSnapshot,
  CombatantView,
  EnemyResult,
  EnemyView,
  Grade,
  MathTopic,
  PlayerResult,
  Problem,
  ProblemKind,
  ProblemView,
  TypedProblem,
} from "./combat/types";

export {
  createCombat,
  type Combat,
  type CombatOpts,
  type CombatResult,
} from "./combat/combat";

export {
  ATTACK_DAMAGE,
  DEFAULT_GRADE,
  HEAL_AMOUNT,
  SHIELD_BLOCK,
  WARRIOR_MAX_HP,
} from "./combat/constants";

export {
  generateMap,
  zoneForRow,
  type NodeType,
  type MapNode,
  type RunMap,
  type Zone,
} from "./run/map";

export {
  ENEMY_ARCHETYPES,
  BOSS_GRADE,
  enemyFor,
  type EnemyArchetype,
  type EnemyKind,
} from "./run/enemies";

export { REST_HEAL } from "./run/constants";

export {
  LIFELINE_KINDS,
  STARTING_LIFELINES,
  NO_LIFELINES,
  type LifelineKind,
  type LifelineCharges,
} from "./run/lifelines";

export {
  BLUEPRINTS,
  ELITE_UNLOCK_TIER,
  EMPTY_MASTERY_STORE,
  MASTERY_STORAGE_KEY,
  MASTERY_STORE_VERSION,
  MASTERY_TIER_THRESHOLDS,
  blueprintItemsFor,
  foldTopicOutcomes,
  masteryPct,
  masteryTier,
  overallMasteryTier,
  parseMasteryStore,
  type MasteryStore,
  type TopicMastery,
} from "./run/mastery";
