/**
 * True-isometric pixel-art primitives + per-building FORM builders for Citadel
 * (authored at 4× — `ISO_ART_SCALE` — for medieval detail; see iso.ts).
 *
 * Buildings are composed from real iso volumes on the 2:1 dimetric grid: a
 * diamond ground footprint, two visible wall faces (a lit left face + a shaded
 * right face that follow the dimetric slope), and a roof. One committed light
 * direction (sun from the upper-left → left face/slope lit, right shaded, dark
 * outline). Rather than one uniform box, each building type has its own FORM
 * (a half-timbered cottage, a tall post-mill, an open fenced field, open market
 * stalls, a steepled church, a crenellated keep…) so the silhouette — not just
 * the colour — tells them apart.
 *
 * The renderer sizes a building's quad in world-px via `isoSpriteDims`; we author
 * the grid at `isoArtDims` (= ×ISO_ART_SCALE), and the GPU samples the high-res
 * texture into the same quad. All geometry derives from the scaled metrics so it
 * stays proportional. Chars index the EDG-derived SWATCH (../palette.ts). Pure +
 * deterministic.
 */
import type { PixelRecipe } from "../types";
import { isoArtDims, ISO_ART_SCALE } from "../../iso";

/** One tile's diamond size in the AUTHORING space (2:1, scaled by ISO_ART_SCALE). */
export const DIA_W = 32 * ISO_ART_SCALE;
export const DIA_H = 16 * ISO_ART_SCALE;
const HW = DIA_W / 2;
const HH = DIA_H / 2;
/** Shorthand: round to int. */
const R = Math.round;

/** In-memory char canvas; `.` is transparent. */
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
    const xi = R(x), yi = R(y);
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
  const a = R(Math.min(x0, x1));
  const b = R(Math.max(x0, x1));
  for (let x = a; x <= b; x++) g.set(x, y, ch);
}

/** Filled axis-aligned rect [x0,x1]×[y0,y1] inclusive. */
function rect(g: IsoGrid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = R(y0); y <= R(y1); y++) span(g, x0, x1, y, ch);
}

/** A filled, vertically-squashed iso disc (for wheels/wells), 2:1-ish. */
function disc(g: IsoGrid, cx: number, cy: number, r: number, squash: number, ch: string): void {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy / squash);
      if (d <= r) g.set(cx + dx, cy + dy, ch);
    }
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

export interface IsoMetrics {
  W: number;
  H: number;
  cx: number;
  roofH: number;
  wallH: number;
  /** footprint diamond full width / half-height (authoring px). */
  fullW: number;
  diaH: number;
  halfW: number;
  /** wall-top mid-line / ground mid-line y. */
  yTopMid: number;
  yBotMid: number;
}

/** Sprite metrics for a `w×h` footprint `heightTiles` tall, in authoring px. */
export function isoMetrics(w: number, h: number, heightTiles: number): IsoMetrics {
  const d = isoArtDims(w, h, heightTiles);
  const fullW = (w + h) * HW;
  const diaH = (w + h) * HH;
  return {
    W: d.width, H: d.height, cx: R(d.width / 2),
    roofH: d.roofH, wallH: d.wallH,
    fullW, diaH, halfW: fullW / 2,
    yTopMid: d.roofH, yBotMid: d.roofH + d.wallH,
  };
}

// ---------------------------------------------------------------------------
// Shared volume pieces
// ---------------------------------------------------------------------------

/**
 * The two front wall faces (the V facing the camera) of the footprint diamond.
 * `optExtra` lets a form paint timber framing etc. per column. Returns nothing;
 * draws onto `g`.
 */
function drawWalls(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const { cx, halfW, diaH, yTopMid, yBotMid } = m;
  // Left-front face (lit): left point → front point. A 1px AMBIENT-OCCLUSION band
  // along the wall-top (just under the roof eave) deepens the volume read.
  for (let x = cx - halfW; x <= cx; x++) {
    const t = (x - (cx - halfW)) / halfW;
    const topEdgeY = yTopMid + (diaH / 2) * t;
    const botEdgeY = yBotMid + (diaH / 2) * t;
    for (let y = topEdgeY; y <= botEdgeY; y++) g.set(x, y, pal.wallL);
    g.set(x, R(topEdgeY), pal.wallR);        // eave AO: top row of the lit face shaded
    g.set(x, botEdgeY, pal.outline);
  }
  // Right-front face (shaded): front point → right point. Per the iso references a
  // valley/shadow face should be a distinct DARKER value (not collapsed to the
  // outline): the near-corner third gets an extra shade so the two faces clearly
  // separate in value.
  for (let x = cx; x <= cx + halfW; x++) {
    const t = (x - cx) / halfW;
    const topEdgeY = yTopMid + (diaH / 2) * (1 - t);
    const botEdgeY = yBotMid + (diaH / 2) * (1 - t);
    // Deeper shade in the near-corner band (the part furthest from the sun).
    const deep = t < 0.4;
    for (let y = topEdgeY; y <= botEdgeY; y++) g.set(x, y, deep ? pal.roofDark : pal.wallR);
    g.set(x, R(topEdgeY), pal.outline);      // eave AO line on the shaded face
    g.set(x, botEdgeY, pal.outline);
  }
  // Near vertical corner: a bright highlight catching the light. A subtle 1px AO
  // seam sits just right of it, but only on tall-enough walls (so short cottages
  // don't get a dark stripe down the corner).
  const cornerTop = yTopMid + diaH / 2;
  const cornerBot = yBotMid + diaH / 2;
  const tallWall = (yBotMid - yTopMid) >= 12;
  for (let y = cornerTop; y <= cornerBot; y++) {
    g.set(cx, y, pal.wallEdge);
    if (tallWall) g.set(cx + 1, y, pal.wallR); // gentle AO (mid shade, not dark)
  }
}

/** Hipped roof diamond capping the wall-top, lit-left / dark-right. */
function drawHippedRoof(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const { cx, halfW, diaH, yTopMid } = m;
  for (let y = 0; y <= yTopMid + diaH / 2; y++) {
    let half: number;
    if (y <= yTopMid) half = halfW * (y / Math.max(1, yTopMid));
    else half = halfW * (1 - (y - yTopMid) / (diaH / 2));
    half = Math.max(0, half);
    for (let x = R(cx - half); x <= R(cx + half); x++) g.set(x, y, x < cx ? pal.roofLight : pal.roof);
    g.set(R(cx - half), y, pal.outline);
    g.set(R(cx + half), y, pal.roofDark);
  }
  g.set(cx, 0, pal.roofLight);
}

/**
 * A steep medieval roof: a tall hipped diamond (apex lifted well above the
 * wall-top) capping the body, lit-left / dark-right with shingle courses + a
 * bright ridge highlight. `riseMul` scales how tall/steep the roof is (1 = the
 * default shallow hip; ~2 = a steep cottage/church roof). An optional `overhang`
 * extends the eaves past the wall for the half-timbered look.
 */
