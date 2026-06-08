/**
 * Tile constants for region setup. Split from region-setup.ts.
 *
 * Farmer→farm assignment used to live here as a personality→region map, but with
 * a variable number of farmers (more than there are personalities) each farmer
 * now carries its assigned `homeRegion` directly on its FarmerSpec (see
 * makeFarmerSpecs in sim-bootstrap.ts); setupRegions zips farmers to farms by
 * that field.
 */

/** Blacksmith NPC tile within the blacksmith island (E of village, 58-67×34-43). */
export const BLACKSMITH_TILE = { x: 62, y: 41 } as const;

/** Village tile where the market wall lives (village island 38-49×34-45). */
export const MARKET_WALL_TILE = { x: 40, y: 36 } as const;
/** Village tile where the shopkeeper stands. */
export const SHOPKEEPER_TILE = { x: 47, y: 43 } as const;
