/**
 * True-isometric pixel-art primitives for Citadel building sprites (32-based).
 *
 * Unlike the old top-down `draw.ts` (front-facing billboards), these compose a
 * building from real iso volumes: a **diamond ground footprint**, two visible
 * **wall faces** (a lit left face + a shaded right face, as parallelograms that
 * follow the 2:1 dimetric slope), and a **hipped roof** capping the top. One
 * committed light direction (sun from the upper-left → left face + left roof
 * slope lit, right face + right slope shaded, dark outline).
 *
 * Sprite dimensions for a `w×h`-tile footprint (matches iso.ts `isoFootprintBox`):
 *   width  = (w + h) * ISO_TILE_W/2 * 2 = (w + h) * 32 ... no — see below.
 * We author at iso resolution where one tile's diamond is `DIA_W × DIA_H` =
 * `32 × 16`. The full footprint diamond spans `(w+h)·16` across and `(w+h)·8`
 * tall; walls rise `wallH` px above it and the roof adds `roofH` px, so the
 * sprite is `(w+h)·16` wide × `(w+h)·8 + wallH + roofH` tall.
 *
 * Chars index the EDG-derived SWATCH in ../palette.ts. Pure + deterministic.
 */
import type { PixelRecipe } from "../types";
import { isoSpriteDims } from "../../iso";

/** One tile's diamond size in the iso sprite space (must match iso.ts 2:1). */
export const DIA_W = 32;
export const DIA_H = 16;
const HW = DIA_W / 2; // 16
const HH = DIA_H / 2; // 8

/** In-memory char canvas; `.` is transparent. (Local copy — iso sprites only.) */
export class IsoGrid {
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
    const xi = Math.round(x), yi = Math.round(y);
    if (this.inb(xi, yi)) this.cells[yi * this.w + xi] = ch;
  }
  get(x: number, y: number): string {
    return this.inb(x, y) ? this.cells[y * this.w + x]! : ".";
  }
  toRecipe(name: string): PixelRecipe {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) rows.push(this.cells.slice(y * this.w, y * this.w + this.w).join(""));
    return { name, width: this.w, height: this.h, pixels: rows };
  }
}

/** Fill the horizontal span [x0,x1] at row y (inclusive) with ch. */
function span(g: IsoGrid, x0: number, x1: number, y: number, ch: string): void {
  const a = Math.round(Math.min(x0, x1));
  const b = Math.round(Math.max(x0, x1));
  for (let x = a; x <= b; x++) g.set(x, y, ch);
}

/** Roles for an iso building's surfaces. */
export interface IsoPalette {
  roof: string;
  roofLight: string;
  roofDark: string;
  wallL: string; // lit left face
  wallR: string; // shaded right face
  wallEdge: string; // vertical corner highlight
  outline: string;
  door: string;
  glass: string;
}

/**
 * Compose a true-iso building filling a `w×h`-tile footprint, `heightTiles` tall.
 * Layout (top→bottom): hipped roof, then the two wall faces meeting at the front
 * vertical edge, sitting on the ground diamond. `accent` paints type marks last.
 */
