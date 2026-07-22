/**
 * MateQuest — the spatial folklore-JOURNEY map (2026-07-22 designer pass v4: TOP-DOWN 2.5D).
 *
 * The map is now a single **top-down ground plane** seen from above (no more side-view sky/horizon
 * split — that framing made the road float above the terrain). A **continuous footpath lies flat on
 * the ground** and winds between the run's nodes; **scenery stands upright as billboard props** that
 * cast a flat shadow onto the plane (the RollerCoaster-Tycoon 2.5D trick), so we keep the storybook
 * charm while the trail genuinely threads *through* each zone. Four themed zones run left→right
 * (Pădurea Adâncă → Satul → Munții Carpați → Bârlogul Zmeului) as vertical bands with a dithered
 * seam between them.
 *
 * ## Look — SOLID colours + faked depth (Farm + Citadel techniques, rect-only)
 *  - **Ground is a grid of OPAQUE tiles** (Farm's per-tile ground-noise loop) filling the whole
 *    plane; each tile's shade is picked by a **hillshade band** over an fBm height field (Citadel's
 *    dark/base/light banding) — flat solid colours that still read as gentle relief.
 *  - Each zone has a **distinct opaque palette** + zone-signature ground flecks (tilled earth / snow
 *    / embers) and its own prop mix (pines, ferns, mushrooms / cottages, wells, fences / peaks,
 *    rocks / dead trees, the lair).
 *  - **Depth** comes from: hillshade tiles, **upright props with SE drop-shadows**, and node
 *    drop-shadow skirts (Citadel's building-shadow trick) — never from transparency.
 *  - The trail is a **continuous footpath** — many small overlapping dirt stamps with an organic
 *    wobbling width + a trodden dust centreline — not a chain of concatenated squares.
 * All colours are Resurrect-64 `MATE_PAL` roles (no raw hex; no WebGPU/shaders — Canvas2D runs on
 * any device, per the user directive).
 *
 * ## Camera / coordinates
 * The map is laid out in WORLD space (`worldW × worldH`); `worldW` exceeds the viewport so the
 * player scrolls horizontally (`worldH === viewH`, so no vertical scroll). The camera (`camX,camY`,
 * clamped) is owned here. `render(surface, run, hoverId, viewW, viewH)` takes the live viewport size
 * (canvas CSS px). WORLD elements draw through an offset painter (`-camX,-camY`); HUD chrome (title /
 * HP / legend / scroll hints) is fixed SCREEN space. The camera auto-centers on the hero on any
 * advance, then the player pans freely (drag/wheel/arrows — wired in `main.ts`).
 *
 * ## Determinism
 * Layout, the height field, and all scatter are a PURE function of `RunView` + an integer hash
 * (`rand01`) — never `Math.random`/`Date.now`.
 *
 * Public shape: `createMapScreen(): { render, nodeAtScreen, panBy, reachableOrder }`.
 */
