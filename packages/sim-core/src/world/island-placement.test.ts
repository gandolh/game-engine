import { describe, it, expect } from "vitest";
import {
  placeIslands,
  bspLeaves,
  gapOk,
  GAP,
  COVERAGE_MIN,
  COVERAGE_MAX,
  type RegionSpec,
} from "./island-placement";
import { createRng } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT, type RegionId } from "./regions";

/**
 * A representative spec set roughly matching the real region inventory:
 * ~21 farms (fixed area, varied aspect), ~21 ranches (smaller fixed area),
 * ~31 landmark/special (target area). Total ~73 regions.
 */
function buildSpecs(): RegionSpec[] {
  const specs: RegionSpec[] = [];
  const FARM_AREA = 400; // 20x20-ish, factorable into many aspects
  const RANCH_AREA = 144; // 12x12
  for (let i = 0; i < 21; i++) {
    specs.push({ id: `farm-${i}` as RegionId, kind: "farm", area: FARM_AREA, minSide: 14, maxAspect: 2.5 });
    specs.push({ id: `ranch-${i}` as RegionId, kind: "ranch", area: RANCH_AREA, minSide: 10, maxAspect: 2 });
  }
  // 31 special/landmark regions with a spread of target areas.
  const specialIds = [
    "village", "blacksmith", "carpentry", "mill", "forest-north", "quarry-north",
    "forest-south", "quarry-south", "mushroom-grove", "ice-pond", "well-north",
    "well-south", "shrine", "waterfall", "heritage-stones", "heritage-ruin",
    "heritage-statue", "fishing-isle", "fishing-isle-2", "harbor", "camp",
    "weather-station", "volcano", "casino", "big-tree", "ring",
    "extra-a", "extra-b", "extra-c", "extra-d", "extra-e",
  ];
  for (const id of specialIds) {
    specs.push({ id: id as RegionId, kind: "landmark", area: 300, minSide: 8 });
  }
  return specs;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => 0x1000 + i * 0x9e37);

describe("bspLeaves", () => {
  it("produces the requested leaf count (or fewer if unsplittable) — deterministic", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const a = bspLeaves(createRng(seed).fork("bsp"), 73);
      const b = bspLeaves(createRng(seed).fork("bsp"), 73);
      expect(a).toEqual(b); // determinism
      expect(a.length).toBeLessThanOrEqual(73);
      expect(a.length).toBeGreaterThan(60); // should comfortably fit 73 on 240x240
      // Leaves partition the map: total area == map area, no overlaps.
      let total = 0;
      for (const l of a) total += (l.maxX - l.minX + 1) * (l.maxY - l.minY + 1);
      expect(total).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    }
  });
});

describe("placeIslands — multi-seed properties", () => {
  const specs = buildSpecs();

  it("is deterministic per seed", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const a = placeIslands(seed, specs);
      const b = placeIslands(seed, specs);
      expect(a).toEqual(b);
    }
  });

  it("places every region", () => {
    for (const seed of SEEDS) {
      const r = placeIslands(seed, specs);
      expect(r.islands.length).toBe(specs.length);
      const ids = new Set(r.islands.map((i) => i.id));
      expect(ids.size).toBe(specs.length);
    }
  });

  it("keeps a >=GAP ocean gap between every island pair", () => {
    for (const seed of SEEDS) {
      const { islands } = placeIslands(seed, specs);
      for (let i = 0; i < islands.length; i++) {
        for (let j = i + 1; j < islands.length; j++) {
          expect(gapOk(islands[i]!.bounds, islands[j]!.bounds, GAP)).toBe(true);
        }
      }
    }
  });

  it("keeps every island inside the map", () => {
    for (const seed of SEEDS) {
      for (const isl of placeIslands(seed, specs).islands) {
        expect(isl.bounds.minX).toBeGreaterThanOrEqual(0);
        expect(isl.bounds.minY).toBeGreaterThanOrEqual(0);
        expect(isl.bounds.maxX).toBeLessThan(WORLD_WIDTH);
        expect(isl.bounds.maxY).toBeLessThan(WORLD_HEIGHT);
      }
    }
  });

  it("preserves fixed farm area with varied aspect", () => {
    for (const seed of SEEDS) {
      const farms = placeIslands(seed, specs).islands.filter((i) => i.kind === "farm");
      for (const f of farms) {
        const w = f.bounds.maxX - f.bounds.minX + 1;
        const h = f.bounds.maxY - f.bounds.minY + 1;
        expect(w * h).toBe(400); // fixed area
      }
      // Across all farms, more than one distinct aspect should appear.
      const aspects = new Set(
        farms.map((f) => {
          const w = f.bounds.maxX - f.bounds.minX + 1;
          return w;
        }),
      );
      expect(aspects.size).toBeGreaterThan(1);
    }
  });

  it("lands coverage in the acceptance band for most seeds", () => {
    let inBand = 0;
    for (const seed of SEEDS) {
      const r = placeIslands(seed, specs);
      if (r.coverage >= COVERAGE_MIN && r.coverage <= COVERAGE_MAX) inBand++;
    }
    // Soft target: the vast majority of seeds should hit the band.
    expect(inBand).toBeGreaterThanOrEqual(SEEDS.length * 0.8);
  });
});
