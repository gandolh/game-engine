import type { GameEntity } from "../../components";
import { REGIONS } from "../../world/regions";
import type { Season } from "../../protocols/weather";

export interface WateringStyle {
  dryThreshold: number;
  maxWaterPerDay?: number;
}

/** Water sources where a `refill-can` action succeeds (see ActSystem). */
export const WELL_REGIONS = ["well-north", "well-south"] as const;

/** Seasonal forage zones and the season each is productive in. */
export const FORAGE_ZONES: Array<{ region: string; season: Season }> = [
  { region: "mushroom-grove", season: "autumn" },
  { region: "ice-pond",       season: "winter" },
];

/**
 * Fishing-isle cast tiles — one edge tile per isle whose west neighbour is open
 * ocean, so a farmer standing here can cast (ActSystem scans the 4-neighbours
 * for water). AI farmers travel to the nearest one, then queue `fish`.
 *   fishing-isle   (40–47×68–75): west edge (40,71), ocean at (39,71)
 *   fishing-isle-2 (22–29×68–75): west edge (22,71), ocean at (21,71)
 */
export const FISHING_CAST_TILES = [
  { x: 40, y: 71 },
  { x: 22, y: 71 },
] as const;

/**
 * Tavern gathering tile inside the village hub (patron side of the bar: one tile
 * south of the barkeep at (82,76), well inside village bounds (75–86, 75–86)).
 */
export const TAVERN_GATHER_TILE = { x: 82, y: 78 } as const;

/** How often (in days) a farmer makes a tavern gathering trip (a periodic luxury). */
export const TAVERN_VISIT_PERIOD = 12;

/** The festival gathering tile: auction podium in the town square (matches AUCTION_PODIUM_TILE). */
export const FESTIVAL_PODIUM_TILE = { x: 80, y: 80 } as const;

/**
 * Pick the nearest water source region to the farmer: their home farm (fountain)
 * or a well, by Manhattan distance from the farmer's current tile to each
 * region center. Returns the home region as a safe default.
 */
export function nearestWaterSource(farmer: GameEntity): string | undefined {
  const home = farmer.farmer?.homeRegion;
  const t = farmer.transform;
  if (!t) return home;
  const candidates: string[] = [...WELL_REGIONS];
  if (home) candidates.push(home);
  let best: string | undefined = home;
  let bestDist = Infinity;
  for (const id of candidates) {
    const def = REGIONS.find(r => r.id === id);
    if (!def) continue;
    const d = Math.abs(def.center.x - t.x) + Math.abs(def.center.y - t.y);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/**
 * Pick the tile in `tiles` closest to `transform` by Manhattan distance.
 * Tie-break by (tileY, tileX) for determinism (tiles must be pre-sorted for
 * stable tie-breaking). Returns undefined if the list is empty.
 */
export function nearestTile(
  transform: { x: number; y: number } | undefined,
  tiles: Array<{ tileX: number; tileY: number }>,
): { tileX: number; tileY: number } | undefined {
  if (tiles.length === 0) return undefined;
  if (!transform) return tiles[0];
  let best = tiles[0]!;
  let bestDist = Math.abs(best.tileX - transform.x) + Math.abs(best.tileY - transform.y);
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i]!;
    const d = Math.abs(t.tileX - transform.x) + Math.abs(t.tileY - transform.y);
    if (d < bestDist || (d === bestDist && (t.tileY < best.tileY || (t.tileY === best.tileY && t.tileX < best.tileX)))) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}