function drawGableRoof(g: IsoGrid, m: IsoMetrics, pal: IsoPalette, overhang = 0, riseMul = 1.7): void {
  const { cx, halfW, diaH, yTopMid } = m;
  const oh = overhang;
  // A steep HIP: a diamond roof whose peak is lifted `peakRise` above the eave
  // mid-line so it reads as a tall pitched roof, not a flat deck. The eave
  // diamond sits at the wall-top, widened by `oh`; the peak is a single high
  // point at the centre. Each screen row's two slopes are filled between the
  // diamond's left/right edges, shaded by which side of the ridge they're on.
  const eaveHalfW = halfW + oh;
  const eaveHalfH = diaH / 2 + R(oh / 2);
  const eaveMidY = yTopMid;                       // eave diamond mid-line (screen y)
  const peakRise = R(m.roofH * riseMul);
  const peakY = Math.max(1, eaveMidY - peakRise); // apex, clamped in-bounds
  // For every roof column x, the eave diamond gives upper/lower eave y; the roof
  // surface rises from those eaves to the ridge. We draw it as: top silhouette =
  // straight lines from the apex to the left/right eave points; bottom silhouette
  // = the near (lower) eave V. Fill between, hip-shaded.
  const tileRow = R(5 * ISO_ART_SCALE / 4); // terracotta tile-course spacing
  for (let x = R(cx - eaveHalfW); x <= R(cx + eaveHalfW); x++) {
    const dxn = Math.min(1, Math.abs(x - cx) / eaveHalfW); // 0 centre → 1 side point
    // eave points at this column: upper (far) and lower (near) edges of the diamond
    const eaveUpperY = eaveMidY - eaveHalfH * (1 - dxn);
    const eaveLowerY = eaveMidY + eaveHalfH * (1 - dxn);
    // ridge line: apex at centre slopes down to the side eave points.
    const ridgeY = peakY + (eaveMidY - peakY) * dxn;
    const lit = x < cx;
    // The visible roof face spans from the ridge line down to the LOWER eave.
    for (let y = R(ridgeY); y <= R(eaveLowerY); y++) {
      const onFar = y < R(eaveUpperY); // far (back) slope vs near (front) slope
      // Terracotta TILE COURSES: bands run parallel to the eave, every `tileRow`
      // rows, with a dark groove between courses → a clay-tile read, not flat fill.
      const into = y - R(ridgeY);
      const groove = into % tileRow === 0;
      let ch: string;
      if (groove) ch = lit ? pal.roof : pal.roofDark;            // shadowed tile lip
      else if (onFar) ch = lit ? pal.roof : pal.roofDark;        // back slope, darker
      else ch = lit ? pal.roofLight : pal.roof;                  // front slope, lit
      g.set(x, y, ch);
    }
    g.set(x, R(ridgeY), pal.outline);                 // top slope silhouette
    // Eave OVERHANG: a dark shadow lip just under the eave so the roof reads as
    // jutting past the wall (the reference's heavy terracotta eaves).
    g.set(x, R(eaveLowerY), pal.outline);
    g.set(x, R(eaveLowerY) - 1, pal.roofDark);
  }
  // Ridge CAP: a thick highlighted crest along the apex→front ridge.
  for (let y = R(peakY); y <= R(eaveMidY + eaveHalfH); y++) {
    g.set(cx, y, pal.roofLight);
    g.set(cx - 1, y, pal.roof);
    g.set(cx + 1, y, pal.roofDark);
  }
  g.set(cx, R(peakY), pal.outline);
}

/** Half-timbered detailing on the two front wall faces: dark oak studs + top/sill
 *  plates + a mid rail AND a diagonal cross-brace in each panel — the signature
 *  half-timber look from the reference set. Brace direction mirrors per side so
 *  both faces read as braced toward the near corner. */
function drawTimberFrame(g: IsoGrid, m: IsoMetrics, beam = "%"): void {
  const { cx, halfW, diaH, yTopMid, yBotMid } = m;
  const stud = Math.max(6, R(9 * ISO_ART_SCALE / 4)); // ≥6px panels so studs read
  const edgeAt = (x: number) => {
    const t = x <= cx ? (x - (cx - halfW)) / halfW : (cx + halfW - x) / halfW;
    return { top: yTopMid + (diaH / 2) * t, bot: yBotMid + (diaH / 2) * t };
  };
  const wallTall = (yBotMid - yTopMid) >= 14; // only brace if the face has room
  for (let x = R(cx - halfW); x <= R(cx + halfW); x++) {
    const { top: topEdgeY, bot: botEdgeY } = edgeAt(x);
    if ((x - R(cx - halfW)) % stud === 0) for (let y = R(topEdgeY); y <= R(botEdgeY); y++) g.set(x, y, beam);
    g.set(x, R(topEdgeY) + 1, beam); // top plate
    g.set(x, R(botEdgeY) - 1, beam); // sill plate
    g.set(x, R((topEdgeY + botEdgeY) / 2), beam); // mid rail
  }
  // Diagonal cross-braces only when the wall is tall enough to read them.
  if (wallTall) {
    for (let x0 = R(cx - halfW); x0 < R(cx + halfW); x0 += stud) {
      const onLeft = x0 + stud / 2 < cx;
      const a = onLeft ? x0 : x0 + stud, b = onLeft ? x0 + stud : x0;
      const steps = stud;
      for (let i = 0; i <= steps; i++) {
        const x = R(a + (b - a) * (i / steps));
        const e = edgeAt(x);
        const y = R(e.bot - (e.bot - e.top) * (i / steps));
        if (x >= R(cx - halfW) && x <= R(cx + halfW)) g.set(x, y, beam);
      }
    }
  }
  // near corner post (over the wallEdge highlight)
  for (let y = yTopMid + diaH / 2; y <= yBotMid + diaH / 2; y++) g.set(cx, y, beam);
}

/** A small shuttered window on the lit-left wall face. */
function drawWindow(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const { cx, halfW, yTopMid, wallH } = m;
  const x = R(cx - halfW * 0.45);
  const t = (x - (cx - halfW)) / halfW;
  const topEdgeY = yTopMid + (m.diaH / 2) * t;
  const wy = R(topEdgeY + wallH * 0.35);
  const ww = R(5 * ISO_ART_SCALE / 4), wh = R(6 * ISO_ART_SCALE / 4);
  rect(g, x, wy, x + ww, wy + wh, pal.glass);
  // frame + mullions
  span(g, x, x + ww, wy - 1, pal.outline);
  span(g, x, x + ww, wy + wh + 1, pal.outline);
  for (let y = wy - 1; y <= wy + wh + 1; y++) { g.set(x - 1, y, pal.outline); g.set(x + ww + 1, y, pal.outline); }
  for (let y = wy; y <= wy + wh; y++) g.set(R(x + ww / 2), y, pal.outline);
  span(g, x, x + ww, R(wy + wh / 2), pal.outline);
}

/**
 * A small dirt apron + a barrel and a sack at the building's front base — the
 * reference packs sit each building on a little plot with a prop or two. Drawn at
 * the very bottom of the sprite, flanking the door, within the footprint so it
 * never clips. Deterministic; `seed` varies which side the props land. */
export function isoGroundProps(g: IsoGrid, m: IsoMetrics, seed = 0): void {
  const cx = m.cx;
  const baseY = m.H - 2;
  // a thin dirt apron hugging the front V (two short trodden patches)
  for (let dx = -R(m.halfW * 0.5); dx <= R(m.halfW * 0.5); dx++) {
    const x = cx + dx;
    const edgeDrop = R(Math.abs(dx) * HH / HW);
    const y = baseY - edgeDrop + 1;
    if (Math.abs(dx) > R(5 * ISO_ART_SCALE / 4) && (dx + seed) % 2 === 0) g.set(x, y, "%");
  }
  // a barrel on one side
  const bx = cx + (seed % 2 === 0 ? -1 : 1) * R(m.halfW * 0.62);
  const by = baseY - R(Math.abs(bx - cx) * HH / HW) - 1;
  for (let dy = -R(4 * ISO_ART_SCALE / 4); dy <= 0; dy++) {
    g.set(bx, by + dy, "%"); g.set(bx + 1, by + dy, "w"); g.set(bx + 2, by + dy, "%");
  }
  g.set(bx, by - R(4 * ISO_ART_SCALE / 4), "%"); g.set(bx + 1, by - R(4 * ISO_ART_SCALE / 4), "W"); g.set(bx + 2, by - R(4 * ISO_ART_SCALE / 4), "%");
  g.set(bx + 1, by - R(2 * ISO_ART_SCALE / 4), "W"); // hoop
  // a sack on the other side
  const sx = cx + (seed % 2 === 0 ? 1 : -1) * R(m.halfW * 0.66);
  const sy = baseY - R(Math.abs(sx - cx) * HH / HW) - 1;
  g.set(sx, sy - 2, "t"); span(g, sx - 1, sx + 1, sy - 1, "c"); span(g, sx - 1, sx + 1, sy, "t");
}

