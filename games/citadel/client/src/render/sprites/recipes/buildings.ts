/**
 * Building sprite recipes — TRUE ISOMETRIC, authored at 2× (`ISO_ART_SCALE`) for
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
  wellForm,
  openField,
  openPit,
  marketStalls,
  plaza,
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
  type IsoPalette,
  type IsoMetrics,
  type FormOpts,
  IsoGrid,
} from "./iso-draw";

// ---------------------------------------------------------------------------
// Iso surface palettes (lit-left / shaded-right per the committed sun direction)
// ---------------------------------------------------------------------------
// Per-palette `wallDeep` (audited valley band, warm/cool neighbour, never black)
// and `kiss` (warm ridge/near-corner highlight) come from the art-01 palette-role
// audit table (see the brief). Straight-darker steps are swapped for warm/cool
// EDG32 neighbours so shadows shift in hue, not just value.
const PLASTER: IsoPalette = { // cream half-timbered house, terracotta tile roof
  // Terracotta ramp: clay (mid) lit by salmon, shadowed to rust — the warm tiled
  // roof of the reference set. Cream/tan wattle infill, bark-dark oak framing.
  roof: "r", roofLight: "P", roofDark: "R",
  wallL: "c", wallR: "t", wallEdge: "W", outline: "#", door: "W", glass: "B",
  wallDeep: "w", kiss: "O",   // wall valley → wood; gold ridge/corner kiss
};
const STONE: IsoPalette = {
  // roofDark lifted off pure black to ink (a real dark shade) per the iso-art
  // "valley corners = darkest-shade, not black" rule — keeps roof faces reading as
  // three distinct values.
  roof: "S", roofLight: "l", roofDark: "i",
  wallL: "s", wallR: "S", wallEdge: "l", outline: "#", door: "#", glass: "o",
  wallDeep: "n", kiss: "P",   // slate → navy valley; faint salmon warm kiss
};
const WOOD: IsoPalette = {
  roof: "d", roofLight: "G", roofDark: "%",  // ink → bark: warm-brown roof shadow, not cold-black
  wallL: "t", wallR: "w", wallEdge: "c", outline: "#", door: "W", glass: "B",
  wallDeep: "W", kiss: "O",   // wall valley → woodDark; gold sun-kiss on ridge
};
const MILL: IsoPalette = { // tower mill: warm tan/cream stone body + clay cap
  roof: "r", roofLight: "P", roofDark: "R",      // terracotta clay cap
  wallL: "c", wallR: "t", wallEdge: "v", outline: "%", door: "W", glass: "B",
  wallDeep: "w", kiss: "P",   // cool toward wood for the 3rd body band
};
const CREAM: IsoPalette = { // church stone (light)
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
  wallDeep: "t", kiss: "P",   // drop cream → tan so the wall face darkens; salmon ridge kiss
};
const MARKET: IsoPalette = {
  roof: "e", roofLight: "P", roofDark: "x",
  wallL: "c", wallR: "t", wallEdge: "v", outline: "#", door: "W", glass: "B",
  wallDeep: "w", kiss: "P",   // cool toward wood for the deepest fold
};
const FORT: IsoPalette = {
  roof: "n", roofLight: "S", roofDark: "i",
  wallL: "l", wallR: "s", wallEdge: "v", outline: "#", door: "#", glass: "o",
  wallDeep: "n", kiss: "P",   // deepen steel → slate/navy valley; salmon kiss
};
const GREENROOF: IsoPalette = { // healer
  roof: "G", roofLight: "g", roofDark: "T",  // greenDark → teal for the roof shadow
  wallL: "v", wallR: "c", wallEdge: "v", outline: "#", door: "W", glass: "C",
  wallDeep: "t", kiss: "O",   // drop cream → tan wall valley; yellow/gold sun-kiss
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

// ---------------------------------------------------------------------------
// Dusk-lit window-glow variants
// ---------------------------------------------------------------------------

/**
 * Frame name for a building's DUSK-LIT variant (windows lamplit). The renderer
 * can select `bld/<type>@lit` by night factor, exactly like the mill's rotated
 * `@N` frames — render-only, deterministic. `@`-suffixed, so it's excluded from
 * BUILDING_SPRITE_TYPES (it's a frame of an existing type, not a new type).
 */
export function buildingLitFrameName(type: string): string {
  return `bld/${type}@lit`;
}

/** Cottage-family building types that have a lit-window dusk variant. */
export const LIT_BUILDING_TYPES: readonly string[] = ["house", "bakery", "smith", "healer"];

/**
 * Dusk-lit companion frames for the window-bearing cottages: the same FORM +
 * accents but with `glow: true` so the panes read as warm lamplight. Named
 * `bld/<type>@lit`; the renderer picks them by night factor. Kept in lockstep
 * with their day frames above (same palette + accents).
 */
function litFrames(): PixelRecipe[] {
  return [
    cottage("bld/house@lit", 2, 2, 1, PLASTER, { ground: true, glow: true }),
    cottage("bld/bakery@lit", 2, 2, 1, PLASTER, { ground: true, groundSeed: 1, cottageStyle: "oven", glow: true, accent: (g, p, m) => isoChimney(g, p, m, true) }),
    cottage("bld/smith@lit", 2, 2, 1, STONE, { cottageStyle: "forge", glow: true, accent: (g, p, m) => { isoChimney(g, p, m, true); isoAnvil(g, m); } }),
    cottage("bld/healer@lit", 2, 2, 2, GREENROOF, { ground: true, groundSeed: 1, cottageStyle: "jetty", glow: true, accent: (g, _p, m) => isoCross(g, m, "e") }),
  ];
}

