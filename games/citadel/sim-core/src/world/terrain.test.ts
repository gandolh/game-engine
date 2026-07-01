import { describe, it, expect } from "vitest";
import {
  generateTerrain,
  isWalkable,
  riverColAtRow,
  edgeWaterColumns,
  findCoreBox,
  coreBoxCenter,
  CORE_BOX_W,
  CORE_BOX_H,
  TerrainType,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "./terrain";

// ---------------------------------------------------------------------------
// Local helpers for the Phase I clustering + solvability tests below. The
// box-scan (findCoreBox) and box dims are now imported from terrain.ts — the
// SINGLE source of truth the cold open also calls — rather than hand-mirrored,
// so these tests validate the true cold-open contract, not a copied constant.
// The flood-fill below stays local (it only observes the public `cells` grid).
// ---------------------------------------------------------------------------

/**
 * 4-connected flood-fill from `startIdx` over walkable tiles (Water/Rough are
 * walls). Returns a Uint8Array mask of reachable tiles.
 */
function floodFillWalkable(cells: Uint8Array, width: number, height: number, startIdx: number): Uint8Array {
  const reachable = new Uint8Array(width * height);
  const stack: number[] = [startIdx];
  reachable[startIdx] = 1;
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbors: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (reachable[nIdx]) continue;
      const t = cells[nIdx]!;
      if (t === TerrainType.Water || t === TerrainType.Rough) continue;
      reachable[nIdx] = 1;
      stack.push(nIdx);
    }
  }
  return reachable;
}

