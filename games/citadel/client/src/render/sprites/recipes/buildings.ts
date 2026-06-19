/**
 * Building sprite recipes — one frame per standalone Citadel building type,
 * authored at native footprint resolution (footprint tiles × TILE_SIZE) so the
 * quad-to-frame scaling in quads.ts is 1:1 and nearest-crisp.
 *
 * Most buildings are composed from the shared `makeBuilding` / `makeFort`
 * generators (consistent shading + outline); farm/mine/quarry/well have bespoke
 * silhouettes. Frame names are `bld/<type>` and MUST match BUILDING_SPRITE_TYPES
 * (asserted by a test) — every type listed here is what quads.ts will request a
 * frame for.
 */
import { TILE_SIZE } from "@citadel/sim-core";
import type { PixelRecipe } from "../types";
import {
  Grid,
  makeBuilding,
  makeFort,
  chimney,
  crossOnTop,
  sailsX,
  awningStripes,
  banner,
  type BuildingPalette,
  type FortPalette,
} from "./draw";

const round = Math.round;

// ---------------------------------------------------------------------------
// Shared palettes
// ---------------------------------------------------------------------------
const CLAY_HOUSE: BuildingPalette = {
  wall: "t", wallLight: "c", wallDark: "w",
  roof: "r", roofLight: "t", roofDark: "R",
  door: "W", glass: "B", outline: "#",
};
const STONE_WORKSHOP: BuildingPalette = {
  wall: "S", wallLight: "s", wallDark: "n",
  roof: "i", roofLight: "S", roofDark: "#",
  door: "#", glass: "o", outline: "#",
};
const WOOD_WORKSHOP: BuildingPalette = {
  wall: "w", wallLight: "t", wallDark: "W",
  roof: "d", roofLight: "G", roofDark: "#",
  door: "W", glass: "B", outline: "#",
};

// ---------------------------------------------------------------------------
// Bespoke shapes
// ---------------------------------------------------------------------------

/** Tilled field with furrows + crop sprouts and a small barn (3×3). */
function farm(): PixelRecipe {
  const W = 3 * TILE_SIZE;
  const H = 3 * TILE_SIZE;
  const g = new Grid(W, H);
  // Field base.
  g.fillRect(0, 0, W, H, "G");
  // Furrows: darker horizontal rows every 4px, sprouts on the lit rows.
  for (let y = 2; y < H - 2; y += 4) {
    g.hLine(1, y, W - 2, "d");
    for (let x = 3; x < W - 3; x += 5) {
      g.set(x, y - 1, "g");
      g.set(x, y - 2, "y"); // sprout tip
    }
  }
  g.rectOutline(0, 0, W, H, "#");
  g.hLine(1, 1, W - 2, "g"); // lit top edge
  // Barn, top-left corner.
  const bw = round(W * 0.42);
  const bh = round(H * 0.46);
  const barn = new Grid(bw, bh);
  const bpal: BuildingPalette = { wall: "x", wallLight: "e", wallDark: "%", roof: "W", roofLight: "w", roofDark: "%", door: "%", glass: "c", outline: "#" };
  // mini-building into the barn grid via direct draw (reuse makeBuilding shape isn't sized for tiny → simple block)
  barn.fillRect(0, round(bh * 0.4), bw, bh - round(bh * 0.4), bpal.wall);
  barn.rectOutline(0, round(bh * 0.4) - 1, bw, bh - round(bh * 0.4) + 1, "#");
  for (let ry = 0; ry < round(bh * 0.4); ry++) {
    const inset = round((bw / 2) * (1 - ry / Math.max(1, round(bh * 0.4) - 1)));
    barn.hLine(inset, ry, bw - inset * 2, ry === 0 ? bpal.roofLight : bpal.roof);
  }
  barn.fillRect(round(bw / 2) - 1, round(bh * 0.55), 3, bh - round(bh * 0.55), "%"); // door
  // blit barn at (1,1).
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const ch = barn.get(x, y);
    if (ch !== ".") g.set(1 + x, 1 + y, ch);
  }
  return g.toRecipe("bld/farm");
}