import { drawText, measureText, type UISurface } from "@engine/ui";
import type { MapNode, NodeType, RunMap, RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

const COLUMN_SPACING = 260; // world px between progression columns (wider than a screen ⇒ scroll)
const MARGIN_X = 130; // world left/right margin
const CHROME_TOP = 56; // fixed screen band for title + HP
const LEGEND_H = 28; // fixed screen band for the legend
const CULL_PAD = 96; // draw margin around the viewport (perf)

const NODE_W = 50;
const NODE_H = 38;
const BOSS_W = 66;
const BOSS_H = 50;
const NODE_BORDER = 3;
const COL_WAVE = 34; // vertical wobble per column so the top-down trail snakes

const TILE = 28; // ground-tile size (Farm bakes 16px; we redraw per frame so go coarser for perf)
const SEAM = 46; // half-width of the dithered zone-boundary transition
const HEIGHT_FREQ = 0.09; // fBm sample frequency (lower ⇒ larger, smoother landforms)
const SLOPE_GAIN = 1.2; // hillshade slope weight (Citadel uses 1.3)
const HEIGHT_GAIN = 0.55; // hypsometric weight
const TERRAIN_RANGE = 0.34; // maps the shade signal onto the 3-tone ramp; wider ⇒ calmer, mostly-base
const SHADOW_OFF = 3; // SE drop-shadow offset (Citadel's fake-height trick)

// 4×4 ordered-dither (Bayer) matrix — dithers between adjacent ground tones so the solid-colour
// bands blend smoothly instead of forming hard patches (the classic pixel-art gradient trick).
const BAYER4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const PROP_CELL = 96; // scatter grid: at most one prop per cell
const PROP_DENSITY = 0.5; // fraction of cells that spawn a prop

const ROAD_CORE = 9; // footpath width
const ROAD_STEP = 3; // fine stamp spacing → overlapping stamps read as a continuous trail

const HP_BAR_X = 250;
const HP_BAR_Y = 26;
const HP_BAR_W = 190;
const HP_BAR_H = 12;

const NODE_TYPE_COLOR: Record<NodeType, string> = {
  combat: MATE_PAL.skyBlue,
  elite: MATE_PAL.crimson,
  rest: MATE_PAL.green,
  boss: MATE_PAL.red,
};
const NODE_GLYPH: Record<NodeType, string> = { combat: "†", elite: "★", rest: "♥", boss: "♠" };
const LEGEND_ORDER: readonly NodeType[] = ["combat", "elite", "rest", "boss"];

/** Palette accents used for flower petals (all Resurrect-64 roles) — picked deterministically. */
const FLOWER_COLORS: readonly string[] = [MATE_PAL.gold, MATE_PAL.red, MATE_PAL.mauve, MATE_PAL.white, MATE_PAL.salmon, MATE_PAL.skyBlue];

type ZoneKind = "forest" | "village" | "mountains" | "lair";
interface ZoneTheme {
  readonly kind: ZoneKind;
  readonly gBase: string; // ground base shade (flat cells)
  readonly gDark: string; // ground shadow band (SE-facing slope)
  readonly gLight: string; // ground lit band (NW-facing slope)
  readonly fleck: string; // zone-signature ground fleck (tilled earth / snow / ember …)
}
const ZONE_THEMES: readonly ZoneTheme[] = [
  { kind: "forest", gBase: MATE_PAL.greenMid, gDark: MATE_PAL.greenDark, gLight: MATE_PAL.green, fleck: MATE_PAL.teal },
  { kind: "village", gBase: MATE_PAL.green, gDark: MATE_PAL.greenMid, gLight: MATE_PAL.green, fleck: MATE_PAL.clay },
  { kind: "mountains", gBase: MATE_PAL.slate, gDark: MATE_PAL.navy, gLight: MATE_PAL.steel, fleck: MATE_PAL.white },
  { kind: "lair", gBase: MATE_PAL.bark, gDark: MATE_PAL.black, gLight: MATE_PAL.plum, fleck: MATE_PAL.red },
];

interface NodeRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}
interface ZoneBand {
  readonly index: number;
  readonly startX: number;
  readonly endX: number;
}
interface MapLayout {
  readonly nodes: ReadonlyMap<number, NodeRect>;
  readonly zones: readonly ZoneBand[];
  readonly worldW: number;
  readonly worldH: number;
  readonly playTop: number;
  readonly playBottom: number;
  readonly anchor: { readonly cx: number; readonly cy: number };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function rand01(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// --- height field (Farm fBm + Citadel hillshade, adapted to tile coords) -------------------------
/** Bilinear value noise on an integer lattice, cubic-Hermite smoothed (Farm's `valueNoise2d`). */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = rand01(xi + seed * 101, yi + seed * 131);
  const tr = rand01(xi + 1 + seed * 101, yi + seed * 131);
  const bl = rand01(xi + seed * 101, yi + 1 + seed * 131);
  const br = rand01(xi + 1 + seed * 101, yi + 1 + seed * 131);
  const u = smooth(xf);
  const v = smooth(yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
}
/** 3-octave fBm (Farm uses 4; 3 is plenty at this scale). */
function fbm(x: number, y: number, seed: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
function heightAt(tx: number, ty: number, seed: number): number {
  return fbm(tx * HEIGHT_FREQ, ty * HEIGHT_FREQ, seed);
}
/** Continuous hillshade signal: Citadel's central-difference gradient under a fixed NW sun. */
function terrainShade(tx: number, ty: number, seed: number): number {
  const c = heightAt(tx, ty, seed);
  const gx = heightAt(tx + 1, ty, seed) - heightAt(tx - 1, ty, seed);
  const gy = heightAt(tx, ty + 1, seed) - heightAt(tx, ty - 1, seed);
  return -(gx + gy) * SLOPE_GAIN + (c - 0.5) * HEIGHT_GAIN;
}

function computeMapLayout(map: RunMap, viewW: number, viewH: number): MapLayout {
  const rowNumbers = [...new Set(map.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const colCount = rowNumbers.length;
  const colIndexOf = new Map(rowNumbers.map((r, i) => [r, i]));
  const bossRow = map.nodes.find((n) => n.id === map.bossId)?.row ?? rowNumbers[colCount - 1] ?? 0;

  const rowSizeOf = new Map<number, number>();
  for (const n of map.nodes) rowSizeOf.set(n.row, (rowSizeOf.get(n.row) ?? 0) + 1);

  const columnX = (i: number): number => MARGIN_X + i * COLUMN_SPACING;
  const worldW = Math.max(viewW, MARGIN_X * 2 + (colCount - 1) * COLUMN_SPACING);
  const worldH = viewH; // fits vertically ⇒ scroll is horizontal only
  const playTop = CHROME_TOP + 42;
  const playBottom = worldH - LEGEND_H - 22;

  const nodes = new Map<number, NodeRect>();
  for (const n of map.nodes) {
    const i = colIndexOf.get(n.row)!;
    const size = rowSizeOf.get(n.row)!;
    const isBoss = n.id === map.bossId;
    const cx = columnX(i);
    const t = size <= 1 ? 0.5 : (n.col + 0.5) / size;
    const cy = playTop + 30 + t * (playBottom - playTop - 60) + Math.sin(i * 0.9) * COL_WAVE;
    nodes.set(n.id, { cx, cy, w: isBoss ? BOSS_W : NODE_W, h: isBoss ? BOSS_H : NODE_H });
  }

  const bossColIndex = colIndexOf.get(bossRow) ?? colCount - 1;
  const colsPerZone = Math.max(1, Math.ceil((colCount - 1) / 3));
  const zoneOfCol = (i: number): number => (i >= bossColIndex ? 3 : Math.min(2, Math.floor(i / colsPerZone)));
  const bands: ZoneBand[] = [];
  for (const z of [...new Set(rowNumbers.map((_, i) => zoneOfCol(i)))].sort((a, b) => a - b)) {
    const cols = rowNumbers.map((_, i) => i).filter((i) => zoneOfCol(i) === z);
    const firstI = cols[0]!;
    const lastI = cols[cols.length - 1]!;
    const startX = firstI === 0 ? 0 : (columnX(firstI - 1) + columnX(firstI)) / 2;
    const endX = lastI >= colCount - 1 ? worldW : (columnX(lastI) + columnX(lastI + 1)) / 2;
    bands.push({ index: z, startX, endX });
  }

  const startRects = map.startIds.map((id) => nodes.get(id)!).filter(Boolean);
  const anchorCy = startRects.length > 0 ? startRects.reduce((s, r) => s + r.cy, 0) / startRects.length : (playTop + playBottom) / 2;
  return { nodes, zones: bands, worldW, worldH, playTop, playBottom, anchor: { cx: MARGIN_X - 46, cy: anchorCy } };
}

function currentNodeId(run: RunView): number | null {
  if (run.currentId !== null) return run.currentId;
  const v = run.visitedIds;
  return v.length > 0 ? v[v.length - 1]! : null;
}

/** Offset painter: world coords → screen, applying the camera. */
interface Painter {
  rect(x: number, y: number, w: number, h: number, color: string, alpha?: number): void;
  text(t: string, x: number, y: number, color: string, alpha?: number, scale?: number): void;
  ctext(t: string, cx: number, y: number, color: string, alpha?: number): void;
  visible(x: number, w: number): boolean;
}

function drawTriangle(P: Painter, cx: number, baseY: number, halfBase: number, height: number, color: string, alpha = 1): void {
  const rows = Math.max(3, Math.round(height / 3));
  const rh = height / rows;
  for (let i = 0; i < rows; i++) {
    const w = halfBase * 2 * (1 - i / rows);
    P.rect(cx - w / 2, baseY - (i + 1) * rh, Math.max(2, w), rh + 1, color, alpha);
  }
}

/** A flat shadow blob under an upright prop, offset SE (Citadel's fake-height cue). */
function drawGroundShadow(P: Painter, cx: number, baseY: number, halfW: number): void {
  P.rect(cx - halfW + SHADOW_OFF, baseY - 2, halfW * 2, 5, MATE_PAL.ink, 0.28);
  P.rect(cx - halfW * 0.7 + SHADOW_OFF, baseY, halfW * 1.4, 3, MATE_PAL.ink, 0.28);
}

// --- upright billboard props ---------------------------------------------------------------------
function drawPine(P: Painter, x: number, baseY: number, s: number): void {
  const th = ZONE_THEMES[0]!;
  drawGroundShadow(P, x, baseY, 8 * s);
  P.rect(x - 2 * s, baseY - 6 * s, 4 * s, 6 * s, MATE_PAL.woodDark, 1);
  drawTriangle(P, x, baseY - 4 * s, 9 * s, 12 * s, th.gDark, 1);
  drawTriangle(P, x, baseY - 10 * s, 7 * s, 10 * s, th.gBase, 1);
  drawTriangle(P, x, baseY - 16 * s, 5 * s, 8 * s, th.gLight, 1);
}
function drawFern(P: Painter, x: number, baseY: number, s: number): void {
  drawTriangle(P, x, baseY, 5 * s, 8 * s, MATE_PAL.greenMid, 1);
  drawTriangle(P, x - 3 * s, baseY, 3 * s, 5 * s, MATE_PAL.greenDark, 1);
  drawTriangle(P, x + 3 * s, baseY, 3 * s, 5 * s, MATE_PAL.greenDark, 1);
}
function drawMushroom(P: Painter, x: number, baseY: number, s: number): void {
  P.rect(x - 1 * s, baseY - 4 * s, 2 * s, 4 * s, MATE_PAL.cream, 1);
  P.rect(x - 3 * s, baseY - 6 * s, 6 * s, 3 * s, MATE_PAL.red, 1);
  P.rect(x - 1 * s, baseY - 5 * s, 1 * s, 1 * s, MATE_PAL.white, 1);
}
function drawCottage(P: Painter, x: number, baseY: number, s: number): void {
  const w = 22 * s;
  const h = 15 * s;
  drawGroundShadow(P, x, baseY, w / 2 + 2 * s);
  P.rect(x - w / 2, baseY - h, w, h, MATE_PAL.tan, 1);
  P.rect(x - w / 2, baseY - h + h * 0.6, w, h * 0.4, MATE_PAL.clay, 1); // shaded lower wall (depth)
  drawTriangle(P, x, baseY - h, w / 2 + 3 * s, 11 * s, MATE_PAL.rust, 1);
  P.rect(x - 3 * s, baseY - 8 * s, 6 * s, 8 * s, MATE_PAL.woodDark, 1); // door
  P.rect(x + 3 * s, baseY - h + 3 * s, 4 * s, 4 * s, MATE_PAL.gold, 1); // window
}
function drawWell(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 7 * s);
  P.rect(x - 6 * s, baseY - 7 * s, 12 * s, 7 * s, MATE_PAL.slate, 1);
  P.rect(x - 6 * s, baseY - 7 * s, 12 * s, 2 * s, MATE_PAL.steel, 1);
  P.rect(x - 3 * s, baseY - 5 * s, 6 * s, 3 * s, MATE_PAL.navy, 1);
  P.rect(x - 5 * s, baseY - 16 * s, 2 * s, 9 * s, MATE_PAL.woodDark, 1);
  P.rect(x + 3 * s, baseY - 16 * s, 2 * s, 9 * s, MATE_PAL.woodDark, 1);
  drawTriangle(P, x, baseY - 16 * s, 8 * s, 6 * s, MATE_PAL.rust, 1);
}
function drawFence(P: Painter, x: number, baseY: number, s: number): void {
  for (let i = 0; i < 4; i++) P.rect(x + i * 5 * s, baseY - 6 * s, 1.5 * s, 6 * s, MATE_PAL.wood, 1);
  P.rect(x, baseY - 5 * s, 15 * s, 1.5 * s, MATE_PAL.wood, 1);
}
function drawPeak(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 22 * s);
  drawTriangle(P, x + 4 * s, baseY, 22 * s, 44 * s, MATE_PAL.navy, 1); // back ridge (depth)
  drawTriangle(P, x, baseY, 24 * s, 46 * s, MATE_PAL.slate, 1);
  drawTriangle(P, x - 3 * s, baseY, 15 * s, 33 * s, MATE_PAL.steel, 1); // NW-lit face
  drawTriangle(P, x, baseY - 24 * s, 6 * s, 11 * s, MATE_PAL.white, 1); // snowcap
}
function drawRock(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 5 * s);
  P.rect(x - 4 * s, baseY - 5 * s, 8 * s, 5 * s, MATE_PAL.slate, 1);
  P.rect(x - 4 * s, baseY - 5 * s, 8 * s, 2 * s, MATE_PAL.steel, 1);
}
function drawDeadTree(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 4 * s);
  P.rect(x - 1.5 * s, baseY - 16 * s, 3 * s, 16 * s, MATE_PAL.black, 1);
  P.rect(x - 6 * s, baseY - 13 * s, 5 * s, 1.5 * s, MATE_PAL.black, 1);
  P.rect(x + 1 * s, baseY - 10 * s, 5 * s, 1.5 * s, MATE_PAL.black, 1);
}
function drawLair(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 26 * s);
  drawTriangle(P, x, baseY, 28 * s, 48 * s, MATE_PAL.bark, 1);
  drawTriangle(P, x, baseY, 19 * s, 32 * s, MATE_PAL.plum, 1);
  P.rect(x - 6 * s, baseY - 15 * s, 12 * s, 15 * s, MATE_PAL.black, 1);
  P.rect(x - 4 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
  P.rect(x + 1 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
}

/** A small flower: stem + a few petals in a deterministic palette accent. */
function drawFlower(P: Painter, x: number, baseY: number, seed: number): void {
  const c = FLOWER_COLORS[Math.floor(rand01(seed, 5) * FLOWER_COLORS.length)] ?? MATE_PAL.gold;
  P.rect(x, baseY - 5, 1, 5, MATE_PAL.greenMid, 1);
  P.rect(x - 2, baseY - 7, 2, 2, c, 1);
  P.rect(x + 1, baseY - 7, 2, 2, c, 1);
  P.rect(x - 1, baseY - 9, 2, 2, c, 1);
  P.rect(x - 1, baseY - 6, 2, 2, MATE_PAL.yellow, 1);
}

function zoneAtX(bands: readonly ZoneBand[], x: number): ZoneBand {
  for (const b of bands) if (x >= b.startX && x < b.endX) return b;
  return bands[bands.length - 1] ?? bands[0]!;
}

/** A precomputed opaque ground quad in WORLD space (built once, cached, replayed each frame). */
interface GroundQuad {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly c: string;
}

const SUB = TILE / 4; // 7px sub-cell for fine ordered dithering + floor detail

/** Sparse, zone-specific floor detail stamped into a tile (grass tufts, tilled rows, scree, embers…). */
function pushDetail(out: GroundQuad[], theme: ZoneTheme, seed: number, ix: number, iy: number, x: number, y: number, lit: boolean): void {
  const r = rand01(ix * 7 + seed, iy * 13);
  switch (theme.kind) {
    case "forest":
      if (r > 0.9) {
        out.push({ x: x + 8, y: y + 15, w: 1, h: 5, c: theme.gLight }, { x: x + 10, y: y + 16, w: 1, h: 4, c: theme.gLight }, { x: x + 9, y: y + 19, w: 3, h: 1, c: theme.gDark }); // grass tuft
      } else if (r < 0.05) {
        out.push({ x: x + 14, y: y + 14, w: 3, h: 2, c: MATE_PAL.red }, { x: x + 15, y: y + 16, w: 1, h: 2, c: MATE_PAL.cream }); // tiny mushroom
      } else if (r > 0.82 && r < 0.85) {
        out.push({ x: x + 18, y: y + 9, w: 2, h: 2, c: MATE_PAL.clay }); // fallen leaf
      }
      break;
    case "village":
      if (r > 0.9) {
        out.push({ x: x + 4, y: y + 10, w: 18, h: 2, c: MATE_PAL.clay }, { x: x + 4, y: y + 16, w: 18, h: 2, c: MATE_PAL.wood }); // tilled rows
      } else if (r < 0.06) {
        out.push({ x: x + 12, y: y + 12, w: 2, h: 2, c: MATE_PAL.woodDark }); // pebble
      } else if (r > 0.8 && r < 0.83) {
        out.push({ x: x + 6, y: y + 6, w: 1, h: 4, c: theme.gLight }); // stray grass
      }
      break;
    case "mountains":
      if (lit && r > 0.85) {
        out.push({ x: x + 6, y: y + 4, w: 5, h: 3, c: MATE_PAL.white }); // snow patch
      } else if (r > 0.9) {
        out.push({ x: x + 4, y: y + 18, w: 4, h: 3, c: MATE_PAL.silver }, { x: x + 9, y: y + 20, w: 3, h: 2, c: MATE_PAL.steel }); // scree
      } else if (r < 0.06) {
        out.push({ x: x + 16, y: y + 10, w: 3, h: 2, c: MATE_PAL.slate }); // rock chip
      }
      break;
    case "lair":
      if (r > 0.9) {
        out.push({ x: x + 8, y: y + 9, w: 3, h: 3, c: MATE_PAL.red }); // ember
      } else if (r < 0.06) {
        out.push({ x: x + 14, y: y + 16, w: 5, h: 1, c: MATE_PAL.black }); // crack
      }
      break;
  }
}

/**
 * Build the whole ground plane as opaque quads (WORLD space), once. Within a zone the base tone is
 * the NEAREST of [dark, base, light] (so broad regions stay a single solid colour), and the seam to
 * the next tone is smoothed by a fine 4×4 ordered dither of 7px sub-cells — a gradient made of solid
 * pixels, no hard checkerboard. Zone seams borrow the neighbour palette with a probabilistic dither.
 */
function buildGroundQuads(L: MapLayout): GroundQuad[] {
  const out: GroundQuad[] = [];
  const iy0 = Math.floor((CHROME_TOP - 2) / TILE);
  const iy1 = Math.ceil(L.worldH / TILE);
  const ix1 = Math.ceil(L.worldW / TILE);
  for (let ix = 0; ix <= ix1; ix++) {
    const x = ix * TILE;
    if (x > L.worldW) break;
    const cxT = x + TILE / 2;
    const band = zoneAtX(L.zones, cxT);
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = iy * TILE;
      // dithered ZONE seam: near a boundary, sometimes borrow the neighbour zone's palette
      let zi = band.index;
      const dStart = cxT - band.startX;
      const dEnd = band.endX - cxT;
      if (band.index > 0 && dStart < SEAM && rand01(ix, iy) < 0.5 * (1 - dStart / SEAM)) zi = band.index - 1;
      else if (band.index < ZONE_THEMES.length - 1 && dEnd < SEAM && rand01(ix, iy) < 0.5 * (1 - dEnd / SEAM)) zi = band.index + 1;
      const theme = ZONE_THEMES[zi]!;
      const seed = (zi + 1) * 1013;
      const ramp = [theme.gDark, theme.gBase, theme.gLight];
      const idxF = clamp(((terrainShade(ix, iy, seed) + TERRAIN_RANGE) / (2 * TERRAIN_RANGE)) * 2, 0, 2);
      const lvl = Math.round(idxF); // NEAREST tone ⇒ broad solid regions, not a per-tile checkerboard
      out.push({ x, y, w: TILE + 1, h: TILE + 1, c: ramp[lvl]! }); // +1 avoids hairline seams
      // smooth the tone boundary: ordered 4×4 dither of the neighbour tone across 7px sub-cells
      const frac = idxF - lvl; // −0.5..0.5 — how far toward the neighbour tone
      const nb = lvl + (frac > 0 ? 1 : -1);
      if (Math.abs(frac) > 0.1 && nb >= 0 && nb <= 2) {
        const neighbour = ramp[nb]!;
        const density = clamp((Math.abs(frac) - 0.1) / 0.4, 0, 1);
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            if ((BAYER4[sy]![sx]! + 0.5) / 16 < density) out.push({ x: x + sx * SUB, y: y + sy * SUB, w: SUB + 1, h: SUB + 1, c: neighbour });
          }
        }
      }
      pushDetail(out, theme, seed, ix, iy, x, y, lvl >= 2);
    }
  }
  return out;
}

