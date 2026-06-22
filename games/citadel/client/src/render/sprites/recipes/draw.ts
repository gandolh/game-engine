/**
 * Procedural pixel-art primitives for Citadel building sprites.
 *
 * A `Grid` is an in-memory char canvas (rows guaranteed rectangular, so a
 * generated `PixelRecipe` can never have a ragged row). On top of it sit a few
 * composers — `makeBuilding` (pitched-roof cottage/workshop), `makeFort` (flat
 * crenellated stone), and bespoke shapes — that share one committed light
 * direction (top-left highlight, bottom-right shadow, dark outline) per the
 * pixel-art craft rules in corpus/wiki/asset-pipeline.md.
 *
 * Chars index the EDG-derived SWATCH in ../palette.ts. Pure + deterministic.
 */
import { TILE_SIZE } from "@citadel/sim-core";
import type { PixelRecipe } from "../types";

/** In-memory char canvas; `.` is transparent. */
export class Grid {
  readonly w: number;
  readonly h: number;
  private readonly cells: string[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = new Array<string>(w * h).fill(".");
  }

  inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, ch: string): void {
    if (this.inb(x, y)) this.cells[y * this.w + x] = ch;
  }

  /** Set only if the target is currently transparent (paint-behind). */
  setIfEmpty(x: number, y: number, ch: string): void {
    if (this.inb(x, y) && this.cells[y * this.w + x] === ".") this.cells[y * this.w + x] = ch;
  }

  get(x: number, y: number): string {
    return this.inb(x, y) ? this.cells[y * this.w + x]! : ".";
  }

  fillRect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch);
  }

  hLine(x: number, y: number, len: number, ch: string): void {
    for (let i = 0; i < len; i++) this.set(x + i, y, ch);
  }

  vLine(x: number, y: number, len: number, ch: string): void {
    for (let i = 0; i < len; i++) this.set(x, y + i, ch);
  }

  /** 1px outline of a rect (no fill). */
  rectOutline(x: number, y: number, w: number, h: number, ch: string): void {
    this.hLine(x, y, w, ch);
    this.hLine(x, y + h - 1, w, ch);
    this.vLine(x, y, h, ch);
    this.vLine(x + w - 1, y, h, ch);
  }

  toRecipe(name: string): PixelRecipe {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      rows.push(this.cells.slice(y * this.w, y * this.w + this.w).join(""));
    }
    return { name, width: this.w, height: this.h, pixels: rows };
  }
}

/** Color roles for a pitched-roof building. */
export interface BuildingPalette {
  wall: string;
  wallLight: string;
  wallDark: string;
  roof: string;
  roofLight: string;
  roofDark: string;
  door: string;
  glass: string;
  outline: string;
}

const round = Math.round;

/** A small 3×3 window: dark frame, glass centre, top-left glint. */
function window3(g: Grid, x: number, y: number, glass: string, frame: string): void {
  g.fillRect(x, y, 3, 3, frame);
  g.set(x + 1, y + 1, glass);
  g.set(x + 1, y, "l"); // tiny light glint on the top edge
}

/**
 * Pitched-roof building filling a `tw×th`-tile footprint (TILE_SIZE px/tile).
 * Trapezoid roof (peak narrow, eaves wide) with a lit ridge + left slope and a
 * dark eave; outlined stone/wood walls with a top-left highlight column, a
 * centred door, and two flanking windows. `accent` paints type-specific marks
 * last (chimney, cross, sails, …).
 */
