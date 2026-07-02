/**
 * art-11 regression guard — "roof light points up-left". `drawGableRoof` and
 * `drawFlatCrenellatedTop` shade a roof by which facet faces the committed
 * upper-left (UL) sun; a past bug had the FRONT facet reading brighter than
 * the sunward BACK facet (the roof read "tipped"/reversed). This test
 * rasterises a plain cottage roof and asserts the brightest roof band's mean
 * pixel position sits above-and-left of the darkest roof band's mean position,
 * so that inversion can't silently come back (corpus/todos/2026-07-02-citadel-
 * art-11-roof-slope-shading-fix.md).
 */
import { describe, it, expect } from "vitest";
import { cottage, type IsoPalette } from "./iso-draw";
import { rasterizeRecipe } from "../rasterize";

/** A plain grey test palette: every roof band gets a distinct EDG swatch char
 *  so `roofLight`/`roof`/`roofDark` are unambiguous in the rasterized pixels
 *  (walls/door/glass use separate, non-roof chars so they never get mistaken
 *  for a roof band). */
const GREY: IsoPalette = {
  roof: "S",       // slate (mid)
  roofLight: "v",  // white (brightest)
  roofDark: "i",   // ink (darkest)
  wallL: "l", wallR: "s", wallEdge: "l", outline: "#", door: "W", glass: "B",
};

describe("art-11 roof shading regression — light points up-left", () => {
  it("brightest roof band sits above-and-left of the darkest roof band (plain gable cottage)", () => {
    const recipe = cottage("test/roof-grey", 2, 2, 1, GREY);
    const r = rasterizeRecipe(recipe);

    const lightestSum = { x: 0, y: 0, n: 0 };
    const darkestSum = { x: 0, y: 0, n: 0 };
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const i = (y * r.width + x) * 4;
        if (r.rgba[i + 3]! === 0) continue;
        const ch = recipe.pixels[y]![x]!;
        if (ch === GREY.roofLight) { lightestSum.x += x; lightestSum.y += y; lightestSum.n++; }
        else if (ch === GREY.roofDark) { darkestSum.x += x; darkestSum.y += y; darkestSum.n++; }
      }
    }
    expect(lightestSum.n, "expected some roofLight pixels").toBeGreaterThan(0);
    expect(darkestSum.n, "expected some roofDark pixels").toBeGreaterThan(0);

    const lightMeanX = lightestSum.x / lightestSum.n;
    const lightMeanY = lightestSum.y / lightestSum.n;
    const darkMeanX = darkestSum.x / darkestSum.n;
    const darkMeanY = darkestSum.y / darkestSum.n;

    // "Up-left" under the committed UL sun: the brightest band's centroid must
    // be strictly left of AND at or above the darkest band's centroid.
    expect(lightMeanX, `roofLight centroid x=${lightMeanX} should be left of roofDark centroid x=${darkMeanX}`).toBeLessThan(darkMeanX);
    expect(lightMeanY, `roofLight centroid y=${lightMeanY} should be at/above roofDark centroid y=${darkMeanY}`).toBeLessThanOrEqual(darkMeanY);
  });
});