// --- prop scatter --------------------------------------------------------------------------------
interface Prop {
  readonly x: number;
  readonly baseY: number;
  readonly kind: ZoneKind;
  readonly s: number;
}

/** Deterministic upright-prop scatter over the plane: one candidate per grid cell, jittered. */
function collectProps(L: MapLayout): Prop[] {
  const props: Prop[] = [];
  const top = L.playTop - 8;
  const bottom = L.playBottom + 18;
  for (let cy = top; cy < bottom; cy += PROP_CELL) {
    for (let cx = 0; cx < L.worldW; cx += PROP_CELL) {
      const ci = Math.round(cx);
      const cj = Math.round(cy);
      if (rand01(ci, cj) > PROP_DENSITY) continue;
      const px = cx + 12 + rand01(ci + 1, cj) * (PROP_CELL - 24);
      const py = cy + 12 + rand01(ci, cj + 1) * (PROP_CELL - 24);
      const band = zoneAtX(L.zones, px);
      const kind = ZONE_THEMES[band.index]!.kind;
      const s = 0.7 + rand01(Math.round(px), Math.round(py)) * 0.7;
      props.push({ x: px, baseY: py, kind, s });
    }
  }
  return props;
}

/** Draw `fn` with a 1px dark keyline (silhouette outline) so props pop against any terrain. */
function outlineDraw(P: Painter, fn: (p: Painter) => void): void {
  const stamp = (dx: number, dy: number): Painter => ({
    rect: (x, y, w, h) => P.rect(x + dx, y + dy, w, h, MATE_PAL.black, 0.9),
    text: () => {},
    ctext: () => {},
    visible: (x, w) => P.visible(x, w),
  });
  const offsets: readonly (readonly [number, number])[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [dx, dy] of offsets) fn(stamp(dx, dy));
  fn(P);
}

