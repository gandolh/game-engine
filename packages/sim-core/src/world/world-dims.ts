/**
 * world-dims.ts — the world's tile dimensions, in their own module so the
 * placement/bridge generators can use them without importing regions.ts (which
 * would create an import cycle: regions → island-placement → regions). Keeping
 * these here lets regions.ts safely build the default world at module load.
 */
export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 240;
