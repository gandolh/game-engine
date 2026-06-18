export { bootstrapSim } from "./sim-bootstrap";
export type { CitadelSimOptions, CitadelSimResult } from "./sim-bootstrap";
export { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from "./world/terrain";
export type { TerrainGrid } from "./world/terrain";
export { DayClockSystem } from "./systems/day-clock";
export type { BuildingComponent, BuildingEntity, BuildingDef } from "./entities/building";
export { getBuildingDef } from "./entities/building";
export type { BuildingSnapshot, CitadelCommand, RenderSnapshot, WorkerInbound, WorkerOutbound } from "./snapshot/index";