function drawProp(P: Painter, pr: Prop): void {
  const { x, baseY: y, kind, s } = pr;
  const r = rand01(Math.round(x) * 3, Math.round(y) * 3);
  switch (kind) {
    case "forest":
      if (r < 0.15) drawMushroom(P, x, y, 0.9 + s * 0.4);
      else if (r < 0.32) drawFern(P, x, y, 0.8 + s * 0.5);
      else drawPine(P, x, y, 1 + s * 0.6);
      break;
    case "village":
      if (r < 0.28) drawCottage(P, x, y, 0.9 + s * 0.4);
      else if (r < 0.5) drawFence(P, x, y, 0.9 + s * 0.3);
      else if (r < 0.64) drawWell(P, x, y, 0.9 + s * 0.3);
      else drawPine(P, x, y, 0.9 + s * 0.4);
      break;
    case "mountains":
      if (r < 0.45) drawRock(P, x, y, 0.9 + s * 0.6);
      else drawPeak(P, x, y, 0.8 + s * 0.6);
      break;
    case "lair":
      if (r < 0.15) drawLair(P, x, y, 1 + s * 0.3);
      else drawDeadTree(P, x, y, 0.9 + s * 0.5);
      break;
  }
}

// --- road (continuous footpath, styled per zone) -------------------------------------------------
// Each zone paves its trail differently: forest dirt track, village cobbles, mountain wooden
// boardwalk (planks + rails), lair obsidian with ember cracks. Style is chosen PER STAMP from the
// zone the stamp sits in, so a trail crossing a seam changes surface mid-way.
const COBBLE_STONES: readonly string[] = [MATE_PAL.slate, MATE_PAL.steel, MATE_PAL.silver];

