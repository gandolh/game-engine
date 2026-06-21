/**
 * Building sprite recipes — TRUE ISOMETRIC, authored at 4× (`ISO_ART_SCALE`) for
 * medieval detail. Each building type uses a distinct FORM (a half-timbered
 * cottage, a tall post-mill, an open fenced field, open market stalls, a steepled
 * church, a long warehouse, a crenellated keep…) from `iso-draw.ts`, so the
 * *silhouette* — not just the colour — tells a mill from a mine. The whole set
 * holds a medieval-Europe look (timber framing, thatch/tile roofs, stone forts).
 *
 * The MILL is animated: it has a base frame `bld/mill` (sails at phase 0) plus
 * `bld/mill@1..N-1` with the sails rotated; the renderer cycles them on the
 * main-thread render clock (render-only, no sim/determinism impact). See
 * `index.ts` `millFrameAt`.
 *
 * Frame names are `bld/<type>` and MUST match BUILDING_SPRITE_TYPES (asserted by
 * a test). Every color routes through the EDG-derived SWATCH (palette guard).
 */
import type { PixelRecipe } from "../types";
import {
  cottage,
  boxBuilding,
  postMill,
  openField,
  marketStalls,
  church,
  warehouse,
  fort,
  isoWindmillSails,
  isoChimney,
  isoCross,
  isoBanner,
  isoTurret,
  isoWaterWheel,
  isoLogPile,
  isoChoppingBlock,
  isoGrainSacks,
  isoAnvil,
  isoCrates,
  isoShaftMouth,
  isoQuarryPit,
  isoWellHood,
  type IsoPalette,
  type IsoMetrics,
  type FormOpts,
  IsoGrid,
} from "./iso-draw";

// ---------------------------------------------------------------------------
// Iso surface palettes (lit-left / shaded-right per the committed sun direction)
// ---------------------------------------------------------------------------
const PLASTER: IsoPalette = { // cream half-timbered house, terracotta tile roof
  // Terracotta ramp: clay (mid) lit by salmon, shadowed to rust — the warm tiled
  // roof of the reference set. Cream/tan wattle infill, bark-dark oak framing.
  roof: "r", roofLight: "P", roofDark: "R",
  wallL: "c", wallR: "t", wallEdge: "W", outline: "#", door: "W", glass: "B",
};
const STONE: IsoPalette = {
  roof: "i", roofLight: "S", roofDark: "#",
  wallL: "s", wallR: "S", wallEdge: "l", outline: "#", door: "#", glass: "o",
};
const WOOD: IsoPalette = {
  roof: "d", roofLight: "G", roofDark: "#",
  wallL: "t", wallR: "w", wallEdge: "c", outline: "#", door: "W", glass: "B",
};
const CREAM: IsoPalette = { // church stone (light)
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
};
const MARKET: IsoPalette = {
  roof: "e", roofLight: "P", roofDark: "x",
  wallL: "c", wallR: "t", wallEdge: "v", outline: "#", door: "W", glass: "B",
};
const FORT: IsoPalette = {
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "l", wallR: "s", wallEdge: "v", outline: "#", door: "#", glass: "o",
};
const GREENROOF: IsoPalette = { // healer
  roof: "G", roofLight: "g", roofDark: "d",
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
};

/** Compose several accent generators into one accent slot. */
type Accent = (g: IsoGrid, pal: IsoPalette, m: IsoMetrics) => void;
function accents(...fns: Accent[]): FormOpts {
  return { accent: (g, pal, m) => { for (const fn of fns) fn(g, pal, m); } };
}

// ---------------------------------------------------------------------------
// Mill animation frames
// ---------------------------------------------------------------------------

/** Number of windmill-sail rotation frames (covers a 90° sweep; 4-fold sym). */
export const MILL_FRAME_COUNT = 8;
/** Frame name for mill sail rotation step `i` (0 → the base `bld/mill`). */
export function millFrameName(i: number): string {
  return i === 0 ? "bld/mill" : `bld/mill@${i}`;
}

