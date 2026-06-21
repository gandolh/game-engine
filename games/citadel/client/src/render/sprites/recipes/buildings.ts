/**
 * Building sprite recipes — TRUE ISOMETRIC, authored at iso resolution via the
 * `iso-draw.ts` generators (diamond ground + two wall faces + hipped roof), so
 * structures read as real 3D volumes on the 2:1 dimetric grid rather than
 * front-facing billboards. Sprite dimensions come from the shared
 * `isoSpriteDims` (iso.ts) and map 1:1 onto the renderer's `isoFootprintBox`.
 *
 * Frame names are `bld/<type>` and MUST match BUILDING_SPRITE_TYPES (asserted by
 * a test). Every color routes through the EDG-derived SWATCH (palette guard).
 */
import type { PixelRecipe } from "../types";
import {
  makeIsoBuilding,
  isoChimney,
  isoCross,
  isoBanner,
  type IsoPalette,
} from "./iso-draw";

// ---------------------------------------------------------------------------
// Iso surface palettes (lit-left / shaded-right per the committed sun direction)
// ---------------------------------------------------------------------------
const CLAY: IsoPalette = {
  roof: "r", roofLight: "t", roofDark: "R",
  wallL: "c", wallR: "t", wallEdge: "v", outline: "#", door: "W", glass: "B",
};
const STONE: IsoPalette = {
  roof: "i", roofLight: "S", roofDark: "#",
  wallL: "s", wallR: "S", wallEdge: "l", outline: "#", door: "#", glass: "o",
};
const WOOD: IsoPalette = {
  roof: "d", roofLight: "G", roofDark: "#",
  wallL: "t", wallR: "w", wallEdge: "c", outline: "#", door: "W", glass: "B",
};
const CREAM: IsoPalette = {
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
};
const MARKET: IsoPalette = {
  roof: "e", roofLight: "P", roofDark: "x",
  wallL: "c", wallR: "t", wallEdge: "v", outline: "#", door: "W", glass: "B",
};
const FORT: IsoPalette = {
  // Dark navy conical roof over light steel/silver stone walls → clear contrast.
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "l", wallR: "s", wallEdge: "v", outline: "#", door: "#", glass: "o",
};
const GREENROOF: IsoPalette = {
  roof: "G", roofLight: "g", roofDark: "d",
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
};

// Bespoke field/pit shapes keep simpler iso forms.
function farm(): PixelRecipe {
  // A low barn on a tilled diamond — use a short building with a wood palette.
  return makeIsoBuilding("bld/farm", 3, 3, 1, WOOD, (g, _p, m) => {
    // furrow hints: a few darker specks across the front faces
    for (let i = 0; i < 6; i++) g.set(m.cx - 10 + i * 4, m.roofH + m.wallH + 4, "d");
  });
}

export const BUILDING_RECIPES: readonly PixelRecipe[] = [
  makeIsoBuilding("bld/house", 2, 2, 1, CLAY),
  farm(),
  makeIsoBuilding("bld/mill", 2, 2, 2, WOOD, (g, p, m) => isoBanner(g, m, "c")),
  makeIsoBuilding("bld/bakery", 2, 2, 1, CLAY, (g, p, m) => isoChimney(g, p, m, true)),
  makeIsoBuilding("bld/woodcutter", 2, 2, 1, WOOD),
  makeIsoBuilding("bld/storehouse", 3, 2, 1, STONE),
  makeIsoBuilding("bld/chapel", 2, 2, 2, CREAM, (g, _p, m) => isoCross(g, m, "v")),
  makeIsoBuilding("bld/market", 2, 2, 1, MARKET),
  makeIsoBuilding("bld/watchpost", 2, 2, 2, WOOD, (g, _p, m) => isoBanner(g, m, "e")),
  makeIsoBuilding("bld/tradingpost", 3, 2, 1, CLAY),
  makeIsoBuilding("bld/quarry", 2, 2, 1, STONE),
  makeIsoBuilding("bld/sawmill", 2, 2, 1, WOOD),
  makeIsoBuilding("bld/smith", 2, 2, 1, STONE, (g, p, m) => isoChimney(g, p, m, true)),
  makeIsoBuilding("bld/mine", 2, 2, 1, STONE),
  makeIsoBuilding("bld/tower", 2, 2, 3, FORT, (g, _p, m) => isoBanner(g, m, "e")),
  makeIsoBuilding("bld/garrison", 3, 2, 2, FORT, (g, _p, m) => isoBanner(g, m, "e")),
  makeIsoBuilding("bld/keep", 3, 3, 3, FORT, (g, _p, m) => isoBanner(g, m, "p")),
  makeIsoBuilding("bld/town-hall", 3, 3, 2, CLAY, (g, _p, m) => isoBanner(g, m, "p")),
  makeIsoBuilding("bld/healer", 2, 2, 1, GREENROOF, (g, _p, m) => isoCross(g, m, "g")),
  makeIsoBuilding("bld/well", 1, 1, 1, STONE),
];
