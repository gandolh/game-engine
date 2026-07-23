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
  type NodeType,
  type MapNode,
  type RunMap,
} from "./run/map";

export {
  ENEMY_ARCHETYPES,
  BOSS_GRADE,
  type EnemyArchetype,
  type EnemyKind,
} from "./run/enemies";

export { REST_HEAL } from "./run/constants";