/** Every mill frame: a tall post-mill with the sails rotated through the sweep. */
function millFrames(): PixelRecipe[] {
  const out: PixelRecipe[] = [];
  for (let i = 0; i < MILL_FRAME_COUNT; i++) {
    const phase = i / MILL_FRAME_COUNT;
    out.push(postMill(millFrameName(i), WOOD, (g, m) => isoWindmillSails(g, m, phase)));
  }
  return out;
}

export const BUILDING_RECIPES: readonly PixelRecipe[] = [
  // Dwelling — half-timbered medieval cottage (the reference form).
  cottage("bld/house", 2, 2, 1, PLASTER),
  // Farm — an open fenced field, not a building.
  openField("bld/farm", 3, 3, WOOD),
  // Mill — frame 0 (base `bld/mill`) + rotated sail frames.
  ...millFrames(),
  // Bakery — cottage + a smoking brick oven chimney.
  cottage("bld/bakery", 2, 2, 1, PLASTER, { accent: (g, p, m) => isoChimney(g, p, m, true) }),
  // Woodcutter — timber cottage + chopping block + log pile.
  cottage("bld/woodcutter", 2, 2, 1, WOOD, accents(
    (g, _p, m) => isoLogPile(g, m),
    (g, _p, m) => isoChoppingBlock(g, m),
  )),
  // Storehouse — long timber warehouse with barn doors + crates.
  warehouse("bld/storehouse", 3, 2, 1, WOOD, { accent: (g, _p, m) => isoCrates(g, m) }),
  // Chapel — stone church with a bell tower + steeple + cross.
  church("bld/chapel", 2, 2, 2, CREAM),
  // Market — open-air red-striped stalls.
  marketStalls("bld/market", 2, 2, MARKET),
  // Watchpost — a small crenellated stone lookout + banner.
  fort("bld/watchpost", 2, 2, 2, WOOD, { accent: (g, _p, m) => isoBanner(g, m, "e") }),
  // Trading post — warehouse + crates (clay-roofed plaster).
  warehouse("bld/tradingpost", 3, 2, 1, PLASTER, { accent: (g, _p, m) => isoCrates(g, m) }),
  // Quarry — an open stone pit with terraces + cut ashlar blocks.
  boxBuilding("bld/quarry", 2, 2, 1, STONE, { accent: (g, _p, m) => isoQuarryPit(g, m) }),
  // Sawmill — timber mill + water wheel + log pile.
  cottage("bld/sawmill", 2, 2, 1, WOOD, accents(
    (g, _p, m) => isoWaterWheel(g, m),
    (g, _p, m) => isoLogPile(g, m),
  )),
  // Smith — half-timber forge + glowing chimney + anvil out front.
  cottage("bld/smith", 2, 2, 1, STONE, accents(
    (g, p, m) => isoChimney(g, p, m, true),
    (g, _p, m) => isoAnvil(g, m),
  )),
  // Mine — a timbered pithead (shaft + winding tower) with ore spill.
  boxBuilding("bld/mine", 2, 2, 1, STONE, { accent: (g, _p, m) => isoShaftMouth(g, m, "O") }),
  // Tower — tall crenellated stone tower + watch turret + banner.
  fort("bld/tower", 2, 2, 3, FORT, accents(
    (g, p, m) => isoTurret(g, m, p),
    (g, _p, m) => isoBanner(g, m, "e"),
  )),
  // Garrison — a long fortified stone hall + banner.
  fort("bld/garrison", 3, 2, 2, FORT, { accent: (g, _p, m) => isoBanner(g, m, "e") }),
  // Keep — the big stronghold + central banner.
  fort("bld/keep", 3, 3, 3, FORT, { accent: (g, _p, m) => isoBanner(g, m, "p") }),
  // Town hall — large civic timber-frame hall (warehouse form) + banner.
  warehouse("bld/town-hall", 3, 3, 2, PLASTER, { accent: (g, _p, m) => isoBanner(g, m, "p") }),
  // Healer — cottage + a red medical cross.
  cottage("bld/healer", 2, 2, 1, GREENROOF, { accent: (g, _p, m) => isoCross(g, m, "e") }),
  // Well — stone ring under a gabled hood with a bucket.
  boxBuilding("bld/well", 1, 1, 1, STONE, { accent: (g, _p, m) => isoWellHood(g, m) }),
];
