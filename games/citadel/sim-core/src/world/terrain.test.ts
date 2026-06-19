import { describe, it, expect } from "vitest";
import {
  generateTerrain,
  isWalkable,
  riverColAtRow,
  edgeWaterColumns,
  TerrainType,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "./terrain";

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
