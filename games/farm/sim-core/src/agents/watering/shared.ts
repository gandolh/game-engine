import type { GameEntity } from "../../components";
import { REGIONS, FISHING_ISLE_IDS, getRegion, regionAt, isWalkable, AUCTION_PODIUM_TILE } from "../../world/regions";
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
 * Fishing-isle cast tiles — one per isle: an on-isle tile with an ocean
 * (non-walkable) 4-neighbour to cast into (ActSystem scans the 4-neighbours for
 * water). AI farmers travel to the nearest one, then queue `fish`.
 *
 * DERIVED from the live isle bounds (scanned y,x ascending → deterministic, picks
 * a NW-ish edge tile), never hardcoded: a hardcoded literal silently drifted
 * off-isle in the 2026-06-09 radial reorg and killed AI fishing (brief 80). The
 * guard in shared.test.ts asserts every entry stays on a fishing isle.
 */
function deriveFishingCastTiles(): ReadonlyArray<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (const id of FISHING_ISLE_IDS) {
    const { bounds } = getRegion(id);
    let pick: { x: number; y: number } | undefined;
    for (let y = bounds.minY; y <= bounds.maxY && !pick; y++) {
      for (let x = bounds.minX; x <= bounds.maxX && !pick; x++) {
        if (regionAt(x, y) !== id) continue;
        const oceanAdjacent =
          !isWalkable(x - 1, y) || !isWalkable(x + 1, y) ||
          !isWalkable(x, y - 1) || !isWalkable(x, y + 1);
        if (oceanAdjacent) pick = { x, y };
      }
    }
    if (pick) tiles.push(pick);
  }
  return tiles;
}

// A function (not a module-load const) so it reflects the ACTIVE world — the
// world is seed-generated and swappable at runtime (brief 92/93); a snapshot
// would point at the default-world isles after a swap.
export function fishingCastTiles(): ReadonlyArray<{ x: number; y: number }> {
  return deriveFishingCastTiles();
}

/**
 * Tavern gathering tile inside the village hub (NE quadrant of the hub, patron
 * side of the bar). DERIVED from the live village center (+3,-3) rather than a
 * hardcoded literal — the world grid is parametric (see regions.ts) and a baked
 * tile would silently drift off-hub on the next world scale (cf. FISHING_CAST_TILES).
 */
// Derived from the LIVE village center / auction podium each call (brief 93):
// the world is seed-generated and swappable at runtime via setActiveWorld, so a
// module-load snapshot would point at the wrong (default-world) tile after a
// swap. Functions read the current active world.
export function tavernGatherTile(): { x: number; y: number } {
  const c = getRegion("village").center;
  return { x: c.x + 3, y: c.y - 3 };
}

/** How often (in days) a farmer makes a tavern gathering trip (a periodic luxury). */
export const TAVERN_VISIT_PERIOD = 12;

/**
 * The festival gathering tile: the auction podium at the centre of the village
 * market plaza (`AUCTION_PODIUM_TILE = snapNear('village', 0, 0)`). This is the
 * SAME plaza farmers already route to for the periodic market visit and to sell
 * produce (`deliberatePeriodicMarketVisit`, `deliberateSellProducts`) — the
 * venue half of the 2026-07-17 "festival attendance is geography-bound"
 * decision: hold the festival where farmers already pass rather than at an
 * out-of-the-way podium. Combined with the multi-day window (see FESTIVAL_DAYS),
 * a farmer who spends day 1 travelling in for market/festival is on the plaza to
 * celebrate on day 2.
 */
export function festivalPodiumTile(): { x: number; y: number } {
  return AUCTION_PODIUM_TILE;
}

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