export function makeBuilding(
  name: string,
  tw: number,
  th: number,
  pal: BuildingPalette,
  accent?: (g: Grid, pal: BuildingPalette) => void,
): PixelRecipe {
  const W = tw * TILE_SIZE;
  const H = th * TILE_SIZE;
  const g = new Grid(W, H);

  // --- Roof (top ~42%) ---
  const roofH = Math.max(6, round(H * 0.42));
  const topInset = round(W * 0.3);
  for (let ry = 0; ry < roofH; ry++) {
    const t = roofH === 1 ? 1 : ry / (roofH - 1);
    const inset = round(topInset * (1 - t));
    const xL = inset;
    const xR = W - 1 - inset;
    for (let x = xL; x <= xR; x++) g.set(x, ry, pal.roof);
    g.set(xL, ry, pal.roofLight); // lit left slope
    g.set(xR, ry, pal.outline); // shaded right slope
  }
  // Ridge highlight + dark eave row.
  for (let x = topInset; x <= W - 1 - topInset; x++) g.set(x, 0, pal.roofLight);
  for (let x = 0; x < W; x++) if (g.get(x, roofH - 1) === pal.roof) g.set(x, roofH - 1, pal.roofDark);
  // Shingle striations: every 3rd roof row gets a darker course so the roof
  // reads as overlapping tiles rather than a flat slab (texture pass).
  for (let ry = 2; ry < roofH - 1; ry += 3) {
    for (let x = 0; x < W; x++) if (g.get(x, ry) === pal.roof) g.set(x, ry, pal.roofDark);
  }

  // --- Walls ---
  const wy0 = roofH;
  const inset = round(W * 0.08);
  const wx0 = inset;
  const wx1 = W - 1 - inset;
  g.fillRect(wx0, wy0, wx1 - wx0 + 1, H - wy0, pal.wall);
  g.vLine(wx0, wy0, H - wy0, pal.outline);
  g.vLine(wx1, wy0, H - wy0, pal.outline);
  g.hLine(wx0, H - 1, wx1 - wx0 + 1, pal.outline);
  g.vLine(wx0 + 1, wy0, H - wy0 - 1, pal.wallLight); // top-left highlight column
  g.hLine(wx0 + 1, wy0, wx1 - wx0 - 1, pal.wallLight); // lit top edge under eave
  // Faint masonry/timber seams: a darker column every 5px across the wall body
  // (skips the lit highlight column) so large walls aren't a flat fill.
  for (let sx = wx0 + 4; sx < wx1 - 1; sx += 5) {
    for (let sy = wy0 + 2; sy < H - 2; sy++) if (g.get(sx, sy) === pal.wall) g.set(sx, sy, pal.wallDark);
  }
  // Ground-contact shadow: darken the bottom-right corner so the building reads
  // as sitting ON the ground (matches the NW-sun shadow drawn in the renderer).
  g.hLine(wx0 + round((wx1 - wx0) / 2), H - 1, round((wx1 - wx0) / 2), pal.outline);

  // --- Windows (flanking, upper) ---
  const winY = wy0 + 2;
  window3(g, wx0 + 2, winY, pal.glass, pal.outline);
  window3(g, wx1 - 4, winY, pal.glass, pal.outline);

  // --- Door (centred, arched) ---
  const dW = Math.max(4, round(W * 0.2));
  const dH = Math.max(6, round((H - wy0) * 0.55));
  const dx = round((W - dW) / 2);
  const dy = H - dH;
  g.fillRect(dx, dy, dW, dH, pal.door);
  g.rectOutline(dx, dy, dW, dH, pal.outline);
  g.set(dx + round(dW / 2), dy, pal.outline); // arch notch at the lintel
  g.set(dx + dW - 2, dy + round(dH / 2), "O"); // brass knob
  // Stone doorstep: a 1px lit threshold strip just below the door.
  g.hLine(dx - 1, H - 1, dW + 2, pal.wallLight);

  accent?.(g, pal);
  return g.toRecipe(name);
}

/** Color roles for a flat crenellated stone structure. */
export interface FortPalette {
  stone: string;
  stoneLight: string;
  stoneDark: string;
  outline: string;
  door: string;
  banner?: string;
}

/**
 * Flat-topped crenellated stone structure (tower/garrison/keep/watchpost).
 * Solid stone body, merlon gaps carved out of the top band, top-left highlight,
 * arrow-slit windows, an arched door, and an optional central keep-tower +
 * banner via `extra`.
 */