/** Mound with a timber-framed mine entrance + minecart (2×2). */
function mine(): PixelRecipe {
  const W = 2 * TILE_SIZE;
  const H = 2 * TILE_SIZE;
  const g = new Grid(W, H);
  // Hill mound (rounded).
  const cx = W / 2;
  const baseY = round(H * 0.32);
  for (let y = baseY; y < H; y++) {
    const t = (y - baseY) / (H - baseY);
    const half = round((W / 2) * (0.5 + 0.5 * t));
    g.hLine(round(cx - half), y, half * 2, y === baseY ? "G" : "d");
  }
  // Rocky speckle.
  for (let x = 4; x < W - 4; x += 6) g.set(x, round(H * 0.6), "S");
  // Entrance: black arch + timber frame.
  const ew = round(W * 0.34);
  const eh = round(H * 0.5);
  const ex = round(cx - ew / 2);
  const ey = H - eh;
  g.fillRect(ex, ey, ew, eh, "#");
  g.vLine(ex - 1, ey, eh, "W");
  g.vLine(ex + ew, ey, eh, "W");
  g.hLine(ex - 1, ey - 1, ew + 2, "w"); // lintel
  // Minecart.
  g.fillRect(ex + ew + 2, H - 5, 5, 3, "W");
  g.set(ex + ew + 3, H - 2, "#");
  g.set(ex + ew + 5, H - 2, "#");
  return g.toRecipe("bld/mine");
}

/** Open stepped stone pit with rubble (2×2). */
function quarry(): PixelRecipe {
  const W = 2 * TILE_SIZE;
  const H = 2 * TILE_SIZE;
  const g = new Grid(W, H);
  const ledges = ["S", "s", "l"];
  for (let i = 0; i < ledges.length; i++) {
    const inset = i * round(W * 0.16);
    g.fillRect(inset, inset, W - inset * 2, H - inset * 2, ledges[i]!);
  }
  g.rectOutline(0, 0, W, H, "#");
  // Rubble blocks.
  g.fillRect(round(W * 0.5), round(H * 0.5), 4, 3, "S");
  g.fillRect(round(W * 0.3), round(H * 0.66), 3, 3, "s");
  g.set(round(W * 0.5), round(H * 0.5), "l"); // lit corner
  return g.toRecipe("bld/quarry");
}

/** Stone well with a little timber roof (1×1). */
function well(): PixelRecipe {
  const W = TILE_SIZE;
  const H = TILE_SIZE;
  const g = new Grid(W, H);
  // Stone ring (lower third).
  g.fillRect(3, H - 6, W - 6, 5, "S");
  g.rectOutline(3, H - 6, W - 6, 5, "#");
  g.hLine(4, H - 6, W - 8, "l");
  g.set(round(W / 2), H - 4, "b"); // water
  // Posts.
  g.vLine(4, 3, H - 9, "W");
  g.vLine(W - 5, 3, H - 9, "W");
  // Roof.
  for (let ry = 0; ry < 3; ry++) g.hLine(2 + ry, ry, W - 4 - ry * 2, ry === 0 ? "t" : "r");
  // Bucket.
  g.fillRect(round(W / 2) - 1, 4, 3, 2, "w");
  return g.toRecipe("bld/well");
}

// ---------------------------------------------------------------------------
// Accent helpers used inline
// ---------------------------------------------------------------------------
function logPile(g: Grid): void {
  const y = g.h - 6;
  for (let row = 0; row < 2; row++) {
    g.fillRect(2, y - row * 2, 7, 2, "w");
    g.set(2, y - row * 2, "W");
    g.set(8, y - row * 2, "W");
  }
}
function sawBlade(g: Grid): void {
  const cx = round(g.w * 0.72);
  const cy = round(g.h * 0.6);
  const r = 4;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r) g.set(cx + dx, cy + dy, "l");
  }
  g.set(cx, cy - r, "v");
  g.set(cx + r, cy, "v");
  g.set(cx, cy, "#");
}
function greenCross(g: Grid): void {
  const cx = round(g.w / 2);
  const cy = round(g.h * 0.66);
  g.fillRect(cx - 1, cy - 3, 3, 7, "g");
  g.fillRect(cx - 3, cy - 1, 7, 3, "g");
}
function clockFace(g: Grid): void {
  const cx = round(g.w / 2);
  const cy = round(g.h * 0.64);
  const r = 4;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy;
    if (d <= r * r && d >= (r - 1) * (r - 1)) g.set(cx + dx, cy + dy, "v");
  }
  g.set(cx, cy, "#");
  g.set(cx, cy - 2, "#");
  g.set(cx + 2, cy, "#");
}

