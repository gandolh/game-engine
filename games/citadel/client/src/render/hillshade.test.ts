/**
 * Pure-function tests for the terrain hillshade landform relief.
 *
 * The hillshade math is exercised against SYNTHETIC height samplers (a flat
 * plane, a plane sloping one way or the other) so the assertions pin the
 * lighting model itself, not a particular terrain seed. The grid-aware fill is
 * exercised against small hand-built terrain grids.
 */
import { describe, it, expect } from "vitest";
import { CITADEL_PAL as EDG } from "./citadel-palette";
import { TerrainType } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";
import {
  TERRAIN_RELIEF,
  terrainRelief,
  landformHeight,
  hillshade,
  shadeBand,
  SHADE_BAND_THRESHOLD,
  type HeightSampler,
} from "./hillshade";
import { makeHeightSampler, landformFill, DITHER_ACCENTS } from "./terrain-dither";

const EDG_HEXES = new Set(Object.values(EDG).map((h) => String(h).toLowerCase()));

const ALL_TYPES: TerrainType[] = [
  TerrainType.Grass, TerrainType.Water, TerrainType.Forest, TerrainType.Stone, TerrainType.Rough,
];

/** Build a small terrain grid from a per-cell kind function. */
function makeGrid(width: number, height: number, kind: (tx: number, ty: number) => TerrainType): TerrainGrid {
  const cells = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) cells[ty * width + tx] = kind(tx, ty);
  }
  return { cells, width, height };
}

