import type { IconRecipe } from "./recipe";
import { validateIconRecipe } from "./recipe";

/**
 * `@engine/ui`'s built-in icon set: building, tool and good glyphs for the in-canvas UI
 * (Citadel's build bar + goods strip; Farm's HUD).
 *
 * **Size: 16x16.** A first pass at 12x12 collapsed on the fine-grained goods — `grain` vs
 * `flour` vs `bread` need a readable silhouette AND two shade bands, and 12px could not
 * carry both (the 12px wheat stalk rendered as mush). 16px is the standard pixel-art icon
 * size, is exactly 2x the 8px body-font cell, and 2x's to 32px for a larger HUD target
 * without a redraw.
 *
 * Each recipe is a 16-row ASCII grid of SHADE indices (`.`/`1`/`2`/`3` — see `./recipe`),
 * never colours: the consumer supplies a 3-colour ramp from its own palette, which is what
 * lets ONE icon set serve Citadel (Apollo-46) and Farm (EDG32). Every recipe is validated
 * eagerly at module load, so a malformed grid throws at import rather than rendering garbage.
 *
 * ## Authoring rule (learned the hard way — do not skip)
 *
 * **Never author or edit an icon without LOOKING at it:**
 *
 *     npx tsx engine/ui/tools/icon-sheet.ts [nameFilter]
 *
 * Citadel's building art was authored blind as ASCII pixel recipes, shipped unreadable, and
 * had to be rebuilt from scratch as 3D meshes. Pixel art written without a render→look→adjust
 * loop does not work; that tool is the loop.
 *
 * Silhouette first: an icon is recognised by its OUTLINE at 16px, not by interior detail.
 * `1` (dark) carries the outline/shadow, `2` (mid) the body, `3` (light) the highlight.
 */
