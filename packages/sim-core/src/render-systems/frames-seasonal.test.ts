import { describe, it, expect } from "vitest";
import { seasonalTreeFrame } from "./frames";
import { BIG_STRUCTURES } from "./geometry";
import { REGIONS, regionAt } from "../world/regions";
import type { Season } from "../protocols/weather";

const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

describe("seasonalTreeFrame — 4-way foliage remap", () => {
  // base → expected frame per season (summer = base, no suffix).
  const cases: Array<[string, Record<Season, string>]> = [
    ["structure/tree", {
      spring: "structure/tree-blossom", summer: "structure/tree",
      autumn: "structure/tree-autumn", winter: "structure/tree-bare",
    }],
    ["structure/bush", {
      spring: "structure/bush-blossom", summer: "structure/bush",
      autumn: "structure/bush-autumn", winter: "structure/bush-bare",
    }],
    ["structure/fruit-tree", {
      spring: "structure/fruit-tree-blossom", summer: "structure/fruit-tree",
      autumn: "structure/fruit-tree-autumn", winter: "structure/fruit-tree-bare",
    }],
    ["structure/big-tree", {
      spring: "structure/big-tree-blossom", summer: "structure/big-tree",
      autumn: "structure/big-tree-autumn", winter: "structure/big-tree-bare",
    }],
  ];

  for (const [base, expected] of cases) {
    it(`${base} maps to 4 distinct seasonal frames`, () => {
      const got = SEASONS.map((s) => seasonalTreeFrame(base, s));
      expect(got).toEqual(SEASONS.map((s) => expected[s]));
      // four DISTINCT looks (acceptance: blossom/green/autumn/bare)
      expect(new Set(got).size).toBe(4);
    });
  }

  it("non-foliage frames pass through unchanged", () => {
    for (const s of SEASONS) {
      expect(seasonalTreeFrame("structure/forge-house", s)).toBe("structure/forge-house");
      expect(seasonalTreeFrame("decoration/barrel", s)).toBe("decoration/barrel");
      expect(seasonalTreeFrame("structure/fruit-tree-sapling", s)).toBe("structure/fruit-tree-sapling");
    }
  });
});

describe("big-tree island centerpiece", () => {
  it("the big-tree region exists with the 'big-tree' theme", () => {
    const r = REGIONS.find((x) => x.id === "big-tree");
    expect(r).toBeDefined();
    expect(r!.theme).toBe("big-tree");
  });

  it("a structure/big-tree BIG_STRUCTURE sits on the big-tree island", () => {
    const bt = BIG_STRUCTURES.find((b) => b.frame === "structure/big-tree");
    expect(bt, "expected a structure/big-tree baked centerpiece").toBeDefined();
    // its base row sits on the big-tree region
    const wTiles = Math.max(1, Math.round(bt!.wPx / 16));
    let onIsland = false;
    for (let dx = 0; dx < wTiles; dx++) {
      if (regionAt(bt!.baseTileX + dx, bt!.baseTileY) === "big-tree") onIsland = true;
    }
    expect(onIsland).toBe(true);
  });
});