// ---------------------------------------------------------------------------
// The recipe set
// ---------------------------------------------------------------------------
export const BUILDING_RECIPES: readonly PixelRecipe[] = [
  makeBuilding("bld/house", 2, 2, CLAY_HOUSE),
  farm(),
  makeBuilding("bld/mill", 2, 2,
    { wall: "c", wallLight: "v", wallDark: "t", roof: "w", roofLight: "t", roofDark: "W", door: "W", glass: "B", outline: "#" },
    (g) => sailsX(g, "c", "W")),
  makeBuilding("bld/bakery", 2, 2,
    { wall: "t", wallLight: "c", wallDark: "w", roof: "r", roofLight: "o", roofDark: "R", door: "W", glass: "o", outline: "#" },
    (g, p) => chimney(g, p, true)),
  makeBuilding("bld/woodcutter", 2, 2, WOOD_WORKSHOP, (g) => logPile(g)),
  makeBuilding("bld/storehouse", 3, 2,
    { wall: "s", wallLight: "l", wallDark: "S", roof: "S", roofLight: "s", roofDark: "n", door: "W", glass: "B", outline: "#" }),
  makeBuilding("bld/chapel", 2, 2,
    { wall: "c", wallLight: "v", wallDark: "t", roof: "n", roofLight: "S", roofDark: "i", door: "W", glass: "C", outline: "#" },
    (g) => crossOnTop(g, "v")),
  makeBuilding("bld/market", 2, 2,
    { wall: "t", wallLight: "c", wallDark: "w", roof: "e", roofLight: "P", roofDark: "x", door: "W", glass: "B", outline: "#" },
    (g) => awningStripes(g, "e", "c")),
  makeBuilding("bld/watchpost", 2, 2,
    { wall: "w", wallLight: "t", wallDark: "W", roof: "d", roofLight: "G", roofDark: "#", door: "W", glass: "B", outline: "#" },
    (g) => banner(g, round(g.w / 2), 0, "e")),
  makeBuilding("bld/tradingpost", 3, 2,
    { wall: "t", wallLight: "c", wallDark: "w", roof: "m", roofLight: "P", roofDark: "p", door: "W", glass: "B", outline: "#" },
    (g) => { const cx = round(g.w / 2); g.fillRect(cx - 2, round(g.h * 0.6), 5, 5, "O"); g.set(cx, round(g.h * 0.6) + 2, "y"); }),
  quarry(),
  makeBuilding("bld/sawmill", 2, 2, WOOD_WORKSHOP, (g) => sawBlade(g)),
  makeBuilding("bld/smith", 2, 2, STONE_WORKSHOP, (g, p) => {
    chimney(g, p, true);
    g.fillRect(round(g.w * 0.4), g.h - 6, 6, 2, "#"); // anvil top
    g.fillRect(round(g.w * 0.4) + 2, g.h - 4, 2, 3, "#");
  }),
  mine(),
  makeFort("bld/tower", 2, 2,
    { stone: "S", stoneLight: "s", stoneDark: "n", outline: "#", door: "#" }),
  makeFort("bld/garrison", 3, 2,
    { stone: "S", stoneLight: "s", stoneDark: "n", outline: "#", door: "W" },
    (g) => banner(g, round(g.w * 0.5), Math.max(0, round(g.h * 0.16) - 4), "e")),
  makeFort("bld/keep", 3, 3,
    { stone: "s", stoneLight: "l", stoneDark: "S", outline: "#", door: "W" },
    (g) => {
      // Central taller tower.
      const cw = round(g.w * 0.34);
      const cx = round((g.w - cw) / 2);
      g.fillRect(cx, 0, cw, round(g.h * 0.34), "s");
      g.rectOutline(cx, 0, cw, round(g.h * 0.34), "#");
      g.vLine(cx + 1, 1, round(g.h * 0.34) - 2, "l");
      banner(g, cx + round(cw / 2), 0, "p");
    }),
  makeBuilding("bld/town-hall", 3, 3,
    { wall: "c", wallLight: "v", wallDark: "t", roof: "O", roofLight: "y", roofDark: "o", door: "W", glass: "C", outline: "#" },
    (g) => { clockFace(g); banner(g, round(g.w * 0.5), 0, "p"); }),
  makeBuilding("bld/healer", 2, 2,
    { wall: "v", wallLight: "v", wallDark: "l", roof: "G", roofLight: "g", roofDark: "d", door: "W", glass: "C", outline: "#" },
    (g) => greenCross(g)),
  well(),
];