export const ICON_SIZE = 16;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
/** Gable-roofed dwelling: peaked roof, walls, two windows and a central door. */
const HOUSE: IconRecipe = {
  name: "house",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".......11.......",
    "......1111......",
    ".....111111.....",
    "....11111111....",
    "...1111111111...",
    "..111111111111..",
    ".11111111111111.",
    "1111111111111111",
    ".22222222222222.",
    ".23322222233222.",
    ".23322222233222.",
    ".22222222222222.",
    ".22222111222222.",
    ".22222111222222.",
    ".22222111222222.",
  ],
};
/** Storehouse: a wide barn with a broad gable and big double doors. */
const STOREHOUSE: IconRecipe = {
  name: "storehouse",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "....11111111....",
    "...1111111111...",
    "..111111111111..",
    ".11111111111111.",
    "1111111111111111",
    ".22222222222222.",
    ".22222222222222.",
    ".21111111111112.",
    ".21333113331112.",
    ".21333113331112.",
    ".21333113331112.",
    ".21333113331112.",
    ".21111111111112.",
    ".22222222222222.",
  ],
};
/** Well: a stone head under a roof on two posts, with the water below. */
const WELL: IconRecipe = {
  name: "well",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".....111111.....",
    "....11111111....",
    "...1111111111...",
    "..111111111111..",
    "..2..........2..",
    "..2....33....2..",
    "..2....33....2..",
    "..2..........2..",
    "..111111111111..",
    "..133333333111..",
    "..132222223111..",
    "..132222223111..",
    "..133333333111..",
    "..111111111111..",
    "................",
  ],
};
/** Farm: a tilled field of furrows with a young sprout breaking the rows. */
const FARM: IconRecipe = {
  name: "farm",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "......3..3......",
    ".......33.......",
    "....3..33..3....",
    ".....3.33.3.....",
    ".......33.......",
    ".......33.......",
    "1111111111111111",
    "2222222222222222",
    "1111111111111111",
    "2222222222222222",
    "1111111111111111",
    "2222222222222222",
    "1111111111111111",
    "2222222222222222",
  ],
};
/** Mill: a windmill tower with four sails set as a diagonal cross. */
const MILL: IconRecipe = {
  name: "mill",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "33...........33.",
    ".33.........33..",
    "..33.......33...",
    "...33.....33....",
    "....33...33.....",
    ".....33.33......",
    "......111.......",
    ".....11111......",
    "....33.33.33....",
    "...33...33..33..",
    "..33....22...33.",
    ".33.....22....33",
    "......2222......",
    "......2222......",
    ".....222222.....",
    ".....211112.....",
  ],
};
/** Bakery: a domed oven with a chimney and a lit mouth. */
const BAKERY: IconRecipe = {
  name: "bakery",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "..........111...",
    "..........111...",
    "....1111..111...",
    "..11222211111...",
    ".1222222221111..",
    ".1222222222211..",
    "122222222222221.",
    "122222222222221.",
    "122211111122221.",
    "122133333312221.",
    "122133333312221.",
    "122133333312221.",
    "122211111122221.",
    "122222222222221.",
    "111111111111111.",
    "................",
  ],
};
/** Woodcutter: an axe buried in a chopping stump. */
const WOODCUTTER: IconRecipe = {
  name: "woodcutter",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "..........333...",
    ".........33333..",
    "........3333333.",
    "........3333333.",
    ".......11133333.",
    "......111..333..",
    ".....111........",
    "....111.........",
    "...111..........",
    "..111...........",
    "..11............",
    ".1122222222222..",
    "..2233333333322.",
    "..2222222222222.",
    "..1111111111111.",
  ],
};
/** Sawmill: a toothed circular saw blade with a hub. */
const SAWMILL: IconRecipe = {
  name: "sawmill",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "...1.1.11.1.1...",
    "..111111111111..",
    ".1113333333111..",
    ".1133322233311..",
    "113322222223331.",
    "133222111222331.",
    "113221111122331.",
    "113221111122331.",
    "133222111222331.",
    "113322222223331.",
    ".1133322233311..",
    ".1113333333111..",
    "..111111111111..",
    "...1.1.11.1.1...",
    "................",
  ],
};
/** Quarry: a stepped open pit cut down into stone. */
const QUARRY: IconRecipe = {
  name: "quarry",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "3333333333333333",
    "3333333333333333",
    "1111111111111111",
    "..222222222222..",
    "..222222222222..",
    "..111111111111..",
    "....22222222....",
    "....22222222....",
    "....11111111....",
    "......2222......",
    "......2222......",
    "......1111......",
    "................",
    "..33.......33...",
    ".3333.....3333..",
  ],
};
/** Mine: a mountain with a timbered shaft entrance. */
const MINE: IconRecipe = {
  name: "mine",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".......33.......",
    "......3333......",
    ".....333333.....",
    "....33333333....",
    "...3333333333...",
    "..333333333333..",
    ".33333333333333.",
    "3333311111333333",
    "3333122221333333",
    "3331222222133333",
    "3331211112133333",
    "3331211112133333",
    "3331211112133333",
    "1111211112111111",
    "................",
  ],
};
/** Smith: an anvil on its block. */
const SMITH: IconRecipe = {
  name: "smith",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "................",
    "...33333333333..",
    "..3333333333333.",
    ".33333333333333.",
    ".333333333333...",
    "..22222222......",
    "...222222.......",
    "....2222........",
    "....2222........",
    "...111111.......",
    "..11111111......",
    ".1111111111.....",
    ".1111111111.....",
    "................",
  ],
};
/** Town hall: a civic block with a bell gable and a columned front. */
const TOWN_HALL: IconRecipe = {
  name: "town-hall",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    ".......1........",
    ".......1........",
    "......111.......",
    ".....11111......",
    "....1111111.....",
    "...111111111....",
    "..11111111111...",
    ".1111111111111..",
    "1111111111111111",
    ".22222222222222.",
    ".23322222233222.",
    ".22222222222222.",
    "1111111111111111",
    ".21.21.21.21.12.",
    ".21.21.21.21.12.",
    "1111111111111111",
  ],
};
/** Chapel: a nave with a steeple and a cross on top. */
const CHAPEL: IconRecipe = {
  name: "chapel",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "......11........",
    "....1111111.....",
    "......11........",
    "......11........",
    ".....1111.......",
    "....111111......",
    "...11111111.....",
    "..1111111111....",
    ".111111111111...",
    "11111111111111..",
    ".222222222222221",
    ".223322222233321",
    ".223322222233321",
    ".222222111222221",
    ".222222111222221",
    ".222222111222221",
  ],
};
/** Market: an open stall under a striped awning, with goods on the table. */
const MARKET: IconRecipe = {
  name: "market",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "..111111111111..",
    ".13313313313311.",
    ".13313313313311.",
    ".13313313313311.",
    "..111111111111..",
    "...1........1...",
    "...1..3333..1...",
    "...1.333333.1...",
    "...1..3333..1...",
    "..111111111111..",
    "..222222222222..",
    "...2........2...",
    "...2........2...",
    "...2........2...",
  ],
};
/** Watchpost: a raised lookout cabin on stilts with a railed deck. */
const WATCHPOST: IconRecipe = {
  name: "watchpost",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "....11111111....",
    "...1111111111...",
    "..111111111111..",
    "..1..........1..",
    "..1..333333..1..",
    "..1..333333..1..",
    "..1..333333..1..",
    "..111111111111..",
    "..111111111111..",
    "....2......2....",
    "....2......2....",
    "...2........2...",
    "...2........2...",
    "..2..........2..",
    "..2..........2..",
  ],
};
/** Trading post: a covered wagon on two wheels. */
const TRADINGPOST: IconRecipe = {
  name: "tradingpost",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "....11111111....",
    "...1333333331...",
    "..133333333331..",
    ".13333333333331.",
    ".13333333333331.",
    ".13333333333331.",
    ".13333333333331.",
    ".11111111111111.",
    ".22222222222222.",
    "..2..........2..",
    ".111........111.",
    "12221......12221",
    "12221......12221",
    ".111........111.",
  ],
};
/** Healer: an apothecary cross. */
const HEALER: IconRecipe = {
  name: "healer",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    ".....111111.....",
    ".....133331.....",
    ".....133331.....",
    "..111133331111..",
    "..133333333331..",
    "..133333333331..",
    "..133333333331..",
    "..111133331111..",
    ".....133331.....",
    ".....133331.....",
    ".....133331.....",
    ".....111111.....",
    "................",
    "................",
  ],
};
/** Public square: a fountain basin on a paved plaza. */
const PUBLIC_SQUARE: IconRecipe = {
  name: "public-square",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".......33.......",
    "......3..3......",
    ".....3....3.....",
    "......3..3......",
    ".......33.......",
    "......1111......",
    "......1111......",
    "...1111111111...",
    "...1333333331...",
    "...1333333331...",
    "...1111111111...",
    "................",
    "..2.2.2..2.2.2..",
    "................",
    "..2.2.2..2.2.2..",
  ],
};
/** Gate: an arched opening through a wall. */
const GATE: IconRecipe = {
  name: "gate",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "11.1111111111.11",
    "1111111111111111",
    "2222222222222222",
    "2222222222222222",
    "22222......2222.",
    "22222111111.2222",
    "2221333333312222",
    "2221333333312222",
    "2221333333312222",
    "2221333333312222",
    "2221333333312222",
    "2221333333312222",
    "2221333333312222",
    "1111111111111111",
    "................",
  ],
};
/** Tower: a tall crenellated tower with an arrow slit. */
const TOWER: IconRecipe = {
  name: "tower",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "....11.11.11....",
    "....11111111....",
    "...1111111111...",
    "...1222222221...",
    "...1233333321...",
    "...1233333321...",
    "....12333321....",
    "....12333321....",
    "....12333321....",
    "....12311321....",
    "....12311321....",
    "....12311321....",
    "...11231132111..",
    "...1111111111...",
    "................",
  ],
};
/** Garrison: a fortified hall with battlements and an arched door. */
const GARRISON: IconRecipe = {
  name: "garrison",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "11.11.11.11.11.1",
    "1111111111111111",
    "1222222222222221",
    "1233322222233321",
    "1233322222233321",
    "1222222222222221",
    "1222222222222221",
    "1222211111222221",
    "1222213331222221",
    "1222213331222221",
    "1222213331222221",
    "1222213331222221",
    "1111111111111111",
    "................",
  ],
};
/** Keep: the big donjon — battlements and two corner turrets. */
const KEEP: IconRecipe = {
  name: "keep",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "11.11......11.11",
    "1111111..1111111",
    "1222221..1222221",
    "1233321..1233321",
    "1222221111222221",
    "1222222222222221",
    "11.11.11.11.1111",
    "1111111111111111",
    "1222222222222221",
    "1223332223332221",
    "1223332223332221",
    "1222222222222221",
    "1222211111222221",
    "1222213331222221",
    "1222213331222221",
    "1111111111111111",
  ],
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
/** Road: a cobbled path running to the horizon. */
const ROAD: IconRecipe = {
  name: "road",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "......1111......",
    "......1221......",
    ".....112211.....",
    ".....122221.....",
    ".....1.22.1.....",
    "....11.22.11....",
    "....12.22.21....",
    "...11..22..11...",
    "...12..22..21...",
    "..11...22...11..",
    "..12...22...21..",
    ".11....22....11.",
    ".1.....22.....1.",
    "................",
  ],
};
/** Wall: a crenellated stone wall segment with block courses. */
const WALL: IconRecipe = {
  name: "wall",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "................",
    "11.11.11.11.11.1",
    "1111111111111111",
    "1222122212221222",
    "1222122212221222",
    "1111111111111111",
    "2122212221222122",
    "2122212221222122",
    "1111111111111111",
    "1222122212221222",
    "1222122212221222",
    "1111111111111111",
    "................",
    "................",
  ],
};
/** Upgrade: a bold chevron pointing up, over a base bar. */
const UPGRADE: IconRecipe = {
  name: "upgrade",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".......11.......",
    "......1331......",
    ".....133331.....",
    "....13333331....",
    "...1333333331...",
    "..133333333331..",
    ".13311333331131.",
    ".1111133331111.1",
    ".....133331.....",
    ".....133331.....",
    ".....133331.....",
    ".....111111.....",
    "................",
    "..111111111111..",
    "..133333333331..",
  ],
};
/** Demolish: a pickaxe striking — the destructive counterpart to build. */
const DEMOLISH: IconRecipe = {
  name: "demolish",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "..111.......111.",
    ".13331.....1333.",
    "1333331...13331.",
    "13333331113331..",
    ".1333333333331..",
    "..1111333311....",
    "......1331......",
    ".....1331.......",
    ".....133........",
    "....1331........",
    "....133.........",
    "...1331.........",
    "...133..........",
    "...11...........",
    "................",
  ],
};
/** Cancel: a bold X — clears the current placement mode. */
const CANCEL: IconRecipe = {
  name: "cancel",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    ".11..........11.",
    "1331........1331",
    "13331......13331",
    ".13331....13331.",
    "..13331..13331..",
    "...1333113331...",
    "....133333331...",
    "....133333331...",
    "...13331.13331..",
    "..13331...13331.",
    ".13331.....13331",
    "13331.......1333",
    "1331.........133",
    ".11...........11",
    "................",
  ],
};