function stampDirt(P: Painter, x: number, y: number, w: number, i: number, seed: number): void {
  P.rect(x - w / 2, y - w / 2, w, w, MATE_PAL.clay, 1);
  if (i % 2 === 0) P.rect(x - 1.5, y - 1.5, 3, 3, MATE_PAL.tan, 0.85); // trodden dust
  if (i % 6 === 3 && rand01(seed, i) > 0.6) P.rect(x + (rand01(i, seed) - 0.5) * w, y + (rand01(seed, i * 3) - 0.5) * w, 2, 2, MATE_PAL.woodDark, 0.6);
}
function stampCobble(P: Painter, x: number, y: number, w: number, i: number, seed: number): void {
  P.rect(x - w / 2, y - w / 2, w, w, MATE_PAL.woodDark, 1); // dark mortar
  const stone = COBBLE_STONES[Math.floor(rand01(seed + i, i * 3) * COBBLE_STONES.length)] ?? MATE_PAL.slate;
  const jx = (rand01(i, seed) - 0.5) * (w * 0.4);
  const jy = (rand01(seed, i) - 0.5) * (w * 0.4);
  P.rect(x + jx - 2.5, y + jy - 2.5, 5, 5, stone, 1); // a rounded cobble
}
function stampPlank(P: Painter, x: number, y: number, w: number, nx: number, ny: number, i: number): void {
  P.rect(x - w / 2, y - w / 2, w, w, MATE_PAL.wood, 1); // plank fill
  if (i % 4 === 0) P.rect(x - w * 0.4, y - w * 0.4, w * 0.8, w * 0.8, MATE_PAL.woodDark, 0.55); // cross-seam
  // side rails (a continuous dark edge run down both verges → a boardwalk/bridge)
  P.rect(x + nx * (w / 2) - 1.5, y + ny * (w / 2) - 1.5, 3, 3, MATE_PAL.woodDark, 1);
  P.rect(x - nx * (w / 2) - 1.5, y - ny * (w / 2) - 1.5, 3, 3, MATE_PAL.woodDark, 1);
}
function stampObsidian(P: Painter, x: number, y: number, w: number, i: number, seed: number): void {
  P.rect(x - w / 2, y - w / 2, w, w, MATE_PAL.bark, 1);
  P.rect(x - 2, y - 2, 4, 4, MATE_PAL.black, 1); // dark stone
  if (rand01(seed + 7, i) > 0.7) P.rect(x + (rand01(i, seed) - 0.5) * w, y + (rand01(seed, i) - 0.5) * w, 2, 2, MATE_PAL.red, 0.9); // ember crack
}