/** A door centred on the near vertical edge, arched, following the front V. */
export function drawDoorFront(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const cx = m.cx;
  const frontBaseY = m.yBotMid + m.diaH / 2;
  const dh = Math.max(R(6 * ISO_ART_SCALE / 4), R(m.wallH * 0.6));
  const dw = R(4 * ISO_ART_SCALE / 4);
  for (let dx = -dw; dx <= dw; dx++) {
    const x = cx + dx;
    const edgeDrop = R(Math.abs(dx) * HH / HW);
    const baseY = frontBaseY - edgeDrop;
    const arch = R(Math.sqrt(Math.max(0, dw * dw - dx * dx)) * 0.6);
    for (let y = baseY - dh - arch; y < baseY; y++) g.set(x, y, pal.door);
    // plank lines
    if (dx % 2 === 0) for (let y = baseY - dh; y < baseY; y += 3) g.set(x, y, pal.outline);
  }
  // frame
  g.set(cx - dw - 1, frontBaseY - R(Math.abs(dw) * HH / HW), pal.outline);
  g.set(cx + dw + 1, frontBaseY - R(Math.abs(dw) * HH / HW), pal.outline);
}

// ---------------------------------------------------------------------------
// FORM builders — each returns a finished recipe for its footprint.
// ---------------------------------------------------------------------------

export interface FormOpts {
  accent?: (g: IsoGrid, pal: IsoPalette, m: IsoMetrics) => void;
  /** Draw a small dirt apron + barrel + sack at the front base (reference look). */
  ground?: boolean;
  /** Seed for ground-prop placement (which side props land). */
  groundSeed?: number;
}

/** Allocate a grid + metrics for a footprint. */
function begin(w: number, h: number, heightTiles: number): { g: IsoGrid; m: IsoMetrics } {
  const m = isoMetrics(w, h, heightTiles);
  const g = new IsoGrid(m.W, m.H);
  // Bake a ground CONTACT SHADOW first (under everything) so each building reads as
  // ANCHORED to the terrain instead of a floating cut-out — the single biggest
  // legibility win per the iso-art references (a grid-aligned cast shadow). The
  // committed sun is upper-left, so the shadow falls to the lower-right (SE).
  isoContactShadow(g, m);
  return { g, m };
}

/**
 * A soft ground-contact shadow: the footprint diamond, flattened and pushed a
 * few px toward the lower-right (SE — opposite the upper-left sun), stamped in a
 * cool dark (`i` ink) BELOW the building. Drawn first so walls/roof paint over the
 * part the building covers, leaving only the SE sliver of shadow visible — exactly
 * how a real cast shadow reads on the iso grid. Kept inside the front/SE half of
 * the sprite so the top-left corner stays transparent (recipe-guard invariant).
 */
export function isoContactShadow(g: IsoGrid, m: IsoMetrics): void {
  const { cx, halfW, diaH, yBotMid } = m;
  const midY = yBotMid;               // ground diamond mid-line
  const offX = Math.max(2, R(3 * ISO_ART_SCALE / 4)); // SE push
  const offY = Math.max(1, R(2 * ISO_ART_SCALE / 4));
  for (let dyAbs = -diaH / 2; dyAbs <= diaH / 2; dyAbs++) {
    const frac = 1 - Math.abs(dyAbs) / (diaH / 2);
    const half = halfW * frac;
    const y = R(midY + dyAbs) + offY;
    const xL = R(cx - half) + offX;
    const xR = R(cx + half) + offX;
    for (let x = xL; x <= xR; x++) {
      // Only the lower (front) half of the diamond casts a visible ground shadow;
      // the back half sits under the building.
      if (dyAbs < -1) continue;
      // Feather the SE rim: the outermost 2px and the very front tip dither out
      // (checkered) so the shadow reads soft, not as a hard bar.
      const edge = x >= xR - 1 || dyAbs >= diaH / 2 - 1;
      if (edge && ((x + y) & 1)) continue;
      g.set(x, y, "i");
    }
  }
}

/**
 * Half-timbered medieval COTTAGE: plaster walls with dark timber framing, a
 * steep gabled roof, a door + a shuttered window. The shared base for
 * house/bakery/smith/healer (palette-swapped).
 */
export function cottage(name: string, w: number, h: number, heightTiles: number, pal: IsoPalette, opts: FormOpts = {}): PixelRecipe {
  const { g, m } = begin(w, h, heightTiles);
  drawWalls(g, m, pal);
  drawTimberFrame(g, m, "%"); // dark-oak (bark) half-timber framing
  drawGableRoof(g, m, pal, R(2 * ISO_ART_SCALE / 4), 2.1);
  drawWindow(g, m, pal);
  drawDoorFront(g, m, pal);
  if (opts.ground) isoGroundProps(g, m, opts.groundSeed ?? 0);
  opts.accent?.(g, pal, m);
  return g.toRecipe(name);
}

/**
 * A plain hipped box (kept for forms that read better square, e.g. warehouse).
 */
export function boxBuilding(name: string, w: number, h: number, heightTiles: number, pal: IsoPalette, opts: FormOpts = {}): PixelRecipe {
  const { g, m } = begin(w, h, heightTiles);
  drawWalls(g, m, pal);
  drawHippedRoof(g, m, pal);
  drawDoorFront(g, m, pal);
  opts.accent?.(g, pal, m);
  return g.toRecipe(name);
}

/**
 * A WELL: a small circular stone well-head (a low cylinder ring, NOT a building
 * box), two timber posts carrying a little pitched roof, a windlass crossbar, and
 * a bucket on a rope. Sits low on its 1×1 ground diamond so it reads as a small
 * ground object, not a house. EDG32 stone + wood + clay-roof.
 */