// ---------------------------------------------------------------------------
// Goods
// ---------------------------------------------------------------------------
/** Grain: a wheat sheaf — ears on a stalk with leaves. */
const GRAIN: IconRecipe = {
  name: "grain",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    ".......33.......",
    "......3333......",
    "......3333......",
    ".....333333.....",
    "....33.33.33....",
    "....33.33.33....",
    "...33..33..33...",
    "...33..33..33...",
    "..33...33...33..",
    "..33...33...33..",
    "...3...33...3...",
    ".......22.......",
    "...3...22...3...",
    "..333..22..333..",
    "...33..22..33...",
    ".......22.......",
  ],
};
/** Flour: a tied sack, bulging, with a folded neck. */
const FLOUR: IconRecipe = {
  name: "flour",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "......1111......",
    ".....133331.....",
    ".....111111.....",
    "......1111......",
    ".....111111.....",
    "....13333331....",
    "...1333333331...",
    "..133333333331..",
    "..133333333331..",
    "..133322233331..",
    "..133322233331..",
    "..133333333331..",
    "..133333333331..",
    "..111111111111..",
    "................",
  ],
};
/** Bread: a round scored loaf. */
const BREAD: IconRecipe = {
  name: "bread",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "....11111111....",
    "..113333333311..",
    ".13333333333331.",
    "1333133133133331",
    "1331331331331331",
    "1333133133133331",
    "1333333333333331",
    "1333333333333331",
    "1222222222222221",
    "1222222222222221",
    ".12222222222221.",
    "..1122222222211.",
    "....11111111....",
    "................",
  ],
};
/** Wood: two stacked round logs, end-on (growth rings). */
const WOOD: IconRecipe = {
  name: "wood",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "...111111111....",
    "..13333333331...",
    ".1333222233331..",
    ".1332211112331..",
    ".1332133312331..",
    ".1332211112331..",
    ".1333222233331..",
    "..13333333331...",
    "...111111111....",
    "..111111111.....",
    ".13333333331....",
    "1333222233331...",
    "1332133312331...",
    "1333222233331...",
    ".11111111111....",
  ],
};
/** Planks: a stack of sawn boards. */
const PLANKS: IconRecipe = {
  name: "planks",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "1111111111111111",
    "1333333333333331",
    "1333333333333331",
    "1111111111111111",
    "................",
    "1111111111111111",
    "1222222222222221",
    "1222222222222221",
    "1111111111111111",
    "................",
    "1111111111111111",
    "1333333333333331",
    "1333333333333331",
    "1111111111111111",
  ],
};
/** Stone: a pile of cut blocks. */
const STONE: IconRecipe = {
  name: "stone",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "................",
    "....11111111....",
    "....13333331....",
    "....13333331....",
    "....11111111....",
    "..1111111111111.",
    "..1333331133331.",
    "..1333331133331.",
    "..1111111111111.",
    ".111111111111111",
    ".122222112222211",
    ".122222112222211",
    ".111111111111111",
    "................",
    "................",
  ],
};
/** Tools: a crossed hammer and chisel. */
const TOOLS: IconRecipe = {
  name: "tools",
  width: ICON_SIZE,
  height: ICON_SIZE,
  pixels: [
    "................",
    "..1111.....111..",
    ".133331...13331.",
    ".133331..133331.",
    ".133331.1333331.",
    "..1133111333311.",
    "...1331.1333111.",
    "...1331..11111..",
    "...1331...11....",
    "..13311...11....",
    "..1331...1331...",
    "..1331..13331...",
    "..1331..13331...",
    "...11...13331...",
    "........13331...",
    ".........111....",
  ],
};
/** The registry every bake/render call looks icons up in, keyed by {@link IconRecipe.name}. */
export const ICONS: Readonly<Record<string, IconRecipe>> = {
  // Buildings
  house: HOUSE,
  storehouse: STOREHOUSE,
  well: WELL,
  farm: FARM,
  mill: MILL,
  bakery: BAKERY,
  woodcutter: WOODCUTTER,
  sawmill: SAWMILL,
  quarry: QUARRY,
  mine: MINE,
  smith: SMITH,
  "town-hall": TOWN_HALL,
  chapel: CHAPEL,
  market: MARKET,
  watchpost: WATCHPOST,
  tradingpost: TRADINGPOST,
  healer: HEALER,
  "public-square": PUBLIC_SQUARE,
  gate: GATE,
  tower: TOWER,
  garrison: GARRISON,
  keep: KEEP,
  // Tools
  road: ROAD,
  wall: WALL,
  upgrade: UPGRADE,
  demolish: DEMOLISH,
  cancel: CANCEL,
  // Goods
  grain: GRAIN,
  flour: FLOUR,
  bread: BREAD,
  wood: WOOD,
  planks: PLANKS,
  stone: STONE,
  tools: TOOLS,
};

// Fail loudly at import time, not at first draw: a malformed row/char in any built-in
// recipe throws here, so a typo is a test/boot failure rather than a garbled icon.
for (const recipe of Object.values(ICONS)) validateIconRecipe(recipe);

/** Every registered icon name, in a stable (sorted) order — drives the deterministic bake layout. */
export function allIconNames(): string[] {
  return Object.keys(ICONS).sort();
}
