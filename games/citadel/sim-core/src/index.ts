export { bootstrapSim, loadFromSave } from "./sim-bootstrap";
export type { CitadelSimOptions, CitadelSimResult } from "./sim-bootstrap";
export { computeTier, tierAtLeast, TierSystem, TIER_ORDER, TIER_THRESHOLDS, TIER_LOCK } from "./systems/tiers";
export type { SettlementTier } from "./systems/tiers";
// `findCoreBox` (+ its dims) is the guaranteed-buildable core the terrain generator repairs into
// every map and `seedFoundingTown` anchors on. Brief 103: the Challenge ruleset has NO seeded town,
// so the client uses it to open the camera on land the player can actually found on.
export { generateTerrain, isWalkable, findCoreBox, TerrainType, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, CORE_BOX_W, CORE_BOX_H } from "./world/terrain";
export type { TerrainGrid } from "./world/terrain";
export { DayClockSystem } from "./systems/day-clock";
export type {
  BuildingComponent,
  BuildingEntity,
  BuildingDef,
  BuildingProductionDef,
  BuildingRuntimeState,
  GoodType,
  TerrainReq,
} from "./entities/building";
export {
  getBuildingDef,
  getProductionDef,
  PRODUCTION_DEFS,
  SERVICE_RADII,
  SERVICE_RECTS,
  coversRect,
  BUILDING_MAX_LEVEL,
  upgradeCost,
  BUILD_COST,
  buildCost,
  tierNameRequiredForLevel,
  effectiveOutputPerCycle,
  effectiveTicksPerCycle,
  effectiveHousingCapacity,
  effectiveDefenseStrength,
} from "./entities/building";
export { BASELINE_TICKS_PER_DAY, scaleTicks } from "./pacing";
export type { VillagerComponent, VillagerEntity, VillagerFsm } from "./entities/villager";
export type { VillagerJob } from "./entities/building";
export { isTravellingFsm } from "./entities/villager";
export type {
  BuildingSnapshot,
  VillagerSnapshot,
  RaiderSnapshot,
  CitadelCommand,
  CitadelSave,
  RenderSnapshot,
  WorkerInbound,
  WorkerOutbound,
} from "./snapshot/index";
export { bfsPath } from "./world/pathfinder";
export type { PathNode } from "./world/pathfinder";
export { getSeason, grainMultiplier } from "./world/seasons";
export type { Season } from "./world/seasons";
export type { SimState, Stockpiles, BarterOffer, RaiderState, PlayerState, ArmyState } from "./sim-state";
export { villagerWalkable, makePlayerState, localPlayer, playerById } from "./sim-state";
export { RoadConnectivitySystem } from "./systems/road-connectivity";
export { ProductionSystem, outputBufferCap } from "./systems/production";
export { VillagerSystem } from "./systems/villager-system";
export { ImmigrationSystem } from "./systems/immigration";
export { RaidSpawnSystem } from "./systems/raid-spawn";
export { RaiderMovementSystem, MOVE_INTERVAL as RAIDER_MOVE_INTERVAL_TICKS } from "./systems/raider-movement";
export { SiegeResolutionSystem } from "./systems/siege-resolution";