export function wellForm(name: string, pal: IsoPalette): PixelRecipe {
  const { g, m } = begin(1, 1, 1);
  const { cx, halfW, diaH, yBotMid } = m;
  const groundY = yBotMid + diaH / 2;
  const ringR = R(halfW * 0.62);
  const ringTopY = groundY - R(diaH * 0.55); // top rim of the well kerb
  // --- Stone kerb: a short cylinder (top ellipse rim + a band of wall) ---
  const kerbH = R(diaH * 0.5);
  for (let y = ringTopY; y <= ringTopY + kerbH; y++) {
    // half-width of the ellipse at this row (a vertical cylinder)
    for (let x = cx - ringR; x <= cx + ringR; x++) {
      const f = (x - cx) / ringR;
      g.set(x, y, f < -0.5 ? "l" : f < 0.15 ? "s" : f < 0.6 ? "S" : "#"); // round stone shading
    }
    g.set(cx - ringR, y, pal.outline); g.set(cx + ringR, y, pal.outline);
    if ((y - ringTopY) % 3 === 0) span(g, cx - ringR + 1, cx + ringR - 1, y, pal.outline); // courses
  }
  // top rim ellipse + dark water hole
  for (let dx = -ringR; dx <= ringR; dx++) {
    const ey = R(Math.sqrt(Math.max(0, ringR * ringR - dx * dx)) * 0.42); // ellipse
    g.set(cx + dx, ringTopY - ey, "l"); g.set(cx + dx, ringTopY + ey, pal.outline);
  }
  disc(g, cx, ringTopY, R(ringR * 0.6), 2.2, "#");      // dark shaft mouth
  disc(g, cx, ringTopY, R(ringR * 0.4), 2.2, "b");      // water glint
  // --- Two posts + a little pitched roof over the well ---
  const postH = R(diaH * 0.9);
  const postTopY = ringTopY - postH;
  for (let dy = 0; dy <= postH; dy++) { g.set(cx - ringR + 1, ringTopY - dy, "%"); g.set(cx + ringR - 1, ringTopY - dy, "%"); }
  // pitched clay roof (a small gable spanning the two posts)
  const roofHalf = ringR + 1;
  const roofPeakY = postTopY - R(diaH * 0.45);
  for (let dx = -roofHalf; dx <= roofHalf; dx++) {
    const t = Math.abs(dx) / roofHalf;
    const ry = R(postTopY - (postTopY - roofPeakY) * (1 - t));
    g.set(cx + dx, ry, "#");
    g.set(cx + dx, ry + 1, dx < 0 ? pal.roofLight : pal.roof);
    g.set(cx + dx, ry + 2, dx < 0 ? pal.roof : pal.roofDark);
  }
  // windlass crossbar between the posts + bucket on a rope
  span(g, cx - ringR + 1, cx + ringR - 1, postTopY + R(diaH * 0.25), "w");
  const ropeX = cx, ropeTop = postTopY + R(diaH * 0.25);
  for (let y = ropeTop; y < ringTopY - 1; y++) g.set(ropeX, y, "#"); // rope
  g.set(ropeX, ringTopY - 2, "W"); g.set(ropeX - 1, ringTopY - 2, "W"); g.set(ropeX + 1, ringTopY - 2, "W"); // bucket
  g.set(ropeX, ringTopY - 1, "%");
  return g.toRecipe(name);
}

/**
 * A TOWER MILL: a tall, slightly-tapered ROUND stone tower (drawn as a real iso
 * volume — a curved lit-left/shaded-right cylinder with stone coursing), a small
 * domed timber cap, a door + window, and four big sails (drawn by `sailAccent`).
 * Reads as a windmill, not a sign/scarecrow. Fills a 2×2 footprint, tall.
 */
export function postMill(name: string, pal: IsoPalette, sailAccent: (g: IsoGrid, m: IsoMetrics) => void): PixelRecipe {
  const w = 2, h = 2, heightTiles = 3;
  const { g, m } = begin(w, h, heightTiles);
  const { cx, diaH, yBotMid } = m;
  const groundY = yBotMid + diaH / 2;

  // The cylindrical tower body: wide at the base, tapering toward the cap.
  const baseR = R(m.halfW * 0.6);
  const topR = R(m.halfW * 0.42);
  const bodyTopY = R(m.roofH * 0.7);   // where the body starts (cap sits above)
  const bodyBotY = groundY - 1;
  for (let y = bodyTopY; y <= bodyBotY; y++) {
    const t = (y - bodyTopY) / Math.max(1, bodyBotY - bodyTopY);
    const rr = R(baseR * t + topR * (1 - t)); // taper
    for (let x = cx - rr; x <= cx + rr; x++) {
      // round shading across the cylinder: bright left rim → lit → mid → shaded
      // right rim, all from the WALL tones (never the cap/roof colour).
      const f = (x - cx) / rr; // -1..1
      let ch: string;
      if (f < -0.55) ch = pal.wallEdge;   // bright left rim highlight
      else if (f < 0.15) ch = pal.wallL;  // lit body
      else if (f < 0.65) ch = pal.wallR;  // mid shade
      else ch = "%";                       // brown shaded right rim (not black)
      g.set(x, y, ch);
    }
    g.set(cx - rr, y, pal.outline);
    g.set(cx + rr, y, pal.outline);
    // stone coursing every few rows (subtle brown line, not heavy outline)
    if ((y - bodyTopY) % R(Math.max(5, 6 * ISO_ART_SCALE / 4)) === 0) span(g, cx - rr + 1, cx + rr - 1, y, "%");
  }
  // base footing: a slightly wider stone plinth (mid-stone, not black)
  disc(g, cx, bodyBotY, baseR + 1, 2.4, pal.wallR);
  for (let x = cx - baseR - 1; x <= cx + baseR + 1; x++) g.set(x, bodyBotY, pal.outline);

  // small arched door at the foot + a couple of windows up the tower
  const bodyH = bodyBotY - bodyTopY;
  const dh = R(Math.min(bodyH * 0.28, m.wallH * 0.45));
  for (let dx = -2; dx <= 2; dx++) {
    const arch = R(Math.sqrt(Math.max(0, 4 - dx * dx)));
    for (let y = bodyBotY - dh - arch; y < bodyBotY - 1; y++) g.set(cx + dx, y, pal.door);
  }
  // two small windows stacked on the lit front
  for (const fy of [0.32, 0.58]) {
    const wy = R(bodyTopY + bodyH * fy);
    g.set(cx, wy, pal.glass); g.set(cx, wy - 1, pal.glass);
    g.set(cx - 1, wy, pal.outline); g.set(cx + 1, wy, pal.outline);
    g.set(cx, wy - 2, pal.outline); g.set(cx, wy + 1, pal.outline);
  }

  // --- Domed timber CAP over the body ---
  const capH = R(m.roofH * 0.7);
  const capBaseR = topR + 1;
  for (let i = 0; i <= capH; i++) {
    const half = R(capBaseR * Math.cos((i / capH) * (Math.PI / 2))); // domed profile
    for (let x = cx - half; x <= cx + half; x++) g.set(x, bodyTopY - i, x < cx ? pal.roofLight : pal.roof);
    g.set(cx - half, bodyTopY - i, pal.outline);
    g.set(cx + half, bodyTopY - i, pal.roofDark);
  }
  // little finial / windshaft stub at the cap front
  g.set(cx, bodyTopY - capH - 1, "%");

  sailAccent(g, m);
  return g.toRecipe(name);
}

/**
 * Four windmill SAILS as an X centred on the mill cap, rotated by `phase01`
 * (0..1 → 0..90°, the 4-fold-symmetric period). Each arm is a latticed sail
 * (a dark spar with canvas slats). Mounted on the front of the cap so it reads
 * against the body, large. Pure of `phase01`.
 */
export function isoWindmillSails(g: IsoGrid, m: IsoMetrics, phase01 = 0): void {
  const hubX = m.cx;
  const hubY = R(m.roofH * 0.5);
  const r = R(m.halfW * 0.85);             // sail arm length (big, front-facing X)
  const inner = R(3 * ISO_ART_SCALE / 4);  // bare windshaft near the hub
  const blade = Math.max(3, R(5 * ISO_ART_SCALE / 4)); // sail width to ONE side
  const ang = phase01 * (Math.PI / 2);
  // Four sail arms 90° apart, drawn in the SCREEN plane (front-facing, no iso
  // squash) so they read as a bold windmill cross, with a latticed canvas blade
  // hanging off the leading side of each spar.
  for (let k = 0; k < 4; k++) {
    const a = ang + k * (Math.PI / 2);
    const dx = Math.cos(a), dy = Math.sin(a);
    const px = -Math.sin(a), py = Math.cos(a); // perpendicular (blade width dir)
    for (let i = inner; i <= r; i++) {
      const x = hubX + dx * i, y = hubY + dy * i;
      g.set(R(x), R(y), "#");                       // dark spar
      g.set(R(x + px), R(y + py), "#");             // 2px thick
      // canvas blade: a filled strip with periodic dark sail-bars (lattice)
      for (let s = 2; s <= blade + 1; s++) {
        const bar = (i % R(Math.max(3, 4 * ISO_ART_SCALE / 4))) < 1; // sail bars
        g.set(R(x + px * s), R(y + py * s), bar ? "%" : (s === blade + 1 ? "c" : "v"));
      }
    }
  }
  // bright brass hub cap last.
  disc(g, hubX, hubY, Math.max(2, R(3 * ISO_ART_SCALE / 4)), 1, "#");
  g.set(hubX, hubY, "O");
}

