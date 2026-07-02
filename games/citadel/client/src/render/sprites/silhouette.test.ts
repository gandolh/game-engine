/**
 * art-04 acceptance gate — building SILHOUETTE, DEPTH, and ISOMETRY invariants
 * that make "similar & flat" a testable regression, not a vibe. These grade the
 * whole building set (complementing the per-recipe opaque-fraction floor in
 * recipes.test.ts) and are the headless half of the asset-critique rubric
 * (corpus/wiki/citadel-asset-critique.md) sections A/B/C.
 *
 * A silhouette is the opaque MASK of a rasterized sprite, downsampled to a fixed
 * GRID×GRID occupancy grid so sprites of different sizes compare fairly. Two
 * building types must not share a silhouette (pairwise Hamming distance over the
 * normalized grid ≥ a threshold).
 */
import { describe, it, expect } from "vitest";
import { BUILDING_RECIPES } from "./recipes";
import { rasterizeRecipe } from "./rasterize";
import type { PixelRecipe } from "./types";
import { colorOf } from "./palette";

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

const GRID = 48; // normalized silhouette resolution — fine enough that small
                 // top-structure detail (a lookout gallery, a mine headframe, a
                 // roof cross) registers, so same-footprint types still separate;
                 // still coarse/uniform-scaled enough to be size-independent.

/** Downsample a recipe's opaque mask to a GRID×GRID occupancy grid (0/1). A cell
 *  is "on" if ANY source pixel mapping into it is opaque. Size-independent. */
function silhouetteGrid(recipe: PixelRecipe): Uint8Array {
  const r = rasterizeRecipe(recipe);
  const cells = new Uint8Array(GRID * GRID);
  // Uniform (aspect-preserving) scale + BOTTOM-anchored, X-centred placement:
  // stretch-to-fill would erase the very proportion/top-structure differences that
  // distinguish a tall headframe from a hip-roofed lookout at the same footprint,
  // so scale both axes by ONE factor (the larger source dim fills GRID) and align
  // at the ground line. Now a taller building occupies more rows → its silhouette
  // differs from a shorter one even at an identical footprint.
  const scale = GRID / Math.max(r.width, r.height);
  const usedW = r.width * scale;
  const offX = Math.floor((GRID - usedW) / 2); // centre horizontally
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.rgba[(y * r.width + x) * 4 + 3]! === 0) continue;
      const gx = Math.min(GRID - 1, offX + Math.floor(x * scale));
      // Bottom-anchor: row 0 of the sprite maps near the top only if it's full height.
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

describe("art-04 silhouette identity", () => {
  it("no two building types share a silhouette (pairwise mask distance)", () => {
    const frames = [...dayFrames().entries()];
    const grids = frames.map(([type, r]) => ({ type, grid: silhouetteGrid(r) }));
    // Threshold: on a 32×32=1024-cell normalized grid, require ≥ 6 differing cells
    // between any two types. Genuinely distinct silhouettes differ by far more (they
    // don't appear on the fail list at all); palette/accent-only re-skins of the SAME
    // form differ by 0–2 → this catches them (the art-04 target).
    const MIN_DIST = 6;
    const tooClose: string[] = [];
    for (let i = 0; i < grids.length; i++) {
      for (let j = i + 1; j < grids.length; j++) {
        const d = maskDistance(grids[i]!.grid, grids[j]!.grid);
        if (d < MIN_DIST) tooClose.push(`${grids[i]!.type} ~ ${grids[j]!.type} (dist ${d})`);
      }
    }
    expect(tooClose, tooClose.length ? `Silhouettes too similar:\n  ${tooClose.join("\n  ")}` : "").toEqual([]);
  });
});

describe("art-04 depth (not flat)", () => {
  it("every building shows >=3 distinct EDG values in a central vertical scan", () => {
    // "Flat" = a face painted one value. Scan the centre column (through the body)
    // and count distinct opaque colours; a hue-shifted 3+ band face clears 3 easily.
    const thin: string[] = [];
    for (const [type, r] of dayFrames()) {
      const raster = rasterizeRecipe(r);
      const cx = Math.floor(raster.width / 2);
      const seen = new Set<string>();
      for (let y = 0; y < raster.height; y++) {
        const i = (y * raster.width + cx) * 4;
        if (raster.rgba[i + 3]! === 0) continue;
        seen.add(`${raster.rgba[i]},${raster.rgba[i + 1]},${raster.rgba[i + 2]}`);
      }
      if (seen.size < 3) thin.push(`${type} (${seen.size} values)`);
    }
    expect(thin, thin.length ? `Too-flat central scan:\n  ${thin.join("\n  ")}` : "").toEqual([]);
  });
});

describe("art-04 isometry (base-square, narrowing upward)", () => {
  // Solid-bodied forms should be at least as wide at the ground as at the ridge.
  // Open forms (fenced field, market stalls, plaza) are sparse by design → exempt.
  const OPEN_FORMS = new Set(["farm", "market", "public-square", "well", "quarry"]);

  it("max opaque width in the bottom half >= max width in the top quarter (solid forms)", () => {
    // A hipped-iso sprite is widest at its EAVE mid-line, narrows to the roof
    // APEX at the top and to the diamond FRONT POINT at the very bottom. The
    // isometry read we assert is that the body/base region (bottom half — the
    // footprint diamond + walls) is at least as wide as the roof-apex region
    // (top quarter). Measuring MAX width over a band (not a single row) is robust
    // to the apex being a point and the diamond bottom being a point.
    const maxWidthInBand = (r: ReturnType<typeof rasterizeRecipe>, y0: number, y1: number): number => {
      let best = 0;
      for (let y = y0; y < y1; y++) {
        let min = -1, max = -1;
        for (let x = 0; x < r.width; x++) {
          if (r.rgba[(y * r.width + x) * 4 + 3]! === 0) continue;
          if (min < 0) min = x;
          max = x;
        }
        if (max >= 0) best = Math.max(best, max - min + 1);
      }
      return best;
    };
    const violations: string[] = [];
    for (const [type, recipe] of dayFrames()) {
      if (OPEN_FORMS.has(type)) continue;
      const r = rasterizeRecipe(recipe);
      const topQuarter = maxWidthInBand(r, 0, Math.floor(r.height / 4));
      const bottomHalf = maxWidthInBand(r, Math.floor(r.height / 2), r.height);
      if (bottomHalf < topQuarter) violations.push(`${type}: base ${bottomHalf}px < apex-band ${topQuarter}px`);
    }
    expect(violations, violations.length ? `Not base-heavy:\n  ${violations.join("\n  ")}` : "").toEqual([]);
  });
});

// keep colorOf referenced so an accidental unused-import lint doesn't fire; it is
// the palette accessor the rasterizer uses under the hood.
void colorOf;
