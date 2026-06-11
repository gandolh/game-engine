import { describe, it, expect } from "vitest";
import {
  FISHING_CAST_TILES,
  TAVERN_GATHER_TILE,
  FESTIVAL_PODIUM_TILE,
} from "./shared";
import {
  FISHING_ISLE_IDS,
  regionAt,
  isWalkable,
  isFishingIsle,
} from "../../world/regions";

/**
 * Brief 80 — the guard whose absence let stale AI-travel-target tiles slip through.
 * These constants drive where AI farmers travel to fish / gather; if a world reorg
 * moves a region and the constant isn't updated, the farmer travels to ocean/empty
 * ground and the action's precondition silently never fires (no error, no test
 * failure). This asserts every such tile is still VALID in the live world, so a
 * future reorg fails loudly here instead of killing a feature in the dark.
 */
function hasOceanNeighbour(x: number, y: number): boolean {
  return (
    !isWalkable(x - 1, y) ||
    !isWalkable(x + 1, y) ||
    !isWalkable(x, y - 1) ||
    !isWalkable(x, y + 1)
  );
}

describe("AI travel-target tiles are valid in the live world (brief 80)", () => {
  it("derives exactly one fishing cast tile per isle", () => {
    expect(FISHING_CAST_TILES.length).toBe(FISHING_ISLE_IDS.length);
  });

  it("every fishing cast tile is ON a fishing isle with an ocean tile to cast into", () => {
    for (const { x, y } of FISHING_CAST_TILES) {
      expect(isFishingIsle(regionAt(x, y))).toBe(true);
      expect(hasOceanNeighbour(x, y)).toBe(true);
    }
  });

  it("the tavern gather tile is walkable and inside the village", () => {
    expect(isWalkable(TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)).toBe(true);
    expect(regionAt(TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)).toBe("village");
  });

  it("the festival podium tile is walkable and inside the village", () => {
    expect(isWalkable(FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)).toBe(true);
    expect(regionAt(FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)).toBe("village");
  });
});