/**
 * Open FARM field: a tilled-furrow ground diamond ringed by a post-and-rail
 * fence with a gate, plus a few crop rows + a hay bale. No building body, so it
 * reads as cultivated land, not a house. (Sparse — the recipes test gives farm a
 * lower opaque-fraction floor.)
 */
export function openField(name: string, w: number, h: number, pal: IsoPalette): PixelRecipe {
  const { g, m } = begin(w, h, 1);
  const { cx, halfW, diaH, yBotMid } = m;
  const midY = yBotMid; // ground diamond mid-line
  // --- Tilled soil diamond (the field surface) with furrow rows ---
  for (let dyAbs = -diaH / 2; dyAbs <= diaH / 2; dyAbs++) {
    const y = R(midY + dyAbs);
    const frac = 1 - Math.abs(dyAbs) / (diaH / 2);
    const half = halfW * frac;
    for (let x = R(cx - half); x <= R(cx + half); x++) {
      // furrow striping along one iso axis
      const furrow = (R((x - cx) - (y - midY) * 2) % R(6 * ISO_ART_SCALE / 4)) < R(3 * ISO_ART_SCALE / 4);
      g.set(x, y, furrow ? "%" : "w"); // dark bark / wood-brown soil
    }
    g.set(R(cx - half), y, pal.outline);
    g.set(R(cx + half), y, pal.outline);
  }
  // crop sprouts (green specks in rows)
  for (let row = -2; row <= 2; row++) {
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * R(5 * ISO_ART_SCALE / 4);
      const y = midY + row * R(4 * ISO_ART_SCALE / 4);
      if (g.get(x, y) !== ".") { g.set(x, y - 1, "g"); g.set(x, y - 2, "G"); }
    }
  }
  // --- Post-and-rail fence around the diamond rim ---
  const corners = [
    { x: cx, y: midY - diaH / 2 }, // top (back)
    { x: cx + halfW, y: midY },    // right
    { x: cx, y: midY + diaH / 2 }, // front
    { x: cx - halfW, y: midY },    // left
  ];
  const fenceEdge = (a: { x: number; y: number }, b: { x: number; y: number }, gateGap: boolean) => {
    const steps = R(Math.hypot(b.x - a.x, b.y - a.y));
    const postEvery = R(10 * ISO_ART_SCALE / 4);
    const postH = R(12 * ISO_ART_SCALE / 4);
    const railTop = R(postH * 0.75), railMid = R(postH * 0.4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (gateGap && t > 0.4 && t < 0.6) continue; // gate opening
      const x = R(a.x + (b.x - a.x) * t);
      const y = R(a.y + (b.y - a.y) * t);
      // two horizontal rails (dark, so they stand out from the soil)
      g.set(x, y - railTop, "W"); g.set(x, y - railTop + 1, "%");
      g.set(x, y - railMid, "W");
      // posts (2px wide) at intervals
      if (i % postEvery === 0) for (let dy = 0; dy < postH; dy++) { g.set(x, y - dy, "#"); g.set(x + 1, y - dy, "%"); }
    }
  };
  fenceEdge(corners[3]!, corners[0]!, false); // left→top (back-left)
  fenceEdge(corners[0]!, corners[1]!, false); // top→right (back-right)
  fenceEdge(corners[3]!, corners[2]!, false); // left→front
  fenceEdge(corners[1]!, corners[2]!, true);  // right→front (with gate)
  // --- A round hay bale in a corner ---
  const hx = R(cx + halfW * 0.5), hy = R(midY + diaH * 0.18);
  disc(g, hx, hy, R(4 * ISO_ART_SCALE / 4), 1.3, "O");
  disc(g, hx, hy, R(4 * ISO_ART_SCALE / 4) - 1, 1.3, "y");
  return g.toRecipe(name);
}

/**
 * Open-air MARKET: two timber-frame stalls with red-striped awnings + goods on
 * tables, no enclosing walls — a bustling market square cue.
 */
export function marketStalls(name: string, w: number, h: number, pal: IsoPalette): PixelRecipe {
  const { g, m } = begin(w, h, 1);
  const { cx, halfW, diaH, yBotMid } = m;
  const midY = yBotMid;
  // cobble ground diamond (subtle)
  for (let dyAbs = -diaH / 2; dyAbs <= diaH / 2; dyAbs++) {
    const y = R(midY + dyAbs);
    const half = halfW * (1 - Math.abs(dyAbs) / (diaH / 2));
    for (let x = R(cx - half); x <= R(cx + half); x++) g.set(x, y, ((x ^ y) & 2) ? "S" : "l");
    g.set(R(cx - half), y, pal.outline); g.set(R(cx + half), y, pal.outline);
  }
  const stall = (sx: number, sy: number) => {
    const sw = R(halfW * 0.42);       // half-width of the stall
    const postH = R(m.wallH * 1.1);   // tall enough to read as a booth
    const tableY = sy - R(postH * 0.35);
    // 2 fat corner posts (2px wide).
    for (const pxc of [sx - sw, sx + sw]) for (let dy = 0; dy < postH; dy++) { g.set(pxc, sy - dy, "%"); g.set(pxc + 1, sy - dy, "#"); }
    // table top + apron.
    rect(g, sx - sw, tableY, sx + sw, tableY + R(3 * ISO_ART_SCALE / 4), "w");
    span(g, sx - sw, sx + sw, tableY, "t");
    // goods piled on the table (colourful produce/cloth).
    for (let i = -sw + 2; i <= sw - 2; i += R(4 * ISO_ART_SCALE / 4)) {
      const ch = i % 3 === 0 ? "e" : i % 2 === 0 ? "O" : "g";
      g.set(sx + i, tableY - 1, ch); g.set(sx + i, tableY - 2, ch); g.set(sx + i + 1, tableY - 1, ch);
    }
    // striped awning: a pitched canopy peaking at the centre, sloping to the sides.
    const awningTop = sy - postH;
    const peak = R(6 * ISO_ART_SCALE / 4);
    for (let dx = -sw - R(3 * ISO_ART_SCALE / 4); dx <= sw + R(3 * ISO_ART_SCALE / 4); dx++) {
      const slope = R(Math.abs(dx) / (sw + 3) * peak);
      const ay = awningTop - peak + slope;
      const stripe = (Math.floor((dx + 200) / R(4 * ISO_ART_SCALE / 4)) % 2) === 0 ? "e" : "v";
      g.set(sx + dx, ay, "#");
      for (let t = 1; t <= R(4 * ISO_ART_SCALE / 4); t++) g.set(sx + dx, ay + t, stripe);
      // scalloped fringe
      if ((dx + 200) % R(4 * ISO_ART_SCALE / 4) === 0) g.set(sx + dx, ay + R(4 * ISO_ART_SCALE / 4) + 1, "e");
    }
  };
  // Two stalls, the front one lower (nearer the camera) so they don't overlap.
  stall(R(cx - halfW * 0.34), R(midY - diaH * 0.06));
  stall(R(cx + halfW * 0.30), R(midY + diaH * 0.30));
  return g.toRecipe(name);
}

/**
 * Stone CHURCH: a nave (gabled body) + a tall square BELL TOWER on the left with
 * a steep spire and a cross — clearly a place of worship, taller/narrower than a
 * house.
 */
