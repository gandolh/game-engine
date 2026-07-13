/**
 * Tests for the Citadel sprite recipes: palette is EDG32-only (the guard the
 * engine palette.test.ts applies to Farm's swatch, applied here), every recipe
 * rasterizes cleanly (rectangular + valid chars), and the building-type → frame
 * mapping covers exactly the wave-1 building set without drift.
 */
import { describe, it, expect } from "vitest";
import { TILE_SIZE } from "@citadel/sim-core";
import { APOLLO_SET } from "../citadel-palette";
import { SWATCH, colorOf } from "./palette";
import { rasterizeRecipe } from "./rasterize";
import {
  ALL_RECIPES,
  BUILDING_RECIPES,
  UNIT_RECIPES,
  BUILDING_SPRITE_TYPES,
  buildingFrameName,
  millFrameAt,
  MILL_FRAME_COUNT,
  VILLAGER_FRAME,
  RAIDER_FRAME,
  FRAME_PEDESTRIAN,
} from "./recipes";

const toHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

describe("sprite palette (Apollo guard)", () => {
  it("every opaque swatch is an Apollo color", () => {
    const bad: string[] = [];
    for (const [ch, [r, g, b, a]] of Object.entries(SWATCH)) {
      if (a === 0) continue; // transparent
      const hex = toHex(r, g, b);
      if (!APOLLO_SET.has(hex)) bad.push(`${ch} → ${hex}`);
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

  it("iso building frames have diamond-aligned width and positive height; villager/raider are 32×32, pedestrian is 16×16", () => {
    for (const r of BUILDING_RECIPES) {
      // Iso sprite width = (w+h)·ISO_HW, always a multiple of 16 (ISO_HW). Height
      // is roof+walls+diamond — positive, not tile-quantised.
      expect(r.width % (TILE_SIZE), `${r.name} width`).toBe(0);
      expect(r.height, `${r.name} height`).toBeGreaterThan(0);
    }
    for (const r of UNIT_RECIPES) {
      // The two main figures are 32×32; the ambient-crowd commoner is half-res
      // (16×16) so it reads as a smaller background person.
      const expected = r.name === FRAME_PEDESTRIAN ? [16, 16] : [32, 32];
      expect([r.width, r.height], r.name).toEqual(expected);
    }
  });

  it("frame names are unique", () => {
    const names = ALL_RECIPES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every iso building sprite is a non-degenerate volume (transparent corners + a filled body)", () => {
    // Guards the iso generators: a real diamond+roof silhouette has TRANSPARENT
    // corners (the top-left corner pixel must be `.`), and a substantial but
    // not-full filled body (so it's neither a blank nor a solid rectangle).
    //
    // Open forms (the fenced farm FIELD, the open market STALLS, the tall narrow
    // post-MILL) are deliberately sparse — they're not solid boxes — so they get
    // a lower opaque floor. The mill's extra sail-rotation frames share its floor.
    const LOW_FLOOR = new Set(["farm", "market", "mill", "public-square", "quarry"]);
    const floorFor = (name: string): number => {
      const type = name.slice("bld/".length).split("@")[0]!;
      return LOW_FLOOR.has(type) ? 0.06 : 0.2;
    };
    for (const r of BUILDING_RECIPES) {
      const raster = rasterizeRecipe(r);
      // Top-left corner is outside the diamond → transparent.
      expect(raster.rgba[3], `${r.name} top-left corner should be transparent`).toBe(0);
      // Count opaque pixels: never 0 (blank) and never ~100% (a solid box).
      let opaque = 0;
      for (let i = 3; i < raster.rgba.length; i += 4) if (raster.rgba[i]! > 0) opaque++;
      const frac = opaque / (r.width * r.height);
      expect(frac, `${r.name} opaque fraction`).toBeGreaterThan(floorFor(r.name));
      expect(frac, `${r.name} opaque fraction`).toBeLessThan(0.9);
    }
  });

  it("the well's opaque silhouette is centred over its 1×1 footprint (art-09 anchoring)", () => {
    // art-09: the well used to read shifted off its tile — cheap regression guard
    // that the opaque-pixel centroid-x lands within ~2px of the sprite centre-x
    // (no lateral offset), independent of the raw bounding-box check above.
    const well = BUILDING_RECIPES.find((r) => r.name === "bld/well");
    expect(well, "bld/well recipe exists").toBeTruthy();
    const raster = rasterizeRecipe(well!);
    let sumX = 0, opaque = 0;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        if (raster.rgba[(y * raster.width + x) * 4 + 3]! === 0) continue;
        sumX += x;
        opaque++;
      }
    }
    const centroidX = sumX / opaque;
    expect(Math.abs(centroidX - raster.width / 2), `well centroid-x ${centroidX} vs centre ${raster.width / 2}`).toBeLessThanOrEqual(2);
  });

  it("the mill has a base frame + rotated-sail animation frames that all rasterize", () => {
    const millFrames = BUILDING_RECIPES.filter((r) => r.name === "bld/mill" || r.name.startsWith("bld/mill@"));
    expect(millFrames.length, "mill frame count").toBe(MILL_FRAME_COUNT);
    expect(millFrames.some((r) => r.name === "bld/mill"), "base bld/mill exists").toBe(true);
    for (const r of millFrames) expect(() => rasterizeRecipe(r), r.name).not.toThrow();
    // millFrameAt cycles within the frame set and includes the base frame.
    const seen = new Set<string>();
    for (let t = 0; t < 4000; t += 100) seen.add(millFrameAt(t));
    expect(seen.has("bld/mill"), "cycles through base frame").toBe(true);
    for (const f of seen) expect(millFrames.some((r) => r.name === f), `${f} is a real frame`).toBe(true);
  });
});

describe("building-type → frame mapping", () => {
  // The wave-1 contract: every standalone building type has a sprite. Road /
  // wall / gate are deliberately excluded (autotile networks + inset boxes).
  const EXPECTED = [
    "house", "farm", "mill", "bakery", "woodcutter", "storehouse",
    "chapel", "market", "watchpost", "tradingpost", "public-square",
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
    expect(names.has(FRAME_PEDESTRIAN)).toBe(true);
  });
});
