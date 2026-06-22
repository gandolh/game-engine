import { describe, it, expect } from "vitest";
import { SERVICE_RADII, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import {
  COVERAGE_SERVICE,
  serviceCenter,
  serviceRadius,
  serviceTint,
  NEED_TINT,
  catchmentTiles,
  housesInRadius,
  coverageByNeed,
} from "./coverage";

/** Minimal building-snapshot factory for the geometry tests. */
function b(type: string, x: number, y: number, w = 1, h = 1): BuildingSnapshot {
  return {
    type, x, y, w, h,
    connected: true, outputBuffer: 0, workerCount: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
  };
}

describe("serviceCenter", () => {
  it("matches the sim rule b.x+floor(w/2), b.y+floor(h/2)", () => {
    expect(serviceCenter(b("chapel", 10, 20, 2, 2))).toEqual({ cx: 11, cy: 21 });
    expect(serviceCenter(b("house", 5, 7, 1, 1))).toEqual({ cx: 5, cy: 7 });
    expect(serviceCenter(b("keep", 0, 0, 3, 3))).toEqual({ cx: 1, cy: 1 });
  });
});

describe("serviceRadius / serviceTint", () => {
  it("reads the same SERVICE_RADII constant the sim uses", () => {
    expect(serviceRadius("chapel")).toBe(SERVICE_RADII.chapel);
    expect(serviceRadius("not-a-service")).toBe(0);
  });
  it("tints coverage services by need and others neutral", () => {
    expect(serviceTint("chapel")).toBe(NEED_TINT.faith);
    expect(serviceTint("market")).toBe(NEED_TINT.goods);
    expect(serviceTint("watchpost")).toBe(NEED_TINT.safety);
    // a radius'd building that isn't one of the three needs → neutral, not a need colour
    expect(serviceTint("well")).not.toBe(NEED_TINT.faith);
    expect(COVERAGE_SERVICE.well).toBeUndefined();
  });
});

describe("catchmentTiles", () => {
  it("returns the Manhattan ball with a correct count well inside the map", () => {
    const r = 3;
    const tiles = catchmentTiles(20, 20, r);
    // Manhattan-ball tile count = 2r^2 + 2r + 1
    expect(tiles.length).toBe(2 * r * r + 2 * r + 1);
    // every tile within radius; edges exactly on the perimeter
    for (const t of tiles) {
      const d = Math.abs(t.tx - 20) + Math.abs(t.ty - 20);
      expect(d).toBeLessThanOrEqual(r);
      expect(t.edge).toBe(d === r);
    }
  });

  it("clamps to the world grid", () => {
    const tiles = catchmentTiles(0, 0, 5);
    for (const t of tiles) {
      expect(t.tx).toBeGreaterThanOrEqual(0);
      expect(t.ty).toBeGreaterThanOrEqual(0);
      expect(t.tx).toBeLessThan(WORLD_WIDTH);
      expect(t.ty).toBeLessThan(WORLD_HEIGHT);
    }
    // a quarter of a diamond plus the axes — strictly fewer than the full ball
    expect(tiles.length).toBeLessThan(2 * 25 + 2 * 5 + 1);
  });

  it("returns nothing for a zero/negative radius", () => {
    expect(catchmentTiles(10, 10, 0)).toEqual([]);
  });
});

describe("housesInRadius", () => {
  it("counts only houses within the Manhattan radius (house centre)", () => {
    const buildings = [
      b("house", 10, 10),       // dist 0
      b("house", 13, 10),       // dist 3
      b("house", 18, 10),       // dist 8 — just out at r=7
      b("chapel", 10, 10, 2, 2), // not a house
    ];
    expect(housesInRadius(buildings, 10, 10, 7)).toBe(2);
    expect(housesInRadius(buildings, 10, 10, 8)).toBe(3);
    expect(housesInRadius(buildings, 10, 10, 0)).toBe(1);
  });
});

describe("coverageByNeed", () => {
  it("groups by need and de-duplicates overlapping tiles into a flat fill", () => {
    const groups = coverageByNeed([
      b("chapel", 10, 10, 2, 2),
      b("chapel", 12, 10, 2, 2), // overlaps the first → union, not double-counted
      b("market", 30, 30, 2, 2),
    ]);
    const faith = groups.find((g) => g.need === "faith");
    const goods = groups.find((g) => g.need === "goods");
    expect(groups.find((g) => g.need === "safety")).toBeUndefined();
    expect(faith).toBeDefined();
    expect(goods).toBeDefined();
    // overlay tiles carry no per-tile edge (flat wash) and are unique
    const keys = new Set(faith!.tiles.map((t) => `${t.tx},${t.ty}`));
    expect(keys.size).toBe(faith!.tiles.length);
    expect(faith!.tiles.every((t) => t.edge === false)).toBe(true);
    expect(faith!.hex).toBe(NEED_TINT.faith);
  });

  it("ignores buildings without a coverage need", () => {
    expect(coverageByNeed([b("well", 5, 5), b("house", 1, 1)])).toEqual([]);
  });
});