/** Every mill frame: a tall post-mill with the sails rotated through the sweep. */
function millFrames(): PixelRecipe[] {
  const out: PixelRecipe[] = [];
  for (let i = 0; i < MILL_FRAME_COUNT; i++) {
    const phase = i / MILL_FRAME_COUNT;
    out.push(postMill(millFrameName(i), MILL, (g, m) => isoWindmillSails(g, m, phase)));
  }
  return out;
}

export const BUILDING_RECIPES: readonly PixelRecipe[] = [
  // Dwelling — half-timbered medieval cottage (the reference form) on a plot.
  cottage("bld/house", 2, 2, 1, PLASTER, { ground: true }),
  // Farm — an open fenced field, not a building.
  openField("bld/farm", 3, 3, WOOD),
  // Mill — frame 0 (base `bld/mill`) + rotated sail frames.
  ...millFrames(),
  // Bakery — a SQUAT cottage dominated by a large external domed bread-OVEN bulge
  // (breaking the near-left wall/roof line) + a smoke plume + chimney + plot props.
  cottage("bld/bakery", 2, 2, 1, PLASTER, { ground: true, groundSeed: 1, cottageStyle: "oven", accent: (g, p, m) => isoChimney(g, p, m, true) }),
  // Woodcutter — a SMALL compact cabin (skinnier + shorter than the house) +
  // chopping block + a log pile, so its mask reads as a little hut, not a house.
  cottage("bld/woodcutter", 2, 2, 1, WOOD, { cottageStyle: "cabin", accent: (g, _p, m) => { isoLogPile(g, m); isoChoppingBlock(g, m); } }),
  // Storehouse — long timber warehouse with barn doors + crates.
  warehouse("bld/storehouse", 3, 2, 1, WOOD, { accent: (g, _p, m) => isoCrates(g, m) }),
  // Chapel — stone church with a bell tower + steeple + cross.
  church("bld/chapel", 2, 2, 2, CREAM),
  // Market — open-air red-striped stalls.
  marketStalls("bld/market", 2, 2, MARKET),
  // Public square — cozy-pivot Phase G: open cobblestone plaza with a raised
  // dais + festival banner pole, no walls (a civic gathering place, not a shop).
  plaza("bld/public-square", 2, 2, STONE),
  // Watchpost — a RAISED timber lookout on stilts: open air between the posts, a
  // railed deck, a small capped cabin on top + banner. The stilted mask never
  // reads as a house. heightTiles 1 keeps it inside the box envelope (the raised
  // deck + open bays, not extra height, carry the "lookout tower" read).
  fort("bld/watchpost", 2, 2, 1, WOOD, { fortVariant: "watchpost", accent: (g, _p, m) => isoBanner(g, m, "e") }),
  // Trading post — warehouse with a striped market CANOPY front + crates.
  warehouse("bld/tradingpost", 3, 2, 1, PLASTER, { warehouseStyle: "canopy", accent: (g, _p, m) => isoCrates(g, m) }),
  // Quarry — an open SUNKEN terraced stone pit (no building box) + cut blocks.
  openPit("bld/quarry", 2, 2, STONE, { accent: (g, _p, m) => isoQuarryPit(g, m) }),
  // Sawmill — mono-pitch lean-to timber shed + water wheel + log pile.
  cottage("bld/sawmill", 2, 2, 1, WOOD, { cottageStyle: "leanto", accent: (g, _p, m) => { isoWaterWheel(g, m); isoLogPile(g, m); } }),
  // Smith — an OPEN-SIDED forge canopy (roof on posts, open front, back hearth) +
  // glowing chimney + anvil out front. The open bays make the mask unmistakable.
  cottage("bld/smith", 2, 2, 1, STONE, { cottageStyle: "forge", accent: (g, p, m) => { isoChimney(g, p, m, true); isoAnvil(g, m); } }),
  // Mine — a low stone pithead DOMINATED by a tall timber winding-tower A-frame
  // breaking the roofline (shaft + headframe + ore spill), so it reads as a
  // machine, not a house. heightTiles 2 lifts the headframe clear of the body.
  boxBuilding("bld/mine", 2, 2, 2, STONE, { noDoor: true, accent: (g, _p, m) => isoShaftMouth(g, m, "O") }),
  // Tower — a tall ROUND stone drum capped by a crenellated ring + banner.
  fort("bld/tower", 2, 2, 3, FORT, { fortVariant: "tower", accent: (g, _p, m) => isoBanner(g, m, "e") }),
  // Garrison — a long fortified stone hall with a raised front gatehouse + banner.
  fort("bld/garrison", 3, 2, 2, FORT, { fortVariant: "garrison", accent: (g, _p, m) => isoBanner(g, m, "e") }),
  // Keep — the big square donjon: battlements + four bristling corner turrets + banner.
  fort("bld/keep", 3, 3, 3, FORT, { fortVariant: "keep", accent: (g, _p, m) => isoBanner(g, m, "p") }),
  // Town hall — civic hall: a raised clock/bell gable + front portico + banner.
  warehouse("bld/town-hall", 3, 3, 2, PLASTER, { warehouseStyle: "civic", accent: (g, _p, m) => isoBanner(g, m, "p") }),
  // Healer — a taller jettied (overhanging upper storey) apothecary + red cross + plot props.
  cottage("bld/healer", 2, 2, 2, GREENROOF, { ground: true, groundSeed: 1, cottageStyle: "jetty", accent: (g, _p, m) => isoCross(g, m, "e") }),
  // Well — a small round stone well-head with a roofed windlass + bucket.
  wellForm("bld/well", STONE),
  // Dusk-lit window-glow companion frames (render-selected by night factor).
  ...litFrames(),
];
