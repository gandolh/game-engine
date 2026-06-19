import { describe, it, expect } from "vitest";
import {
  fishingCastTiles,
  tavernGatherTile,
  festivalPodiumTile,
} from "./shared";
import {
  FISHING_ISLE_IDS,
  regionAt,
  isWalkable,
  isFishingIsle,
} from "../../world/regions";

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
    expect(fishingCastTiles().length).toBe(FISHING_ISLE_IDS.length);
  });

  it("every fishing cast tile is ON a fishing isle with an ocean tile to cast into", () => {
    for (const { x, y } of fishingCastTiles()) {
      expect(isFishingIsle(regionAt(x, y))).toBe(true);
      expect(hasOceanNeighbour(x, y)).toBe(true);
    }
  });

  it("the tavern gather tile is walkable and inside the village", () => {
    const t = tavernGatherTile();
    expect(isWalkable(t.x, t.y)).toBe(true);
    expect(regionAt(t.x, t.y)).toBe("village");
  });

  it("the festival podium tile is walkable and inside the village", () => {
    const t = festivalPodiumTile();
    expect(isWalkable(t.x, t.y)).toBe(true);
    expect(regionAt(t.x, t.y)).toBe("village");
  });
});