function drawRoad(P: Painter, from: { cx: number; cy: number }, to: { cx: number; cy: number }, bright: boolean, seed: number, zones: readonly ZoneBand[]): void {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dist = Math.hypot(dx, dy) || 1;
  if (!P.visible(Math.min(from.cx, to.cx) - ROAD_CORE, Math.abs(dx) + ROAD_CORE * 2)) return;
  const steps = Math.max(6, Math.round(dist / ROAD_STEP));
  const nx = -dy / dist;
  const ny = dx / dist; // unit perpendicular
  const rim = bright ? MATE_PAL.gold : MATE_PAL.woodDark;
  const rimA = bright ? 0.6 : 0.5;
  // Pass 1: the dark (or gold, when reachable) rim under everything.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    const w = ROAD_CORE + (rand01(seed, i >> 1) - 0.5) * 2.5 + 3;
    P.rect(x + SHADOW_OFF - w / 2, y + SHADOW_OFF - w / 2, w, w, rim, rimA);
  }
  // Pass 2: the zone-specific paving surface + reachable-route markers + verge dressing.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    const w = ROAD_CORE + (rand01(seed, i >> 1) - 0.5) * 2.5;
    const kind = ZONE_THEMES[zoneAtX(zones, x).index]!.kind;
    switch (kind) {
      case "forest":
        stampDirt(P, x, y, w, i, seed);
        break;
      case "village":
        stampCobble(P, x, y, w, i, seed);
        break;
      case "mountains":
        stampPlank(P, x, y, w, nx, ny, i);
        break;
      case "lair":
        stampObsidian(P, x, y, w, i, seed);
        break;
    }
    if (bright && i % 4 === 0) P.rect(x - 1.5, y - 1.5, 3, 3, MATE_PAL.gold, 0.95); // reachable-route marker
    // grassy verge flowers only alongside the soft-ground zones
    if ((kind === "forest" || kind === "village") && i % 11 === 5 && rand01(seed + 5, i) > 0.5) {
      const off = w / 2 + 7 + rand01(seed + 2, i) * 4;
      drawFlower(P, x + nx * off, y + ny * off, seed * 7 + i);
    }
  }
}

type NodeState = "reachable" | "visited" | "locked";