export function church(name: string, w: number, h: number, heightTiles: number, pal: IsoPalette): PixelRecipe {
  const { g, m } = begin(w, h, heightTiles);
  drawWalls(g, m, pal);
  drawGableRoof(g, m, pal);
  // arched door
  drawDoorFront(g, m, pal);
  // --- Bell tower rising on the near-left ---
  const tx = R(m.cx - m.halfW * 0.5);
  const towerHalf = R(m.halfW * 0.22);
  const towerTop = R(2 * ISO_ART_SCALE / 4);
  const t = (tx - (m.cx - m.halfW)) / m.halfW;
  const towerBot = R(m.yTopMid + (m.diaH / 2) * t + m.wallH);
  for (let y = towerTop + R(m.roofH * 0.6); y <= towerBot; y++) {
    for (let x = tx - towerHalf; x <= tx + towerHalf; x++) g.set(x, y, x < tx ? pal.wallL : pal.wallR);
    g.set(tx - towerHalf, y, pal.outline); g.set(tx + towerHalf, y, pal.outline);
  }
  // belfry opening
  rect(g, tx - 1, R(towerTop + m.roofH * 0.8), tx + 1, R(towerTop + m.roofH * 0.8) + R(5 * ISO_ART_SCALE / 4), "#");
  // spire
  const spireH = R(m.roofH * 0.9);
  for (let i = 0; i <= spireH; i++) {
    const half = R(towerHalf * (1 - i / spireH));
    for (let x = tx - half; x <= tx + half; x++) g.set(x, towerTop + R(m.roofH * 0.6) - i, x < tx ? pal.roofLight : pal.roof);
    g.set(tx - half, towerTop + R(m.roofH * 0.6) - i, pal.outline);
    g.set(tx + half, towerTop + R(m.roofH * 0.6) - i, pal.roofDark);
  }
  // cross on the spire tip
  const ctop = towerTop + R(m.roofH * 0.6) - spireH;
  for (let y = ctop - R(5 * ISO_ART_SCALE / 4); y <= ctop; y++) g.set(tx, y, "O");
  span(g, tx - 2, tx + 2, ctop - R(3 * ISO_ART_SCALE / 4), "O");
  return g.toRecipe(name);
}

/**
 * Long timber WAREHOUSE (storehouse / tradingpost): a wide hipped body with big
 * barn doors on the front + a hayloft dormer + crates outside.
 */
export function warehouse(name: string, w: number, h: number, heightTiles: number, pal: IsoPalette, opts: FormOpts = {}): PixelRecipe {
  const { g, m } = begin(w, h, heightTiles);
  drawWalls(g, m, pal);
  drawGableRoof(g, m, pal, R(2 * ISO_ART_SCALE / 4));
  // big double barn doors (wider than a normal door)
  const cx = m.cx, frontBaseY = m.yBotMid + m.diaH / 2;
  const dh = R(m.wallH * 0.7), dw = R(7 * ISO_ART_SCALE / 4);
  for (let dx = -dw; dx <= dw; dx++) {
    const edgeDrop = R(Math.abs(dx) * HH / HW);
    const baseY = frontBaseY - edgeDrop;
    for (let y = baseY - dh; y < baseY; y++) g.set(cx + dx, y, pal.door);
  }
  g.set(cx, frontBaseY - dh, pal.outline); // central seam
  for (let y = frontBaseY - dh; y < frontBaseY; y += 2) g.set(cx, y, "%");
  isoGableDormer(g, m, pal);
  if (opts.ground) isoGroundProps(g, m, opts.groundSeed ?? 0);
  opts.accent?.(g, pal, m);
  return g.toRecipe(name);
}

/**
 * Flat crenellated KEEP/TOWER (forts): stone walls in ashlar courses, a flat
 * battlemented deck (merlons around all four rim edges), arrow slits, an arched
 * gate. Distinct castle silhouette. `extra` adds turret/banner.
 */
export function fort(name: string, w: number, h: number, heightTiles: number, pal: IsoPalette, opts: FormOpts = {}): PixelRecipe {
  const { g, m } = begin(w, h, heightTiles);
  drawWalls(g, m, pal);
  drawAshlarCourses(g, m, pal);
  drawArrowSlits(g, m);
  drawFlatCrenellatedTop(g, m, pal);
  drawDoorFront(g, m, pal); // arched gate
  opts.accent?.(g, pal, m);
  return g.toRecipe(name);
}

/** Ashlar (cut-stone) coursing on the front wall faces: sparse horizontal mortar
 *  lines + a few staggered vertical joints, so it reads as big cut blocks (NOT a
 *  per-pixel checkerboard). Spacing is a fixed minimum so it stays legible at 1×. */
function drawAshlarCourses(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const { cx, halfW, diaH, yTopMid, yBotMid } = m;
  const course = Math.max(5, R(8 * ISO_ART_SCALE / 4)); // ≥5px tall blocks
  const brick = Math.max(8, R(14 * ISO_ART_SCALE / 4)); // ≥8px wide blocks
  for (let x = R(cx - halfW); x <= R(cx + halfW); x++) {
    const t = x <= cx ? (x - (cx - halfW)) / halfW : (cx + halfW - x) / halfW;
    const topEdgeY = yTopMid + (diaH / 2) * t;
    const botEdgeY = yBotMid + (diaH / 2) * t;
    for (let y = R(topEdgeY); y <= R(botEdgeY); y++) {
      const row = Math.floor((y - R(topEdgeY)) / course);
      const onCourse = (y - R(topEdgeY)) % course === 0;
      // staggered vertical joint: every `brick` px, offset half a brick on odd rows
      const phase = (row % 2) * R(brick / 2);
      const onJoint = ((x + phase) % brick === 0);
      if (onCourse) g.set(x, y, pal.outline);        // horizontal mortar
      else if (onJoint) g.set(x, y, pal.roofDark);   // vertical joint (one per block)
      else if (onCourse === false && (y - R(topEdgeY)) % course === 1) g.set(x, y, x < cx ? pal.wallEdge : pal.wallR); // top-of-block highlight
    }
  }
}

/** Two arrow slits on the front faces. */
function drawArrowSlits(g: IsoGrid, m: IsoMetrics): void {
  const place = (frac: number, lit: boolean) => {
    const x = R(m.cx + (lit ? -1 : 1) * m.halfW * frac);
    const t = lit ? (x - (m.cx - m.halfW)) / m.halfW : (m.cx + m.halfW - x) / m.halfW;
    const topEdgeY = m.yTopMid + (m.diaH / 2) * t;
    const sy = R(topEdgeY + m.wallH * 0.3);
    for (let dy = 0; dy < R(7 * ISO_ART_SCALE / 4); dy++) g.set(x, sy + dy, "#");
    g.set(x, sy + R(3 * ISO_ART_SCALE / 4), "#"); g.set(x - 1, sy + R(3 * ISO_ART_SCALE / 4), "#"); g.set(x + 1, sy + R(3 * ISO_ART_SCALE / 4), "#");
  };
  place(0.45, true);
  place(0.45, false);
}

