# Game Task 05 — Village, Per-Farmer Farms, Travel

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Restructured the world from a flat layout into a 40×40 tile grid with 5 named regions in a compass layout, and added physical tile-by-tile travel powered by the WASM pathfinder.

## What shipped

- `world/regions.ts` — `RegionId`, `RegionDef`, `REGIONS` array, `WORLD_WIDTH/HEIGHT = 40`, `regionAt`, `isWalkable`, `getRegion`. Compass assignment: Cora=N, Atticus=E, Hannah=S, Otto=W, village=center.
- Layout constants: `FARM_SIZE=12`, `VILLAGE_SIZE=12`, `ROAD_LEN=4`, `ROAD_WIDTH=2`. Void tiles outside regions are not walkable. Town square = inner 4×4 of village at `x ∈ [18..21], y ∈ [18..21]`.
- `world/walkable-grid.ts` — `buildWalkableGrid()` returns a row-major `Uint8Array` (0=walkable, 1=blocked). 728 total walkable tiles (4 farms×144 + village×144 + 4 roads×8).
- `world/region-setup.ts` — `setupRegions(world, farmers)` spawns 5 region entities, 9 plots per farm in a 3×3 grid, market-wall at (16,16), shopkeeper at (23,23). Replaced flat plot-spawning in `world-setup.ts`.
- `components.ts` additions: `Farmer.currentRegion: RegionId`, `Farmer.path?: { waypoints, nextIndex, ticksUntilStep }`, `Plot.ownerId`, `Plot.regionId`.
- `systems/travel.ts` — `TravelSystem` handles `travel` intent kind; moves farmer tile-by-tile at `STEP_TICKS=5` (4 tiles/sec at 20 Hz); on arrival updates `currentRegion`, clears path, pops intent, emits `ONT_TRAVEL.ARRIVED`.
- `protocols/travel.ts` — new ontology file for `ONT_TRAVEL.ARRIVED`.
- AP cost for travel = 2 (same as other 2-AP intents); Brief 06 may revisit.
- Tests: `regions.test.ts`, `walkable-grid.test.ts`, `travel.test.ts` (including unreachable-region + same-region edge cases).
