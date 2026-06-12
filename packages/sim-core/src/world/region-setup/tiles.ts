import { scaleAroundNearestIsland } from "../regions";

// Structure anchor tiles, authored against the original 160-scale layout and
// locked to their island (not the global map) so they ride with it — see
// regions.ts scaleAroundNearestIsland.
export const BLACKSMITH_TILE = scaleAroundNearestIsland({ x: 97, y: 83 });
export const MARKET_WALL_TILE = scaleAroundNearestIsland({ x: 77, y: 77 });
export const SHOPKEEPER_TILE = scaleAroundNearestIsland({ x: 84, y: 84 });