function drawNode(P: Painter, rect: NodeRect, node: MapNode, state: NodeState, hovered: boolean): void {
  const { cx, cy, w, h } = rect;
  if (!P.visible(cx - w, w * 2)) return;
  const x = cx - w / 2;
  const y = cy - h / 2;
  // signpost + drop shadow (raised off the map — Citadel's fake-height trick)
  P.rect(cx - 3, cy, 6, h / 2 + 10, MATE_PAL.woodDark, 1);
  P.rect(x + SHADOW_OFF, y + SHADOW_OFF, w, h, MATE_PAL.ink, 0.32);
  P.rect(x - NODE_BORDER - 1, y - NODE_BORDER - 1, w + NODE_BORDER * 2 + 2, h + NODE_BORDER * 2 + 2, MATE_PAL.black, 0.9); // dark keyline
  const border = state === "reachable" ? (hovered ? MATE_PAL.yellow : MATE_PAL.gold) : state === "visited" ? MATE_PAL.steel : MATE_PAL.navy;
  P.rect(x - NODE_BORDER, y - NODE_BORDER, w + NODE_BORDER * 2, h + NODE_BORDER * 2, border, 1);
  // SOLID fill (always opaque — never see-through). State darkens over the opaque base.
  P.rect(x, y, w, h, NODE_TYPE_COLOR[node.type], 1);
  if (state === "visited") P.rect(x, y, w, h, MATE_PAL.ink, 0.45);
  else if (state === "locked") P.rect(x, y, w, h, MATE_PAL.ink, 0.6);
  if (state !== "locked") P.rect(x + 2, y + 2, w - 4, 3, MATE_PAL.white, 0.35); // top highlight
  const textColor = state === "locked" ? MATE_PAL.steel : MATE_PAL.white;
  P.ctext((state === "visited" ? STRINGS.visitedPrefix : "") + NODE_GLYPH[node.type], cx, cy - 10, textColor, 1);
  if (node.type !== "rest") P.ctext(STRINGS.gradeLabel[node.grade], cx, cy + 2, state === "locked" ? MATE_PAL.slate : MATE_PAL.cream, 1);
}

function drawHero(P: Painter, cx: number, cyNode: number, h: number): void {
  const feetY = cyNode - h / 2 - 4;
  P.rect(cx - 6, feetY - 3, 12, 3, MATE_PAL.black, 0.3);
  P.rect(cx - 5, feetY - 4, 10, 4, MATE_PAL.woodDark, 1);
  P.rect(cx - 5, feetY - 12, 10, 8, MATE_PAL.red, 1);
  P.rect(cx - 3, feetY - 17, 6, 6, MATE_PAL.skin, 1);
  P.rect(cx - 4, feetY - 19, 8, 3, MATE_PAL.gold, 1);
  P.rect(cx + 5, feetY - 14, 3, 12, MATE_PAL.silver, 1);
}

function drawZoneBanner(P: Painter, band: ZoneBand): void {
  const name = STRINGS.zoneName[band.index] ?? "";
  if (name.length === 0) return;
  const cx = (band.startX + band.endX) / 2;
  const tw = measureText(name);
  const bw = tw + 22;
  if (!P.visible(cx - bw / 2, bw)) return;
  P.rect(cx - bw / 2, CHROME_TOP + 2, bw, 18, MATE_PAL.ink, 1);
  P.rect(cx - bw / 2, CHROME_TOP + 2, bw, 2, MATE_PAL.gold, 1);
  P.ctext(name, cx, CHROME_TOP + 5, MATE_PAL.cream, 1);
}

export interface MapScreen {
  render(surface: UISurface, run: RunView, hoverId: number | null, viewW: number, viewH: number): void;
  /** Screen-px → node id (accounts for the camera). */
  nodeAtScreen(sx: number, sy: number): number | null;
  /** Pan the camera by a screen-px delta (clamped to the world). */
  panBy(dx: number, dy: number): void;
  reachableOrder(run: RunView): number[];
}

