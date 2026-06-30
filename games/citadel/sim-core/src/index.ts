export { bootstrapSim, loadFromSave } from "./sim-bootstrap";
export type { CitadelSimOptions, CitadelSimResult } from "./sim-bootstrap";
export { computeTier, tierAtLeast, TierSystem, TIER_ORDER, TIER_THRESHOLDS, TIER_LOCK } from "./systems/tiers";
export type { SettlementTier } from "./systems/tiers";
export { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from "./world/terrain";
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
  tierNameRequiredForLevel,
  effectiveOutputPerCycle,
  effectiveHousingCapacity,
  effectiveDefenseStrength,
} from "./entities/building";
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
export { RaiderMovementSystem } from "./systems/raider-movement";
export { SiegeResolutionSystem } from "./systems/siege-resolution";