/** Flat fortress rooftop diamond with merlons standing on its four rim edges. */
function drawFlatCrenellatedTop(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const { cx, halfW, diaH, yTopMid } = m;
  const HHalf = diaH / 2;
  for (let dyAbs = -HHalf; dyAbs <= HHalf; dyAbs++) {
    const y = R(yTopMid + dyAbs);
    const half = halfW * (1 - Math.abs(dyAbs) / HHalf);
    for (let x = R(cx - half); x <= R(cx + half); x++) g.set(x, y, dyAbs < 0 ? pal.roof : pal.roofLight);
    g.set(R(cx - half), y, pal.outline); g.set(R(cx + half), y, pal.outline);
  }
  const MERLON = R(5 * ISO_ART_SCALE / 4);
  const top = { x: cx, y: yTopMid - HHalf };
  const left = { x: cx - halfW, y: yTopMid };
  const right = { x: cx + halfW, y: yTopMid };
  const front = { x: cx, y: yTopMid + HHalf };
  const edges: Array<[{ x: number; y: number }, { x: number; y: number }, string]> = [
    [top, left, pal.wallL], [top, right, pal.wallR], [left, front, pal.wallL], [right, front, pal.wallR],
  ];
  const steps = R(halfW);
  const gap = R(4 * ISO_ART_SCALE / 4);
  for (const [a, b, face] of edges) {
    for (let i = 0; i <= steps; i++) {
      if (i % gap >= R(2 * ISO_ART_SCALE / 4)) continue;
      const t = i / steps;
      const x = R(a.x + (b.x - a.x) * t);
      const yEdge = R(a.y + (b.y - a.y) * t);
      for (let dy = 1; dy <= MERLON; dy++) g.set(x, yEdge - dy, face);
      g.set(x, yEdge - MERLON - 1, pal.outline);
    }
  }
}

// ---------------------------------------------------------------------------
// Accent generators (drawn over a form)
// ---------------------------------------------------------------------------

/** A gabled hayloft DORMER on the front roof slope (warehouse/farm-barn). */
export function isoGableDormer(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const cx = m.cx;
  const baseY = R(m.roofH * 0.95);
  const half = R(m.halfW * 0.18);
  const wallH = R(6 * ISO_ART_SCALE / 4);
  const apexY = baseY - wallH - half;
  for (let y = apexY; y < baseY - wallH; y++) {
    const t = (y - apexY) / Math.max(1, half);
    const hw = R(half * t);
    for (let x = cx - hw; x <= cx + hw; x++) g.set(x, y, pal.wallL);
    g.set(cx - hw, y, pal.outline); g.set(cx + hw, y, pal.outline);
  }
  for (let y = baseY - wallH; y < baseY; y++) {
    for (let x = cx - half; x <= cx + half; x++) g.set(x, y, pal.wallL);
    g.set(cx - half, y, pal.outline); g.set(cx + half, y, pal.outline);
  }
  rect(g, cx - 1, baseY - wallH, cx + 1, baseY - 1, pal.door); // loft door
  for (let y = apexY - 2; y < apexY; y++) g.set(cx, y, "%"); // hoist beam
}

/** Fat brick CHIMNEY on the front-right roof, with a flame + smoke when glowing. */
export function isoChimney(g: IsoGrid, pal: IsoPalette, m: IsoMetrics, glow = false): void {
  const x = R(m.cx + m.halfW * 0.35);
  const top = R(m.roofH * 0.35);
  const h = R(11 * ISO_ART_SCALE / 4);
  const wdt = R(4 * ISO_ART_SCALE / 4);
  for (let dy = 0; dy < h; dy++) {
    const y = top + dy;
    for (let dx = 0; dx < wdt; dx++) g.set(x + dx, y, dx === 0 ? "%" : (dy % R(3 * ISO_ART_SCALE / 4) === 0 ? "R" : "r"));
    g.set(x + wdt, y, "#");
  }
  span(g, x - 1, x + wdt, top - 1, "%"); // cap lip
  span(g, x - 1, x + wdt, top, pal.outline);
  g.set(x + 1, top, "#");
  if (glow) {
    g.set(x + 1, top - 1, "o"); g.set(x + 2, top - 2, "y"); g.set(x + 1, top - 3, "o");
    g.set(x + 1, top - R(7 * ISO_ART_SCALE / 4), "l"); g.set(x + 3, top - R(10 * ISO_ART_SCALE / 4), "l");
  }
}

/** A vertical water WHEEL on the lit-left wall (sawmill). */
export function isoWaterWheel(g: IsoGrid, m: IsoMetrics): void {
  const cx = R(m.cx - m.halfW * 0.55);
  const cy = R(m.yBotMid + m.wallH * 0.1);
  const r = R(m.wallH * 0.55);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy); if (d > r) continue;
    const x = cx + dx, y = cy + dy;
    if (d > r - 2) g.set(x, y, "#"); else if (d > r - R(4 * ISO_ART_SCALE / 4)) g.set(x, y, "w"); else g.set(x, y, d < 3 ? "%" : "W");
  }
  for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; g.set(R(cx + Math.cos(t) * (r + 1)), R(cy + Math.sin(t) * (r + 1)), "t"); }
  for (let i = -r + 2; i <= r - 2; i++) { g.set(cx + i, cy, "t"); g.set(cx, cy + i, "t"); }
  for (let i = -3; i <= 4; i++) g.set(cx + i, cy + r + 1, "B");
}

/** Stacked LOG PILE beside a wall (woodcutter/sawmill). */
export function isoLogPile(g: IsoGrid, m: IsoMetrics): void {
  const x0 = R(m.cx - m.halfW * 0.7);
  const y0 = m.H - R(5 * ISO_ART_SCALE / 4);
  const log = (cx: number, cy: number) => {
    const s = R(4 * ISO_ART_SCALE / 4);
    for (let dy = -1; dy <= s; dy++) for (let dx = 0; dx <= s; dx++) g.set(cx + dx, cy + dy, "%");
    g.set(cx + 1, cy, "t"); g.set(cx + 2, cy, "t"); g.set(cx + 1, cy + 1, "w");
  };
  const step = R(5 * ISO_ART_SCALE / 4);
  log(x0, y0); log(x0 + step, y0); log(x0 + R(step / 2), y0 - R(4 * ISO_ART_SCALE / 4));
}

/** A chopping BLOCK with a buried axe (woodcutter). */
export function isoChoppingBlock(g: IsoGrid, m: IsoMetrics): void {
  const x = R(m.cx + m.halfW * 0.4);
  const y = m.H - R(6 * ISO_ART_SCALE / 4);
  disc(g, x, y, R(3 * ISO_ART_SCALE / 4), 1.4, "%");
  g.set(x, y, "t"); g.set(x + 1, y, "w");
  g.set(x + 1, y - 2, "%"); g.set(x + 2, y - 4, "%"); g.set(x + 3, y - 6, "%"); // handle
  g.set(x - 1, y - 3, "l"); g.set(x, y - 3, "l"); g.set(x, y - 4, "S"); // head
}

/** Grain SACKS by a wall (mill). */
export function isoGrainSacks(g: IsoGrid, m: IsoMetrics): void {
  const x0 = R(m.cx - m.halfW * 0.6);
  const y0 = m.H - R(5 * ISO_ART_SCALE / 4);
  const sack = (cx: number, cy: number) => {
    g.set(cx + 1, cy - 2, "y");
    span(g, cx, cx + 2, cy - 1, "O"); span(g, cx - 1, cx + 3, cy, "y");
    span(g, cx - 1, cx + 3, cy + 1, "O"); span(g, cx, cx + 2, cy + 2, "%");
  };
  const step = R(6 * ISO_ART_SCALE / 4);
  sack(x0, y0); sack(x0 + step, y0); sack(x0 + R(step / 2), y0 - R(4 * ISO_ART_SCALE / 4));
}

/** An ANVIL out front (smith). */
export function isoAnvil(g: IsoGrid, m: IsoMetrics): void {
  const x = R(m.cx + m.halfW * 0.45), y = m.H - R(5 * ISO_ART_SCALE / 4);
  const s = ISO_ART_SCALE;
  rect(g, x - s, y, x + s, y + s, "#"); // base
  rect(g, x - 2 * s, y - s, x + 2 * s, y - 1, "S"); // top face
  g.set(x + 2 * s, y - s, "l"); // horn
}

