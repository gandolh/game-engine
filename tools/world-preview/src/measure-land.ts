import { generateWorld, WORLD_GEN_SEED, WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { buildWalkableGrid } from "@farm/sim-core/world/walkable-grid";
const g = buildWalkableGrid();
let land = 0;
for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 0) land++;
const total = WORLD_WIDTH * WORLD_HEIGHT;
const w = generateWorld(WORLD_GEN_SEED);
console.log(`land=${land}/${total} = ${(100*land/total).toFixed(1)}%  regions=${w.regions.length} fallback=${w.fallbackCount}`);
