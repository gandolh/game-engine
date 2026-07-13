/**
 * Wave 5 acceptance gate — the 8 previously look-alike box-buildings must read
 * distinctly by SILHOUETTE alone (colour stripped down to an alpha mask), not
 * just by palette. Wave 5 reshaped `house`, `bakery`, `woodcutter`, `market`,
 * `public-square`, `watchpost`, `quarry`, `smith`, `sawmill` for exactly this
 * reason; this test locks that in as a regression guard so a future edit that
 * collapses two of them back into the same box is caught headless, without a
 * screenshot.
 *
 * Reuses the exact rasterization + bottom-anchored grid Hamming-distance
 * machinery from ./silhouette.test.ts (GRID=48, uniform-scale + bottom-anchor
 * downsample, then count differing cells) rather than reinventing a metric.
 *
 * SCOPE: only the 8 Wave-5 target types, not all 21 building recipes. There
 * are pre-existing, out-of-scope near-collisions among UNTOUCHED types
 * (mine~healer, storehouse~tradingpost) that Wave 5 did not address; the
 * whole-set guard already lives in silhouette.test.ts at a looser floor (6) —
 * this file asserts a tighter, Wave-5-specific floor for just the 8 that were
 * actually reworked.
 */
import { describe, it, expect } from "vitest";
import { BUILDING_RECIPES } from "./buildings";
import { rasterizeRecipe } from "../rasterize";
import type { PixelRecipe } from "../types";

/** Base building type for a recipe (strip `bld/` + any `@frame` suffix). */
function typeOf(name: string): string {
  return name.slice("bld/".length).split("@")[0]!;
}

/** One day-frame recipe per building type (skip @lit / @mill animation frames). */
function dayFrames(): Map<string, PixelRecipe> {
  const byType = new Map<string, PixelRecipe>();
  for (const r of BUILDING_RECIPES) {
    if (r.name.includes("@")) continue; // animation / lit companion frames
    byType.set(typeOf(r.name), r);
  }
  return byType;
}

const GRID = 48; // matches silhouette.test.ts's normalized silhouette resolution

/** Downsample a recipe's opaque mask to a GRID×GRID occupancy grid (0/1).
 *  Uniform (aspect-preserving) scale + bottom-anchored, X-centred placement —
 *  identical to silhouette.test.ts's silhouetteGrid, reused so both files
 *  agree on what "distinguishable" means. */
function silhouetteGrid(recipe: PixelRecipe): Uint8Array {
  const r = rasterizeRecipe(recipe);
  const cells = new Uint8Array(GRID * GRID);
  const scale = GRID / Math.max(r.width, r.height);
  const usedW = r.width * scale;
  const offX = Math.floor((GRID - usedW) / 2);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.rgba[(y * r.width + x) * 4 + 3]! === 0) continue;
      const gx = Math.min(GRID - 1, offX + Math.floor(x * scale));
      const gy = Math.min(GRID - 1, Math.floor(y * scale));
      cells[gy * GRID + gx] = 1;
    }
  }
  return cells;
}

/** Hamming distance (differing cells) between two normalized silhouette grids. */
function maskDistance(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// The 8 Wave-5 targets — deliberately NOT the full 21-type BUILDING_RECIPES set
// (see file header: other near-collisions are pre-existing and out of scope).
const TARGET_TYPES = [
  "house",
  "bakery",
  "woodcutter",
  "market",
  "public-square",
  "watchpost",
  "quarry",
  "smith",
  "sawmill",
] as const;

function targetGrids(): { type: string; grid: Uint8Array }[] {
  const byType = dayFrames();
  return TARGET_TYPES.map((type) => {
    const recipe = byType.get(type);
    if (!recipe) throw new Error(`missing building recipe for Wave-5 target type "${type}"`);
    return { type, grid: silhouetteGrid(recipe) };
  });
}

describe("wave-5 building silhouette differentiation", () => {
  it("every pair among the 8 reworked types is distinguishable above a floor", () => {
    // Empirically measured (this harness, GRID=48 bottom-anchored grid) pairwise
    // Hamming distances among the 8 targets: minimum observed is house~bakery
    // = 19 (next-closest is public-square~quarry = 59; everything else is well
    // into the hundreds). Floor is set to 12 — below the observed minimum (19)
    // with real margin so it doesn't flap on incidental future tweaks, but far
    // above "trivial" (a palette-only re-skin of the same form differs by only
    // 0–6 cells per silhouette.test.ts's own whole-set floor of 6).
    const FLOOR = 12;
    const grids = targetGrids();
    const tooClose: string[] = [];
    for (let i = 0; i < grids.length; i++) {
      for (let j = i + 1; j < grids.length; j++) {
        const d = maskDistance(grids[i]!.grid, grids[j]!.grid);
        if (d < FLOOR) tooClose.push(`${grids[i]!.type} ~ ${grids[j]!.type} (dist ${d})`);
      }
    }
    expect(tooClose, tooClose.length ? `Silhouettes too similar:\n  ${tooClose.join("\n  ")}` : "").toEqual([]);
  });

  it("each of the 8 differs from the house baseline (does not read as a house)", () => {
    // Cheap explicit check: `house` is the Wave-5 baseline box-building; every
    // other reworked type must clear the same floor against it specifically.
    const FLOOR = 12;
    const grids = targetGrids();
    const house = grids.find((g) => g.type === "house")!;
    const offenders: string[] = [];
    for (const g of grids) {
      if (g.type === "house") continue;
      const d = maskDistance(house.grid, g.grid);
      if (d < FLOOR) offenders.push(`${g.type} (dist from house: ${d})`);
    }
    expect(offenders, offenders.length ? `Reads as a house:\n  ${offenders.join("\n  ")}` : "").toEqual([]);
  });
});