describe("terrainRelief (terrain kind → pseudo-elevation)", () => {
  it("orders the kinds water < rough < grass < forest < stone", () => {
    expect(terrainRelief(TerrainType.Water)).toBeLessThan(terrainRelief(TerrainType.Rough));
    expect(terrainRelief(TerrainType.Rough)).toBeLessThan(terrainRelief(TerrainType.Grass));
    expect(terrainRelief(TerrainType.Grass)).toBeLessThan(terrainRelief(TerrainType.Forest));
    expect(terrainRelief(TerrainType.Forest)).toBeLessThan(terrainRelief(TerrainType.Stone));
  });

  it("covers every terrain type with a value in [0,1]", () => {
    for (const t of ALL_TYPES) {
      const v = TERRAIN_RELIEF[t];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("landformHeight (fBm rolling blended with terrain kind)", () => {
  it("stays within [0,1] across the full input range", () => {
    for (const t of ALL_TYPES) {
      for (const n of [0, 0.25, 0.5, 0.75, 1]) {
        const h = landformHeight(n, t);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rises monotonically with the noise term (same kind)", () => {
    expect(landformHeight(0.2, TerrainType.Grass)).toBeLessThan(landformHeight(0.8, TerrainType.Grass));
  });

  it("keeps stone above water even when noise fights the kind", () => {
    // Stone at its lowest noise must still out-top water at its highest noise —
    // the kind must dominate so features read as coherent landforms.
    expect(landformHeight(0, TerrainType.Stone)).toBeGreaterThan(landformHeight(1, TerrainType.Water));
  });
});

describe("hillshade (NW-lit slope shading)", () => {
  // A flat plane at a fixed height.
  const flat = (h: number): HeightSampler => () => h;
  // A plane whose height RISES toward the west (low tx = high) — its surface
  // faces the NW sun, so it should read LIT (> 0).
  const risesWest: HeightSampler = (tx) => 0.5 - tx * 0.05;
  // A plane whose height RISES toward the east — faces away, reads SHADOWED (< 0).
  const risesEast: HeightSampler = (tx) => 0.5 + tx * 0.05;

  it("is positive (lit) for a slope facing the NW light", () => {
    expect(hillshade(risesWest, 3, 3)).toBeGreaterThan(0);
  });

  it("is negative (shadowed) for a slope facing away from the light", () => {
    expect(hillshade(risesEast, 3, 3)).toBeLessThan(0);
  });

  it("is ~zero on locally-flat mid-height ground", () => {
    expect(Math.abs(hillshade(flat(0.5), 3, 3))).toBeLessThan(1e-9);
  });

  it("applies a gentle hypsometric bias: high flat ground lighter than low", () => {
    // Slope is zero on a flat plane, so only the absolute-height term acts.
    expect(hillshade(flat(0.9), 3, 3)).toBeGreaterThan(0);
    expect(hillshade(flat(0.1), 3, 3)).toBeLessThan(0);
  });
});

describe("shadeBand (quantize hillshade into dark / base / light)", () => {
  it("maps sign past the threshold to ±1 and the neutral zone to 0", () => {
    expect(shadeBand(SHADE_BAND_THRESHOLD + 0.1)).toBe(1);
    expect(shadeBand(-(SHADE_BAND_THRESHOLD + 0.1))).toBe(-1);
    expect(shadeBand(0)).toBe(0);
    expect(shadeBand(SHADE_BAND_THRESHOLD - 0.01)).toBe(0);
  });
});

describe("makeHeightSampler (grid-aware heightfield)", () => {
  it("is deterministic and edge-clamps out-of-bounds probes", () => {
    const grid = makeGrid(8, 8, () => TerrainType.Grass);
    const sample = makeHeightSampler(grid);
    expect(sample(3, 3)).toBe(sample(3, 3)); // memoized/deterministic
    // Out-of-bounds probe clamps to the border cell (no wrap, no NaN).
    expect(sample(-5, 3)).toBe(sample(0, 3));
    expect(sample(99, 3)).toBe(sample(7, 3));
  });

  it("samples water lower than stone at the same coordinate", () => {
    const waterGrid = makeGrid(4, 4, () => TerrainType.Water);
    const stoneGrid = makeGrid(4, 4, () => TerrainType.Stone);
    expect(makeHeightSampler(waterGrid)(2, 2)).toBeLessThan(makeHeightSampler(stoneGrid)(2, 2));
  });
});

describe("landformFill (hillshaded base diamond fill)", () => {
  it("is deterministic and always an EDG swatch", () => {
    const grid = makeGrid(16, 16, (tx) => (tx < 8 ? TerrainType.Water : TerrainType.Stone));
    const sample = makeHeightSampler(grid);
    for (let ty = 0; ty < 16; ty++) {
      for (let tx = 0; tx < 16; tx++) {
        const t = grid.cells[ty * 16 + tx] as TerrainType;
        const a = landformFill(sample, t, tx, ty);
        expect(landformFill(sample, t, tx, ty)).toBe(a);
        expect(EDG_HEXES.has(a.toLowerCase())).toBe(true);
      }
    }
  });

  it("leaves water unbanded (its own shimmer handles it)", () => {
    const grid = makeGrid(8, 8, () => TerrainType.Water);
    const sample = makeHeightSampler(grid);
    for (let i = 0; i < 8; i++) {
      expect(landformFill(sample, TerrainType.Water, i, i)).toBe(EDG.skyBlue);
    }
  });

  it("shades a stone ridge flanked by water into both lit and shadowed faces", () => {
    // A stone strip with water on BOTH sides is a ridge: its west flank rises to
    // the east (away from the NW sun → shadowed/dark) and its east flank rises to
    // the west (toward the sun → lit/light). Both accents must appear, i.e. the
    // ridge reads as shaped relief rather than a flat slab of one tone.
    const kind = (tx: number): TerrainType =>
      tx < 5 || tx >= 11 ? TerrainType.Water : TerrainType.Stone;
    const grid = makeGrid(16, 16, kind);
    const sample = makeHeightSampler(grid);
    const seen = new Set<string>();
    for (let ty = 2; ty < 14; ty++) {
      for (let tx = 5; tx < 11; tx++) seen.add(landformFill(sample, TerrainType.Stone, tx, ty));
    }
    expect(seen.has(DITHER_ACCENTS[TerrainType.Stone].dark)).toBe(true);
    expect(seen.has(DITHER_ACCENTS[TerrainType.Stone].light)).toBe(true);
  });
});
