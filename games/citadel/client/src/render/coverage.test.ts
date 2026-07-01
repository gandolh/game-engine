import { describe, it, expect } from "vitest";
import { SERVICE_RADII, SERVICE_RECTS, coversRect, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import {
  COVERAGE_SERVICE,
  serviceCenter,
  serviceRadius,
  serviceTint,
  NEED_TINT,
  catchmentTiles,
  rectCatchmentTiles,
  serviceCatchment,
  housesInRadius,
  coverageByNeed,
} from "./coverage";

/** Minimal building-snapshot factory for the geometry tests. */
function b(type: string, x: number, y: number, w = 1, h = 1): BuildingSnapshot {
  return {
    type, x, y, w, h,
    connected: true, outputBuffer: 0, workerCount: 0, occupancy: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
    lacksFaith: true, lacksSafety: true, lacksGoods: true, mood: 40,
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
    expect(serviceTint("public-square")).toBe(NEED_TINT.festival);
    // a radius'd building that isn't one of the four needs → neutral, not a need colour
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

describe("rectCatchmentTiles", () => {
  it("returns a w×h rectangle centred (even-span anchored to +x/+y)", () => {
    // 8 wide × 6 tall around (20,20): cols 16..23, rows 17..22.
    const tiles = rectCatchmentTiles(20, 20, 8, 6);
    expect(tiles.length).toBe(8 * 6);
    const xs = tiles.map((t) => t.tx);
    const ys = tiles.map((t) => t.ty);
    expect(Math.min(...xs)).toBe(16);
    expect(Math.max(...xs)).toBe(23);
    expect(Math.min(...ys)).toBe(17);
    expect(Math.max(...ys)).toBe(22);
  });

  it("flags the border tiles as edge and interior tiles as non-edge", () => {
    const tiles = rectCatchmentTiles(20, 20, 8, 6);
    for (const t of tiles) {
      const onBorder = t.tx === 16 || t.tx === 23 || t.ty === 17 || t.ty === 22;
      expect(t.edge).toBe(onBorder);
    }
  });

  it("clamps to the world grid and returns nothing for a degenerate size", () => {
    for (const t of rectCatchmentTiles(0, 0, 8, 6)) {
      expect(t.tx).toBeGreaterThanOrEqual(0);
      expect(t.ty).toBeGreaterThanOrEqual(0);
    }
    expect(rectCatchmentTiles(10, 10, 0, 6)).toEqual([]);
  });
});

describe("serviceCatchment (shape dispatch)", () => {
  it("previews the well as its 8×6 rectangle from SERVICE_RECTS", () => {
    const rect = SERVICE_RECTS.well!;
    const tiles = serviceCatchment("well", 20, 20);
    expect(tiles.length).toBe(rect.w * rect.h);
    // Identical to the direct rect helper — single source of truth.
    expect(tiles).toEqual(rectCatchmentTiles(20, 20, rect.w, rect.h));
    // Every previewed tile is inside the sim's coversRect for the same centre.
    for (const t of tiles) {
      expect(coversRect("well", 20, 20, t.tx, t.ty)).toBe(true);
    }
  });

  it("previews a diamond service as its Manhattan ball", () => {
    const tiles = serviceCatchment("chapel", 30, 30);
    expect(tiles).toEqual(catchmentTiles(30, 30, SERVICE_RADII.chapel!));
  });

  it("returns nothing for a non-service type", () => {
    expect(serviceCatchment("house", 10, 10)).toEqual([]);
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
      b("public-square", 50, 50, 2, 2),
    ]);
    const faith = groups.find((g) => g.need === "faith");
    const goods = groups.find((g) => g.need === "goods");
    const festival = groups.find((g) => g.need === "festival");
    expect(groups.find((g) => g.need === "safety")).toBeUndefined();
    expect(faith).toBeDefined();
    expect(goods).toBeDefined();
    expect(festival).toBeDefined();
    expect(festival!.hex).toBe(NEED_TINT.festival);
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
