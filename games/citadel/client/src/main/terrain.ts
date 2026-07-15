import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";
import { SEED } from "./constants";

// ---------------------------------------------------------------------------
// Terrain (generated at module scope; baked into the static layer by the
// renderer during boot, and read by placement validation).
// ---------------------------------------------------------------------------
// Brief 110 / decision #22: 192×192. Passed EXPLICITLY rather than inherited from
// `generateTerrain`'s defaults — the client and the sim must agree on the world
// size, and relying on a shared exported constant to make that true is exactly how
// the client came to bake a 96×96 world while attached to a 256×256 sim.
//
// Solo generates its own terrain because solo IS the sim (the Web Worker runs the
// same seed + dims). Everything downstream — the iso projection, the windowed bake,
// placement bounds, the minimap — derives from THIS grid, not from the constants.
//
// Kept at MODULE SCOPE (not inside boot()) deliberately: this is a behaviour-preserving
// split of main.ts, and moving this eager computation into the async boot() would delay
// it relative to every other module's top-level evaluation — a reordering the brief 114
// split is not allowed to introduce without proof of equivalence. Nothing reads `terrain`
// synchronously at import time (every use is inside a function body, called after boot()
// has run), so this file is simply imported wherever the grid is needed.
export const terrain: TerrainGrid = generateTerrain(SEED, WORLD_WIDTH, WORLD_HEIGHT);
