import { describe, it, expect } from "vitest";
import { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT } from "./terrain";

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