describe("generateTerrain", () => {
  it("produces a grid of the correct dimensions", () => {
    const grid = generateTerrain(42);
    expect(grid.width).toBe(WORLD_WIDTH);
    expect(grid.height).toBe(WORLD_HEIGHT);
    expect(grid.cells.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
  });

  it("same seed → identical terrain grid", () => {
    const a = generateTerrain(0xdeadbeef);
    const b = generateTerrain(0xdeadbeef);
    expect(a.cells).toEqual(b.cells);
  });

  it("different seeds → different grids", () => {
    const a = generateTerrain(1);
    const b = generateTerrain(2);
    // With high probability (near certainty) different seeds produce different results
    let differs = false;
    for (let i = 0; i < a.cells.length; i++) {
      if (a.cells[i] !== b.cells[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("all terrain type values are valid TerrainType enum values", () => {
    const grid = generateTerrain(7);
    const validValues = new Set([
      TerrainType.Grass,
      TerrainType.Water,
      TerrainType.Forest,
      TerrainType.Stone,
      TerrainType.Rough,
    ]);
    for (let i = 0; i < grid.cells.length; i++) {
      expect(validValues.has(grid.cells[i]!)).toBe(true);
    }
  });

  it("contains all terrain types (varied terrain)", () => {
    const grid = generateTerrain(12345);
    const seen = new Set<number>();
    for (const v of grid.cells) seen.add(v);
    expect(seen.has(TerrainType.Grass)).toBe(true);
    expect(seen.has(TerrainType.Water)).toBe(true);
    expect(seen.has(TerrainType.Forest)).toBe(true);
  });
});

describe("edge-coherent river", () => {
  const seeds = [0, 1, 42, 999, 0xdeadbeef, 0xffffffff];

  it("riverColAtRow is a pure function of (seed, ty)", () => {
    for (const seed of seeds) {
      for (const ty of [0, 7, 48, WORLD_HEIGHT - 1]) {
        expect(riverColAtRow(seed, ty)).toBe(riverColAtRow(seed, ty));
      }
    }
  });

  it("the river mouth column at top/bottom edges equals edgeWaterColumns(seed)", () => {
    for (const seed of seeds) {
      const [top, bottom] = edgeWaterColumns(seed);
      expect(riverColAtRow(seed, 0)).toBeCloseTo(top, 6);
      expect(riverColAtRow(seed, WORLD_HEIGHT - 1)).toBeCloseTo(bottom, 6);
    }
  });

  it("water touches both the top and bottom edges (river enters/exits the map)", () => {
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      let topWater = false;
      let bottomWater = false;
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (grid.cells[0 * WORLD_WIDTH + tx] === TerrainType.Water) topWater = true;
        if (grid.cells[(WORLD_HEIGHT - 1) * WORLD_WIDTH + tx] === TerrainType.Water) {
          bottomWater = true;
        }
      }
      expect(topWater).toBe(true);
      expect(bottomWater).toBe(true);
    }
  });

  it("the carved top/bottom mouth columns are water", () => {
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      const [top, bottom] = edgeWaterColumns(seed);
      expect(grid.cells[0 * WORLD_WIDTH + top]).toBe(TerrainType.Water);
      expect(grid.cells[(WORLD_HEIGHT - 1) * WORLD_WIDTH + bottom]).toBe(TerrainType.Water);
    }
  });
});

describe("isWalkable", () => {
  it("returns false for out-of-bounds tiles", () => {
    const grid = generateTerrain(1);
    expect(isWalkable(grid, -1, 0)).toBe(false);
    expect(isWalkable(grid, 0, -1)).toBe(false);
    expect(isWalkable(grid, WORLD_WIDTH, 0)).toBe(false);
    expect(isWalkable(grid, 0, WORLD_HEIGHT)).toBe(false);
  });

  it("water tiles are not walkable", () => {
    const grid = generateTerrain(42);
    // Find a water tile
    let found = false;
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (grid.cells[ty * WORLD_WIDTH + tx] === TerrainType.Water) {
          expect(isWalkable(grid, tx, ty)).toBe(false);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it("grass tiles are walkable", () => {
    const grid = generateTerrain(42);
    let found = false;
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (grid.cells[ty * WORLD_WIDTH + tx] === TerrainType.Grass) {
          expect(isWalkable(grid, tx, ty)).toBe(true);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });
});

describe("bootstrapSim determinism", () => {
  it("same seed produces identical grids across multiple generateTerrain calls", () => {
    const seeds = [0, 1, 999, 0xffffffff];
    for (const seed of seeds) {
      const a = generateTerrain(seed);
      const b = generateTerrain(seed);
      expect(a.cells).toEqual(b.cells);
    }
  });
});

describe("resource clustering (Phase I)", () => {
  // 4-connected same-type neighbour check for a single tile.
  function hasSameTypeNeighbour(cells: Uint8Array, width: number, height: number, tx: number, ty: number): boolean {
    const t = cells[ty * width + tx]!;
    const neighbors: Array<[number, number]> = [
      [tx - 1, ty],
      [tx + 1, ty],
      [tx, ty - 1],
      [tx, ty + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (cells[ny * width + nx] === t) return true;
    }
    return false;
  }

  it("forest tiles overwhelmingly form connected patches, not singleton sprinkles", () => {
    const seeds = [0, 1, 7, 42, 999, 12345, 0xdeadbeef];
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      let total = 0;
      let withNeighbour = 0;
      for (let ty = 0; ty < grid.height; ty++) {
        for (let tx = 0; tx < grid.width; tx++) {
          if (grid.cells[ty * grid.width + tx] !== TerrainType.Forest) continue;
          total++;
          if (hasSameTypeNeighbour(grid.cells, grid.width, grid.height, tx, ty)) withNeighbour++;
        }
      }
      expect(total).toBeGreaterThan(0);
      const ratio = withNeighbour / total;
      expect(ratio).toBeGreaterThan(0.9);
    }
  });

  it("stone tiles overwhelmingly form connected patches, not singleton sprinkles", () => {
    const seeds = [0, 1, 7, 42, 999, 12345, 0xdeadbeef];
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      let total = 0;
      let withNeighbour = 0;
      for (let ty = 0; ty < grid.height; ty++) {
        for (let tx = 0; tx < grid.width; tx++) {
          if (grid.cells[ty * grid.width + tx] !== TerrainType.Stone) continue;
          total++;
          if (hasSameTypeNeighbour(grid.cells, grid.width, grid.height, tx, ty)) withNeighbour++;
        }
      }
      expect(total).toBeGreaterThan(0);
      const ratio = withNeighbour / total;
      expect(ratio).toBeGreaterThan(0.9);
    }
  });
});

describe("solvability guarantee (Phase I)", () => {
  // Scattered sample across 0..49 plus a few larger seeds, rather than every
  // integer 0..49, to keep the suite fast while still exercising a wide
  // spread of RNG streams (including seeds reported to trigger repair).
  const seeds = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  ];

  it("every generated map has a buildable core box (via the shared findCoreBox), reachable from it", () => {
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      // Call the SAME exported helper the cold open uses — full-grid scan.
      const anchor = findCoreBox(grid.cells, grid.width, grid.height);
      expect(anchor, `seed ${seed}: no buildable ${CORE_BOX_W}x${CORE_BOX_H} core box found`).not.toBeNull();
    }
  });

  it("every generated map has at least one reachable Forest and one reachable Stone tile from the core", () => {
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      const anchor = findCoreBox(grid.cells, grid.width, grid.height);
      expect(anchor).not.toBeNull();
      const coreX = anchor!.x + Math.floor(CORE_BOX_W / 2);
      const coreY = anchor!.y + Math.floor(CORE_BOX_H / 2);
      const coreIdx = coreY * grid.width + coreX;

      const reachable = floodFillWalkable(grid.cells, grid.width, grid.height, coreIdx);

      let forestReachable = false;
      let stoneReachable = false;
      for (let i = 0; i < grid.cells.length; i++) {
        if (!reachable[i]) continue;
        if (grid.cells[i] === TerrainType.Forest) forestReachable = true;
        if (grid.cells[i] === TerrainType.Stone) stoneReachable = true;
      }
      expect(forestReachable, `seed ${seed}: no reachable Forest tile from core center`).toBe(true);
      expect(stoneReachable, `seed ${seed}: no reachable Stone tile from core center`).toBe(true);
    }
  });

  it("the guarantee and the cold open agree: findCoreBox returns an all-buildable box, and calling it twice is stable", () => {
    // The guarantee (inside generateTerrain) and the cold open (seedFoundingTown)
    // BOTH call the exported findCoreBox on the finished grid. Proving the helper
    // is deterministic and always returns a fully-buildable box on the finished
    // grid proves the two sites are in lockstep — they cannot anchor different
    // boxes because they run the identical scan over the identical grid.
    for (const seed of seeds) {
      const grid = generateTerrain(seed);
      const a = findCoreBox(grid.cells, grid.width, grid.height);
      const b = findCoreBox(grid.cells, grid.width, grid.height);
      expect(a, `seed ${seed}: findCoreBox returned null on a repaired grid`).not.toBeNull();
      // Same helper, same grid → identical anchor (what makes the two sites agree).
      expect(a).toEqual(b);
      // Every tile of the returned box is buildable (the contract the guarantee ensures).
      for (let dy = 0; dy < CORE_BOX_H; dy++) {
        for (let dx = 0; dx < CORE_BOX_W; dx++) {
          const t = grid.cells[(a!.y + dy) * grid.width + (a!.x + dx)]!;
          expect(t === TerrainType.Water || t === TerrainType.Rough, `seed ${seed}: box tile (${a!.x + dx},${a!.y + dy}) not buildable`).toBe(false);
        }
      }
    }
  });

  it("coreBoxCenter yields a fully in-bounds anchor for the default world", () => {
    const { cx, cy } = coreBoxCenter(WORLD_WIDTH, WORLD_HEIGHT);
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cx + CORE_BOX_W).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(cy + CORE_BOX_H).toBeLessThanOrEqual(WORLD_HEIGHT);
  });
});

describe("solvability repair determinism", () => {
  it(
    "same seed → byte-identical cells across repeated generateTerrain calls, for seeds known to trigger repair",
    () => {
      // Per the implementer's report, scanning 0..99 found forest repair firing
      // on 3 seeds and stone repair on 10 (12 total needing some repair). We
      // don't know the exact seeds here, so we scan a broad deterministic range
      // ourselves; the assertion (same seed twice → identical grid) covers the
      // repair path regardless of which seeds actually triggered a paint, since
      // repairSolvability runs unconditionally inside generateTerrain.
      const candidateSeeds: number[] = [];
      for (let seed = 0; seed < 100; seed++) {
        candidateSeeds.push(seed);
      }

      for (const seed of candidateSeeds) {
        const a = generateTerrain(seed);
        const b = generateTerrain(seed);
        expect(a.cells).toEqual(b.cells);
      }
    },
    20000,
  );

  it("different seeds among the repair-prone range still diverge", () => {
    const a = generateTerrain(13);
    const b = generateTerrain(14);
    let differs = false;
    for (let i = 0; i < a.cells.length; i++) {
      if (a.cells[i] !== b.cells[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});
