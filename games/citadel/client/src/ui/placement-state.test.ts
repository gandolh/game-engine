import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import { extendTrail, shortestRoadPath } from "./placement-state";

/** Brief 110: the pure road helpers now bound + key against runtime world dims. */
const DIMS = { width: WORLD_WIDTH, height: WORLD_HEIGHT };

function manhattan(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(x1 - x0) + Math.abs(y1 - y0);
}

/** Assert a trail is contiguous (consecutive tiles 4-adjacent) and duplicate-free. */
function assertTrailValid(trail: Array<{ x: number; y: number }>): void {
  const keys = new Set(trail.map((t) => `${t.x},${t.y}`));
  expect(keys.size).toBe(trail.length);
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
  }
}

/** Drive a freehand trail through a sequence of cursor tiles. */
function trailThrough(...tiles: Array<[number, number]>): Array<{ x: number; y: number }> {
  const trail: Array<{ x: number; y: number }> = [];
  for (const [x, y] of tiles) extendTrail(trail, x, y, DIMS);
  return trail;
}

describe("shortestRoadPath", () => {
  it("returns a single tile when start === end", () => {
    expect(shortestRoadPath(5, 5, 5, 5, DIMS)).toEqual([{ x: 5, y: 5 }]);
  });

  it("draws a straight horizontal run", () => {
    expect(shortestRoadPath(2, 3, 5, 3, DIMS)).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
  });

  it("draws a straight vertical run", () => {
    expect(shortestRoadPath(2, 3, 2, 1, DIMS)).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
    ]);
  });

  it("includes both endpoints and has Manhattan-distance + 1 tiles (L-shaped)", () => {
    const tiles = shortestRoadPath(1, 1, 4, 6, DIMS);
    expect(tiles[0]).toEqual({ x: 1, y: 1 });
    expect(tiles[tiles.length - 1]).toEqual({ x: 4, y: 6 });
    expect(tiles).toHaveLength(manhattan(1, 1, 4, 6) + 1);
  });

  it("produces a path that is the shortest possible length", () => {
    // Every tile in the path is unique and consecutive tiles are 4-adjacent,
    // so the path length equals the Manhattan distance — i.e. shortest.
    const tiles = shortestRoadPath(7, 2, 3, 9, DIMS);
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
    const tiles = shortestRoadPath(0, 0, 3, 1, DIMS);
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
    ]);
  });

  it("drops tiles outside the world bounds", () => {
    const tiles = shortestRoadPath(-2, 0, 2, 0, DIMS);
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

describe("extendTrail (freehand road)", () => {
  it("seeds the trail with the first tile", () => {
    expect(trailThrough([5, 5])).toEqual([{ x: 5, y: 5 }]);
  });

  it("appends one tile per cursor step, following the cursor's actual path", () => {
    // An L-shaped freehand drag: right then down. The trail is exactly the tiles
    // the cursor passed through, NOT a recomputed endpoint-to-endpoint route.
    const trail = trailThrough([0, 0], [1, 0], [2, 0], [2, 1], [2, 2]);
    expect(trail).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    assertTrailValid(trail);
  });

  it("ignores repeated samples on the same tile (cursor hasn't left its tile)", () => {
    const trail = trailThrough([3, 3], [3, 3], [4, 3], [4, 3]);
    expect(trail).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });

  it("gap-fills a fast drag that skipped tiles, staying 4-connected", () => {
    // Cursor jumped from (0,0) to (3,0) in one sample — fill the gap.
    const trail = trailThrough([0, 0], [3, 0]);
    expect(trail).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    assertTrailValid(trail);
  });

  it("follows a different route between the same endpoints than a straight L would", () => {
    // Drag up-and-over instead of the L's over-then-up. The trail records the
    // cursor's actual path; the endpoint-routed L would differ.
    const trail = trailThrough([0, 2], [0, 1], [0, 0], [1, 0], [2, 0]);
    expect(trail).toEqual([
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    // shortestRoadPath (endpoint model) would go over-first along y=2 — different.
    expect(trail).not.toEqual(shortestRoadPath(0, 2, 2, 0, DIMS));
  });

  it("trims back when the cursor drags back over the trail", () => {
    const trail = trailThrough([0, 0], [1, 0], [2, 0], [3, 0]);
    // Drag back to (1,0): the trail trims, dropping (2,0) and (3,0).
    extendTrail(trail, 1, 0, DIMS);
    expect(trail).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    assertTrailValid(trail);
  });

  it("trims to the start when dragged all the way back", () => {
    const trail = trailThrough([4, 4], [5, 4], [6, 4]);
    extendTrail(trail, 4, 4, DIMS);
    expect(trail).toEqual([{ x: 4, y: 4 }]);
  });

  it("drops cursor tiles outside the world bounds", () => {
    const before = trailThrough([0, 0]);
    extendTrail(before, -1, 0, DIMS);
    extendTrail(before, 0, WORLD_HEIGHT, DIMS);
    expect(before).toEqual([{ x: 0, y: 0 }]);
    for (const t of before) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(WORLD_WIDTH);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it("does not re-add a tile already on the trail when gap-filling a loop", () => {
    // Draw a small loop that would re-enter (0,0) via the connector; the trail
    // stays duplicate-free (the drag-back/seen guards handle it).
    const trail = trailThrough([0, 0], [1, 0], [1, 1], [0, 1]);
    // Jump back near the start; connector from (0,1)→(0,0) re-enters (0,0).
    extendTrail(trail, 0, 0, DIMS);
    assertTrailValid(trail);
    // (0,0) trims the trail back to its first tile.
    expect(trail).toEqual([{ x: 0, y: 0 }]);
  });
});