export function makeFort(
  name: string,
  tw: number,
  th: number,
  pal: FortPalette,
  extra?: (g: Grid, pal: FortPalette) => void,
): PixelRecipe {
  const W = tw * TILE_SIZE;
  const H = th * TILE_SIZE;
  const g = new Grid(W, H);

  const crenH = Math.max(3, round(H * 0.16));
  // Body.
  g.fillRect(0, 0, W, H, pal.stone);
  // Top-left highlight + bottom/right shadow.
  g.vLine(1, crenH, H - crenH - 1, pal.stoneLight);
  g.hLine(1, crenH, W - 2, pal.stoneLight);
  g.vLine(W - 2, crenH, H - crenH, pal.stoneDark);
  g.hLine(1, H - 2, W - 2, pal.stoneDark);
  g.rectOutline(0, crenH - 1, W, H - crenH + 1, pal.outline);

  // Merlons: carve gaps in the top `crenH` rows.
  const merlonW = Math.max(2, round(W / 8));
  for (let x = 0; x < W; x++) {
    if (Math.floor(x / merlonW) % 2 === 1) {
      for (let y = 0; y < crenH; y++) g.set(x, y, ".");
    } else {
      for (let y = 0; y < crenH; y++) g.set(x, y, pal.stone);
      g.set(x, 0, pal.stoneLight);
    }
  }
  // Re-outline the merlon tops so they read crisply.
  for (let x = 0; x < W; x++) {
    if (Math.floor(x / merlonW) % 2 === 0) {
      g.set(x, 0, g.get(x, 0) === "." ? "." : pal.stoneLight);
    }
  }

  // Ashlar courses: a darker mortar line every 4px down the body so the stone
  // reads as stacked blocks instead of one flat face (texture pass).
  for (let cy = crenH + 3; cy < H - 2; cy += 4) {
    for (let x = 1; x < W - 1; x++) if (g.get(x, cy) === pal.stone) g.set(x, cy, pal.stoneDark);
  }

  // Arrow slits.
  const slitY = crenH + 2;
  g.vLine(round(W * 0.28), slitY, Math.max(3, round(H * 0.18)), pal.outline);
  g.vLine(round(W * 0.72), slitY, Math.max(3, round(H * 0.18)), pal.outline);

  // Arched door.
  const dW = Math.max(4, round(W * 0.24));
  const dH = Math.max(6, round(H * 0.32));
  const dx = round((W - dW) / 2);
  const dy = H - dH;
  g.fillRect(dx, dy, dW, dH, pal.door);
  g.rectOutline(dx, dy, dW, dH, pal.outline);
  g.set(dx + round(dW / 2), dy, pal.outline);

  extra?.(g, pal);
  return g.toRecipe(name);
}

// ---------------------------------------------------------------------------
// Accent primitives (applied as `accent` callbacks).
// ---------------------------------------------------------------------------

/** A chimney near the roof's right; `glow` lights the top with ember orange. */
export function chimney(g: Grid, pal: BuildingPalette, glow = false): void {
  const W = g.w;
  const cx = round(W * 0.66);
  const top = round(g.h * 0.06);
  g.fillRect(cx, top, 3, round(g.h * 0.3), pal.outline);
  g.fillRect(cx + 1, top, 1, round(g.h * 0.3), "W");
  if (glow) {
    g.set(cx, top - 1, "o");
    g.set(cx + 1, top - 1, "y");
    g.set(cx + 2, top - 1, "o");
  }
}

/** A standing cross above the roof peak (chapel). */
export function crossOnTop(g: Grid, color: string): void {
  const cx = round(g.w / 2);
  g.vLine(cx, 0, 5, color);
  g.hLine(cx - 1, 2, 3, color);
}

/** A windmill/sail X across the upper face (mill) — 2px-wide arms for contrast. */
export function sailsX(g: Grid, color: string, hub: string): void {
  const cx = round(g.w / 2);
  const cy = round(g.h * 0.26);
  const r = round(g.w * 0.34);
  for (let i = -r; i <= r; i++) {
    // 2px-thick diagonals so the sails read against the wall.
    g.set(cx + i, cy + i, color);
    g.set(cx + i + 1, cy + i, color);
    g.set(cx + i, cy - i, color);
    g.set(cx + i + 1, cy - i, color);
  }
  g.fillRect(cx - 1, cy - 2, 4, 4, hub); // chunkier hub
}

/** Replace the roof with an alternating-stripe awning (market). */
export function awningStripes(g: Grid, a: string, b: string): void {
  const roofH = Math.max(6, round(g.h * 0.42));
  for (let y = 0; y < roofH; y++) {
    for (let x = 0; x < g.w; x++) {
      const cur = g.get(x, y);
      if (cur === ".") continue;
      g.set(x, y, Math.floor(x / 3) % 2 === 0 ? a : b);
    }
    // scalloped lower fringe
  }
  for (let x = 0; x < g.w; x++) if (g.get(x, roofH - 1) !== ".") g.set(x, roofH - 1, Math.floor(x / 3) % 2 === 0 ? b : a);
}

/** A hanging banner pennant from `x,y` (garrison/keep/town-hall). */
export function banner(g: Grid, x: number, y: number, color: string, pole = "#"): void {
  g.vLine(x, y, round(g.h * 0.34), pole);
  g.fillRect(x + 1, y + 1, 4, 5, color);
  g.set(x + 2, y + 6, color);
  g.set(x + 4, y + 6, color);
}
