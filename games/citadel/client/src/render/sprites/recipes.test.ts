/**
 * Tests for the Citadel sprite recipes: palette is EDG32-only (the guard the
 * engine palette.test.ts applies to Farm's swatch, applied here), every recipe
 * rasterizes cleanly (rectangular + valid chars), and the building-type → frame
 * mapping covers exactly the wave-1 building set without drift.
 */
import { describe, it, expect } from "vitest";
import { EDG32 } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import { SWATCH, colorOf } from "./palette";
import { rasterizeRecipe } from "./rasterize";
import {
  ALL_RECIPES,
  BUILDING_RECIPES,
  UNIT_RECIPES,
  BUILDING_SPRITE_TYPES,
  buildingFrameName,
  VILLAGER_FRAME,
  RAIDER_FRAME,
} from "./recipes";

const EDG32_SET = new Set<string>(EDG32);
const toHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

describe("sprite palette (EDG32 guard)", () => {
  it("every opaque swatch is an EDG32 color", () => {
    const bad: string[] = [];
    for (const [ch, [r, g, b, a]] of Object.entries(SWATCH)) {
      if (a === 0) continue; // transparent
      const hex = toHex(r, g, b);
      if (!EDG32_SET.has(hex)) bad.push(`${ch} → ${hex}`);
    }
    expect(bad, bad.length ? `Off-palette swatches:\n  ${bad.join("\n  ")}` : "").toEqual([]);
  });

  it("colorOf throws on an unknown char", () => {
    expect(() => colorOf("?")).toThrow();
  });
});

describe("recipes integrity", () => {
  it("every recipe rasterizes (rectangular rows + valid chars)", () => {
    for (const r of ALL_RECIPES) {
      expect(() => rasterizeRecipe(r), `recipe ${r.name}`).not.toThrow();
    }
  });

  it("building frames are sized to whole tiles; units are 16×16", () => {
    for (const r of BUILDING_RECIPES) {
      expect(r.width % TILE_SIZE, `${r.name} width`).toBe(0);
      expect(r.height % TILE_SIZE, `${r.name} height`).toBe(0);
    }
    for (const r of UNIT_RECIPES) {
      expect([r.width, r.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it("frame names are unique", () => {
    const names = ALL_RECIPES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("building-type → frame mapping", () => {
  // The wave-1 contract: every standalone building type has a sprite. Road /
  // wall / gate are deliberately excluded (autotile networks + inset boxes).
  const EXPECTED = [
    "house", "farm", "mill", "bakery", "woodcutter", "storehouse",
    "chapel", "market", "watchpost", "tradingpost",
    "quarry", "sawmill", "smith", "mine",
    "tower", "garrison", "keep", "town-hall",
    "well", "healer",
  ].sort();

  it("covers exactly the wave-1 building set", () => {
    expect([...BUILDING_SPRITE_TYPES].sort()).toEqual(EXPECTED);
  });

  it("each building type maps to its `bld/<type>` recipe", () => {
    for (const type of BUILDING_SPRITE_TYPES) {
      expect(BUILDING_RECIPES.some((r) => r.name === buildingFrameName(type))).toBe(true);
    }
  });

  it("the unit frames exist in the recipe set", () => {
    const names = new Set(ALL_RECIPES.map((r) => r.name));
    expect(names.has(VILLAGER_FRAME)).toBe(true);
    expect(names.has(RAIDER_FRAME)).toBe(true);
  });
});
