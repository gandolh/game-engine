import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import { routeRoadPath, shortestRoadPath, type TileBlockedFn } from "./placement-state";

function manhattan(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}

/** A blocked predicate from an explicit set of "x,y" obstacle tiles. */
function blockedFrom(...tiles: Array<[number, number]>): TileBlockedFn {
  const set = new Set(tiles.map(([x, y]) => `${x},${y}`));
  return (x, y) => set.has(`${x},${y}`);
}

/** Assert a path is contiguous (consecutive tiles 4-adjacent) and hits both ends. */
function assertConnected(
  path: Array<{ x: number; y: number }>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  expect(path[0]).toEqual({ x: x0, y: y0 });
  expect(path[path.length - 1]).toEqual({ x: x1, y: y1 });
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
  }
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

describe("routeRoadPath", () => {
  const nothingBlocked: TileBlockedFn = () => false;

  it("returns the straight L unchanged when nothing is in the way", () => {
    const route = routeRoadPath(1, 1, 4, 6, nothingBlocked);
    expect(route).toEqual(shortestRoadPath(1, 1, 4, 6));
  });

  it("ignores obstacles that don't lie on the straight L (stays the L)", () => {
    // Block a tile far from the L; the fast path should still return the L.
    const route = routeRoadPath(1, 3, 6, 3, blockedFrom([3, 9]));
    expect(route).toEqual(shortestRoadPath(1, 3, 6, 3));
  });

  it("detours around a single building blocking the straight run", () => {
    // Horizontal run y=3 from x=1..6; block the middle two tiles.
    const route = routeRoadPath(1, 3, 6, 3, blockedFrom([3, 3], [4, 3]))!;
    expect(route).not.toBeNull();
    assertConnected(route, 1, 3, 6, 3);
    // No interior tile sits on a blocked cell.
    for (let i = 1; i < route.length - 1; i++) {
      const t = route[i]!;
      expect(t.x === 3 && t.y === 3).toBe(false);
      expect(t.x === 4 && t.y === 3).toBe(false);
    }
  });

  it("treats water as passable (path may cross it — it decks into a bridge)", () => {
    // The blocked predicate models water as NOT blocked, so a straight run over
    // a water tile is kept rather than detoured.
    const water: TileBlockedFn = () => false; // water is never blocked
    const route = routeRoadPath(2, 2, 5, 2, water)!;
    expect(route).toEqual(shortestRoadPath(2, 2, 5, 2));
  });

  it("returns null when the destination is fully walled off", () => {
    // Wall off the goal (5,5) on all four sides.
    const route = routeRoadPath(
      1,
      5,
      5,
      5,
      blockedFrom([4, 5], [6, 5], [5, 4], [5, 6]),
    );
    expect(route).toBeNull();
  });

  it("keeps the endpoint reachable even if it sits on a blocked tile", () => {
    // Goal tile itself is blocked but has a clear neighbour — path still lands on it.
    const route = routeRoadPath(1, 5, 5, 5, blockedFrom([5, 5]))!;
    expect(route).not.toBeNull();
    assertConnected(route, 1, 5, 5, 5);
  });
});