/** Crates/barrels by a wall (storehouse/tradingpost). */
export function isoCrates(g: IsoGrid, m: IsoMetrics): void {
  const x0 = R(m.cx + m.halfW * 0.45);
  const y0 = m.H - R(5 * ISO_ART_SCALE / 4);
  const crate = (cx: number, cy: number, s: number) => {
    rect(g, cx, cy, cx + s - 1, cy + s - 1, "w");
    span(g, cx, cx + s - 1, cy, "%");
    span(g, cx, cx + s - 1, R(cy + s / 2), "W");
    for (let dy = 0; dy < s; dy++) g.set(cx + s - 1, cy + dy, "W");
  };
  const s = R(5 * ISO_ART_SCALE / 4);
  crate(x0, y0, s); crate(x0 + s + 1, y0 + 1, R(s * 0.8)); crate(x0 + 1, y0 - s, R(s * 0.8));
}

/** A standing CROSS on the front roof slope (chapel via church builder uses its
 *  own; healer uses this on a cottage roof). */
export function isoCross(g: IsoGrid, m: IsoMetrics, color: string): void {
  const x = m.cx;
  const top = Math.max(1, R(m.roofH * 0.2));
  const h = R(9 * ISO_ART_SCALE / 4);
  for (let y = top - 1; y <= top + h; y++) g.set(x, y, "#");
  span(g, x - 2, x + 2, R(top + h * 0.35), "#");
  for (let y = top; y < top + h; y++) g.set(x, y, color);
  span(g, x - 1, x + 1, R(top + h * 0.35), color);
}

/** A banner pennant near the roof peak/deck (forts/town-hall). */
export function isoBanner(g: IsoGrid, m: IsoMetrics, color: string): void {
  const x = m.cx;
  const poleH = R(9 * ISO_ART_SCALE / 4);
  for (let y = -1; y < poleH; y++) g.set(x, y, "#");
  for (let y = 1; y < R(poleH * 0.6); y++) span(g, x + 1, x + R(6 * ISO_ART_SCALE / 4), y, color);
  g.set(x + R(6 * ISO_ART_SCALE / 4), 1, color);
}

/** A small watch TURRET on a fort deck (tower). */
export function isoTurret(g: IsoGrid, m: IsoMetrics, pal: IsoPalette): void {
  const cx = m.cx, topY = R(2 * ISO_ART_SCALE / 4), half = R(5 * ISO_ART_SCALE / 4), h = R(9 * ISO_ART_SCALE / 4);
  for (let y = topY; y < topY + h; y++) {
    for (let x = cx - half; x <= cx + half; x++) g.set(x, y, x < cx ? pal.wallL : pal.wallR);
    g.set(cx - half, y, pal.outline); g.set(cx + half, y, pal.outline);
  }
  for (let x = cx - half; x <= cx + half; x += R(3 * ISO_ART_SCALE / 4)) { g.set(x, topY - 1, pal.wallL); g.set(x, topY - 2, pal.outline); }
}

/** Mine PITHEAD: dark arched shaft mouth + bold timber winding-tower A-frame +
 *  ore spill. Call with `noDoor` (the form omits the door). */
export function isoShaftMouth(g: IsoGrid, m: IsoMetrics, oreColor: string): void {
  const cx = m.cx, frontBaseY = m.H - R(2 * ISO_ART_SCALE / 4);
  const w = R(6 * ISO_ART_SCALE / 4), h = R(m.wallH * 0.7);
  for (let dx = -w; dx <= w; dx++) {
    const x = cx + dx; const edgeDrop = R(Math.abs(dx) * HH / HW);
    const baseY = frontBaseY - edgeDrop; const arch = R(Math.sqrt(Math.max(0, w * w - dx * dx)) * 0.7);
    for (let y = baseY - h - arch; y < baseY; y++) g.set(x, y, "#");
  }
  for (let dy = 0; dy < h + 3; dy++) { const e = R((w + 1) * HH / HW); g.set(cx - w - 1, frontBaseY - e - dy, "W"); g.set(cx + w + 1, frontBaseY - e - dy, "W"); }
  // winding tower
  const apexY = R(2 * ISO_ART_SCALE / 4), baseTowerY = R(m.roofH + 2), legHalf = R(7 * ISO_ART_SCALE / 4);
  for (let y = apexY; y <= baseTowerY; y++) {
    const t = (y - apexY) / Math.max(1, baseTowerY - apexY); const off = R(legHalf * t);
    g.set(cx - off, y, "W"); g.set(cx - off - 1, y, "#"); g.set(cx + off, y, "W"); g.set(cx + off + 1, y, "#");
  }
  for (let i = 1; i <= 2; i++) { const y = apexY + R((baseTowerY - apexY) * (i / 3)); const off = R(legHalf * (i / 3)); span(g, cx - off, cx + off, y, "%"); }
  g.set(cx, apexY, "#"); g.set(cx - 1, apexY, "O"); g.set(cx + 1, apexY, "O");
  for (const s of [-1, 1]) { g.set(cx + s * (w + 2), frontBaseY - 2, oreColor); g.set(cx + s * (w + 3), frontBaseY - 1, oreColor); g.set(cx + s * (w + 1), frontBaseY - 2, oreColor); }
}

/** Open QUARRY pit: terraced stone rings + cut ashlar blocks + a hoist. */
export function isoQuarryPit(g: IsoGrid, m: IsoMetrics): void {
  const cx = m.cx, midY = R(m.roofH + m.wallH * 0.4);
  for (let ring = 0; ring < 3; ring++) {
    const half = R(m.halfW * (0.6 - ring * 0.18));
    const tone = ring === 0 ? "S" : ring === 1 ? "i" : "#";
    for (let dx = -half; dx <= half; dx++) {
      const dyEdge = R((1 - Math.abs(dx) / half) * (half * DIA_H / DIA_W));
      g.set(cx + dx, midY - dyEdge, tone); g.set(cx + dx, midY + dyEdge, tone);
    }
  }
  const blk = (bx: number, by: number, ch: string) => { rect(g, bx, by, bx + R(4 * ISO_ART_SCALE / 4), by + R(3 * ISO_ART_SCALE / 4), ch); span(g, bx, bx + R(4 * ISO_ART_SCALE / 4), by, "v"); for (let dy = 0; dy <= R(3 * ISO_ART_SCALE / 4); dy++) g.set(bx, by + dy, "#"); };
  blk(R(cx + 4 * ISO_ART_SCALE / 4), R(m.yBotMid), "l");
  blk(R(cx - 8 * ISO_ART_SCALE / 4), m.H - R(6 * ISO_ART_SCALE / 4), "S");
}

/** A gabled WELL hood on stone ring with a bucket on a rope (well). */
export function isoWellHood(g: IsoGrid, m: IsoMetrics): void {
  const cx = m.cx, eaveY = Math.max(2, R(m.roofH));
  const half = Math.max(R(4 * ISO_ART_SCALE / 4), R(m.halfW * 0.4));
  for (let y = eaveY; y < eaveY + R(7 * ISO_ART_SCALE / 4); y++) { g.set(cx - half, y, "%"); g.set(cx + half, y, "%"); }
  for (let i = 0; i <= half; i++) span(g, cx - i, cx + i, eaveY - R((half - i) * 0.7), i < half ? "r" : "#");
  span(g, cx - half, cx + half, eaveY, "w");
  for (let y = eaveY + 1; y < eaveY + R(4 * ISO_ART_SCALE / 4); y++) g.set(cx, y, "#");
  const by = eaveY + R(4 * ISO_ART_SCALE / 4);
  g.set(cx, by, "W"); g.set(cx - 1, by, "W"); g.set(cx + 1, by, "W");
}
