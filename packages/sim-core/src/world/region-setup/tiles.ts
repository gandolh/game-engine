/**
 * Tile constants for region setup. Split from region-setup.ts.
 *
 * Farmer→farm assignment used to live here as a personality→region map, but with
 * a variable number of farmers (more than there are personalities) each farmer
 * now carries its assigned `homeRegion` directly on its FarmerSpec (see
 * makeFarmerSpecs in sim-bootstrap.ts); setupRegions zips farmers to farms by
 * that field.
 */

/** Blacksmith NPC tile within the blacksmith island (E of village, 93-102×76-85). */
export const BLACKSMITH_TILE = { x: 97, y: 83 } as const;

/** Village tile where the market wall lives (village island 75-86×75-86). */
export const MARKET_WALL_TILE = { x: 77, y: 77 } as const;
/** Village tile where the shopkeeper stands. */
export const SHOPKEEPER_TILE = { x: 84, y: 84 } as const;