export function makeIsoBuilding(
  name: string,
  w: number,
  h: number,
  heightTiles: number,
  pal: IsoPalette,
  accent?: (g: IsoGrid, pal: IsoPalette, m: IsoMetrics) => void,
): PixelRecipe {
  const m = isoMetrics(w, h, heightTiles);
  const g = new IsoGrid(m.W, m.H);

  const fullW = (w + h) * HW; // full diamond width
  const diaH = (w + h) * HH; // full diamond height
  const halfW = fullW / 2;
  const cx = m.cx;

  // Vertical levels (y grows downward):
  //   wall-top diamond mid-line at  yTopMid = m.roofH
  //   ground diamond  mid-line at   yBotMid = m.roofH + m.wallH
  const yTopMid = m.roofH;
  const yBotMid = m.roofH + m.wallH;

  // --- Two front wall faces (the V facing the camera) ---
  // Left-front face: from the LEFT point across to the FRONT (bottom) point,
  // each column dropping from the wall-top edge to the ground edge.
  // The diamond's lower-left edge: x from (cx-halfW) at yTopMid → cx at yTopMid+diaH/2.
  for (let x = cx - halfW; x <= cx; x++) {
    const t = (x - (cx - halfW)) / halfW; // 0 at left point → 1 at front
    const topEdgeY = yTopMid + (diaH / 2) * t; // wall-top lower-left edge
    const botEdgeY = yBotMid + (diaH / 2) * t; // ground lower-left edge
    for (let y = topEdgeY; y <= botEdgeY; y++) g.set(x, y, pal.wallL);
    g.set(x, botEdgeY, pal.outline); // ground contact
  }
  // Right-front face: from FRONT point across to the RIGHT point.
  for (let x = cx; x <= cx + halfW; x++) {
    const t = (x - cx) / halfW; // 0 at front → 1 at right point
    const topEdgeY = yTopMid + (diaH / 2) * (1 - t);
    const botEdgeY = yBotMid + (diaH / 2) * (1 - t);
    for (let y = topEdgeY; y <= botEdgeY; y++) g.set(x, y, pal.wallR);
    g.set(x, botEdgeY, pal.outline);
  }
  // Vertical corner highlight on the near (front) edge.
  for (let y = yTopMid + diaH / 2; y <= yBotMid + diaH / 2; y++) g.set(cx, y, pal.wallEdge);

  // --- Hipped roof: a filled diamond capping the wall-top, lit-left/dark-right ---
  // Top point at y=0, widening to the eaves at the wall-top mid-line.
  for (let y = 0; y <= yTopMid + diaH / 2; y++) {
    let half: number;
    if (y <= yTopMid) half = halfW * (y / Math.max(1, yTopMid)); // upper slopes
    else half = halfW * (1 - (y - yTopMid) / (diaH / 2)); // lower eaves taper
    half = Math.max(0, half);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      g.set(x, y, x < cx ? pal.roofLight : pal.roof);
    }
    g.set(Math.round(cx - half), y, pal.outline);
    g.set(Math.round(cx + half), y, pal.roofDark);
  }
  g.set(cx, 0, pal.roofLight);

  // --- Door on the front, straddling the near vertical edge ---
  drawDoorFront(g, cx, yBotMid + diaH / 2, m.wallH, pal);

  accent?.(g, pal, m);
  return g.toRecipe(name);
}

export interface IsoMetrics {
  W: number;
  H: number;
  cx: number;
  roofH: number;
  wallH: number;
}

/** Sprite pixel dimensions + key offsets for a footprint — delegates to the
 *  shared `isoSpriteDims` (iso.ts) so art maps 1:1 onto the renderer's quad. */
export function isoMetrics(w: number, h: number, heightTiles: number): IsoMetrics {
  const d = isoSpriteDims(w, h, heightTiles);
  return { W: d.width, H: d.height, cx: Math.round(d.width / 2), roofH: d.roofH, wallH: d.wallH };
}

/**
 * A door centred on the near vertical edge: a small arched rectangle whose top
 * follows the two wall faces meeting at the front corner. `frontBaseY` is the
 * lowest pixel (the diamond's front point). Pure.
 */
function drawDoorFront(g: IsoGrid, cx: number, frontBaseY: number, wallH: number, pal: IsoPalette): void {
  const dh = Math.max(6, Math.round(wallH * 0.7));
  const dw = 3; // half-width each side of the corner
  for (let dx = -dw; dx <= dw; dx++) {
    const x = cx + dx;
    // The face's local "ground" at this column rises away from the front corner.
    const edgeDrop = Math.round(Math.abs(dx) * HH / HW);
    const baseY = frontBaseY - edgeDrop;
    for (let y = baseY - dh; y < baseY; y++) g.set(x, y, pal.door);
  }
  g.set(cx, frontBaseY - dh, pal.outline); // lintel notch
}

/** A chimney accent (smith/bakery): a small post on the roof's right with ember. */
export function isoChimney(g: IsoGrid, pal: IsoPalette, m: IsoMetrics, glow = false): void {
  const x = m.cx + Math.round(m.W * 0.18);
  const top = Math.round(m.roofH * 0.2);
  for (let y = top; y < top + 6; y++) { g.set(x, y, pal.outline); g.set(x + 1, y, pal.wallR); }
  if (glow) { g.set(x, top - 1, "o"); g.set(x + 1, top - 1, "y"); }
}

/** A standing cross above the roof peak (chapel). */
export function isoCross(g: IsoGrid, m: IsoMetrics, color: string): void {
  for (let y = 0; y < 5; y++) g.set(m.cx, y - 4, color);
  span(g, m.cx - 1, m.cx + 1, -2, color);
}

/** A banner pennant near the roof peak (keep/garrison/town-hall). */
export function isoBanner(g: IsoGrid, m: IsoMetrics, color: string): void {
  const x = m.cx;
  for (let y = 0; y < 6; y++) g.set(x, y, "#");
  for (let y = 1; y < 5; y++) span(g, x + 1, x + 4, y, color);
}
