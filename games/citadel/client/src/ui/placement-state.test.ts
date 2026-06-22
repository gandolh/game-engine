import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import { shortestRoadPath } from "./placement-state";

function manhattan(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}

describe("shortestRoadPath", () => {
  it("returns a single tile when start === end", () => {
    expect(shortestRoadPath(5, 5, 5, 5)).toEqual([{ x: 5, y: 5 }]);
  });

  it("draws a straight horizontal run", () => {
    expect(shortestRoadPath(2, 3, 5, 3)).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
  });

  it("draws a straight vertical run", () => {
    expect(shortestRoadPath(2, 3, 2, 1)).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
    ]);
  });

  it("includes both endpoints and has Manhattan-distance + 1 tiles (L-shaped)", () => {
    const tiles = shortestRoadPath(1, 1, 4, 6);
    expect(tiles[0]).toEqual({ x: 1, y: 1 });
    expect(tiles[tiles.length - 1]).toEqual({ x: 4, y: 6 });
    expect(tiles).toHaveLength(manhattan(1, 1, 4, 6) + 1);
  });

  it("produces a path that is the shortest possible length", () => {
    // Every tile in the path is unique and consecutive tiles are 4-adjacent,
    // so the path length equals the Manhattan distance — i.e. shortest.
    const tiles = shortestRoadPath(7, 2, 3, 9);
    const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
    expect(keys.size).toBe(tiles.length);
    for (let i = 1; i < tiles.length; i++) {
      const a = tiles[i - 1]!;
      const b = tiles[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
    expect(tiles).toHaveLength(manhattan(7, 2, 3, 9) + 1);
  });

  it("runs along the longer axis first (corner sits at endpoint's minor axis)", () => {
    // dx (3) > dy (1): horizontal leg first, so the turn happens at y0.
    const tiles = shortestRoadPath(0, 0, 3, 1);
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
    ]);
  });

  it("drops tiles outside the world bounds", () => {
    const tiles = shortestRoadPath(-2, 0, 2, 0);
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(WORLD_WIDTH);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(WORLD_HEIGHT);
    }
  });
});