export function createMapScreen(): MapScreen {
  let layout: ReadonlyMap<number, NodeRect> = new Map();
  let camX = 0;
  let camY = 0;
  let worldW = 0;
  let worldH = 0;
  let viewW = 0;
  let viewH = 0;
  let lastCurrent: number | null | undefined = undefined;
  // Cached ground plane — the noise/dither is expensive, so build it once per (map, worldW, worldH)
  // and just replay the opaque quads (with camera offset + horizontal cull) every frame.
  let groundQuads: readonly GroundQuad[] = [];
  let groundKey = "";

  function clampCam(): void {
    camX = clamp(camX, 0, Math.max(0, worldW - viewW));
    camY = clamp(camY, 0, Math.max(0, worldH - viewH));
  }

  function render(surface: UISurface, run: RunView, hoverId: number | null, vw: number, vh: number): void {
    viewW = vw;
    viewH = vh;
    const L = computeMapLayout(run.map, vw, vh);
    layout = L.nodes;
    worldW = L.worldW;
    worldH = L.worldH;

    const current = currentNodeId(run);
    if (current !== lastCurrent) {
      const focus = current !== null ? L.nodes.get(current) : undefined;
      const fx = focus?.cx ?? L.anchor.cx;
      camX = fx - viewW / 2;
      lastCurrent = current;
    }
    clampCam();

    const ox = -camX;
    const oy = -camY;
    const P: Painter = {
      rect: (x, y, w, h, color, alpha = 1) => surface.rect(x + ox, y + oy, w, h, color, alpha),
      text: (t, x, y, color, alpha = 1, scale = 1) => {
        drawText(surface, t, x + ox, y + oy, { color, alpha, scale });
      },
      ctext: (t, cx, y, color, alpha = 1) => {
        if (t.length > 0) drawText(surface, t, cx - measureText(t) / 2 + ox, y + oy, { color, alpha });
      },
      visible: (x, w) => x + w >= camX - CULL_PAD && x <= camX + viewW + CULL_PAD,
    };

    // WORLD: ground (cached) → props (depth-sorted) → footpaths → nodes → hero → zone banners
    const key = `${L.worldW}x${L.worldH}:${L.zones.map((z) => `${z.index}@${Math.round(z.startX)}`).join(",")}`;
    if (key !== groundKey) {
      groundQuads = buildGroundQuads(L);
      groundKey = key;
    }
    for (const q of groundQuads) if (P.visible(q.x, q.w)) P.rect(q.x, q.y, q.w, q.h, q.c, 1);

    const props = collectProps(L)
      .filter((pr) => P.visible(pr.x - 30, 60))
      .sort((a, b) => a.baseY - b.baseY); // painter's order: farther (up) first
    for (const pr of props) outlineDraw(P, (pp) => drawProp(pp, pr));

    for (const node of run.map.nodes) {
      const from = L.nodes.get(node.id);
      if (from === undefined) continue;
      for (const targetId of node.next) {
        const to = L.nodes.get(targetId);
        if (to !== undefined) drawRoad(P, from, to, node.id === current, node.id * 131 + targetId, L.zones);
      }
    }
    if (current === null) for (const id of run.map.startIds) {
      const to = L.nodes.get(id);
      if (to !== undefined) drawRoad(P, L.anchor, to, true, id * 131, L.zones);
    }

    const reachable = new Set(run.reachableIds);
    const visited = new Set(run.visitedIds);
    for (const node of run.map.nodes) {
      const rect = L.nodes.get(node.id);
      if (rect === undefined) continue;
      const state: NodeState = visited.has(node.id) ? "visited" : reachable.has(node.id) ? "reachable" : "locked";
      drawNode(P, rect, node, state, hoverId === node.id);
    }
    if (current !== null) {
      const rect = L.nodes.get(current);
      if (rect !== undefined) outlineDraw(P, (pp) => drawHero(pp, rect.cx, rect.cy, rect.h));
    } else {
      outlineDraw(P, (pp) => drawHero(pp, L.anchor.cx, L.anchor.cy, 0));
    }
    for (const band of L.zones) drawZoneBanner(P, band);

    // HUD (fixed screen space) — title, HP, legend, scroll hints.
    drawChrome(surface, run, viewW);
    drawLegendAt(surface, viewW, viewH);
    drawScrollHints(surface);
  }

  function drawScrollHints(surface: UISurface): void {
    if (camX > 2) drawText(surface, "‹", 8, viewH / 2 - 8, { color: MATE_PAL.gold, scale: 2 });
    if (camX < worldW - viewW - 2) drawText(surface, "›", viewW - 22, viewH / 2 - 8, { color: MATE_PAL.gold, scale: 2 });
  }

  function nodeAtScreen(sx: number, sy: number): number | null {
    const wx = sx + camX;
    const wy = sy + camY;
    for (const [id, r] of layout) {
      if (wx >= r.cx - r.w / 2 && wx <= r.cx + r.w / 2 && wy >= r.cy - r.h / 2 && wy <= r.cy + r.h / 2) return id;
    }
    return null;
  }

  function panBy(dx: number, dy: number): void {
    camX += dx;
    camY += dy;
    clampCam();
  }

  function reachableOrder(run: RunView): number[] {
    const byId = new Map(run.map.nodes.map((n) => [n.id, n] as const));
    return [...run.reachableIds].sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      if (na.row !== nb.row) return na.row - nb.row;
      return na.col - nb.col;
    });
  }

  return { render, nodeAtScreen, panBy, reachableOrder };
}

function drawChrome(surface: UISurface, run: RunView, viewW: number): void {
  surface.rect(0, 0, viewW, CHROME_TOP, MATE_PAL.ink, 1); // solid top HUD strip
  surface.rect(0, CHROME_TOP, viewW, 2, MATE_PAL.gold, 1);
  drawText(surface, STRINGS.mapTitle, 24, 8, { color: MATE_PAL.gold, scale: 2 });
  drawText(surface, STRINGS.warriorHpLabel, 24, HP_BAR_Y + 6, { color: MATE_PAL.cream });
  surface.rect(HP_BAR_X, HP_BAR_Y + 6, HP_BAR_W, HP_BAR_H, MATE_PAL.navy);
  const pct = run.warriorMaxHp > 0 ? clamp(run.warriorHp / run.warriorMaxHp, 0, 1) : 0;
  const fillW = Math.round(HP_BAR_W * pct);
  if (fillW > 0) surface.rect(HP_BAR_X, HP_BAR_Y + 6, fillW, HP_BAR_H, MATE_PAL.green);
  drawText(surface, `${run.warriorHp}/${run.warriorMaxHp}`, HP_BAR_X + HP_BAR_W + 10, HP_BAR_Y + 6, { color: MATE_PAL.cream });
}

function drawLegendAt(surface: UISurface, viewW: number, viewH: number): void {
  const stripY = viewH - LEGEND_H;
  surface.rect(0, stripY, viewW, LEGEND_H, MATE_PAL.ink, 1); // solid bottom HUD strip
  surface.rect(0, stripY, viewW, 2, MATE_PAL.gold, 1);
  const y = stripY + 8;
  let x = 24;
  drawText(surface, STRINGS.legendTitle, x, y, { color: MATE_PAL.steel });
  x += measureText(STRINGS.legendTitle) + 12;
  for (const type of LEGEND_ORDER) {
    const text = `${NODE_GLYPH[type]} ${STRINGS.legendLabel[type]}`;
    drawText(surface, text, x, y, { color: NODE_TYPE_COLOR[type] });
    x += measureText(text) + 16;
  }
}
