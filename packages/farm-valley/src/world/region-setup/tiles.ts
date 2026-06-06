/**
 * Tile constants and personality-to-region mapping for region setup.
 * Split from region-setup.ts.
 */

import type { RegionId } from "../regions";

/** Blacksmith NPC tile within the blacksmith island (E of village, 58-67×34-43). */
export const BLACKSMITH_TILE = { x: 62, y: 41 } as const;

/** Village tile where the market wall lives (village island 38-49×34-45). */
export const MARKET_WALL_TILE = { x: 40, y: 36 } as const;
/** Village tile where the shopkeeper stands. */
export const SHOPKEEPER_TILE = { x: 47, y: 43 } as const;

/** Personality → region assignment (Cora N, Atticus far-E, Hannah S, Otto W, Pip E-center). */
export const PERSONALITY_TO_REGION: Record<string, RegionId> = {
  conservative: "farm-cora",
  aggressive: "farm-atticus",
  hoarder: "farm-hannah",
  opportunist: "farm-otto",
  pip: "farm-pip",
};
