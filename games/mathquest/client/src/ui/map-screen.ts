/**
 * MateQuest — the spatial folklore-JOURNEY map (2026-07-22 designer pass v3): a HORIZONTAL trail
 * through four themed zones (Pădurea Adâncă → Satul → Munții Carpați → Bârlogul Zmeului),
 * **full-viewport** with a **pan/scroll camera** (the world is wider than the screen).
 *
 * ## v3 look — SOLID colours + faked depth (Farm + Citadel techniques, rect-only)
 * The engine's two other games bake terrain into a static Canvas2D layer and decorate it with
 * `ctx` primitives + blend modes; we only have axis-aligned `UISurface.rect`, so we adapt the
 * *ideas* to opaque quads (no washed-out alpha gradients any more — the user asked for solid
 * colours):
 *  - **Ground is a grid of opaque tiles** (Farm's per-tile ground-noise loop), each tile's shade
 *    picked by a **hillshade band** over a domain-free fBm height field (Citadel's dark/base/light
 *    banding) — so flat solid colours still read as rolling relief.
 *  - Each zone has a **distinct opaque palette** (deep-green woods → bright farmland → grey alps →
 *    volcanic lair) plus **zone-specific ground flecks** (tilled earth / snow / embers) and its own
 *    scenery mix, for a unique peisage.
 *  - **Depth** comes from: a distant **ridge silhouette** at each horizon (parallax layer), a solid
 *    horizon rim-light, and **SE drop-shadow skirts** under nodes/scenery (Citadel's building-shadow
 *    trick), not from transparency.
 *  - The trail is a **continuous footpath** — many small overlapping dirt stamps with an organic
 *    wobbling width and a trodden dust centreline — not a chain of big concatenated squares.
 * All colours are Resurrect-64 `MATE_PAL` roles (no raw hex, no WebGPU/shaders — Canvas2D runs on
 * any device, per the user directive).
 *
 * ## Camera / coordinates
 * The map is laid out in WORLD space (`worldW × worldH`); `worldW` exceeds the viewport so the
 * player scrolls horizontally. The camera (`camX,camY`, clamped) is owned here.
 * `render(surface, run, hoverId, viewW, viewH)` takes the live viewport size (canvas CSS px). WORLD
 * elements draw through an offset painter (`-camX,-camY`); HUD chrome is fixed SCREEN space. The
 * camera auto-centers on the hero on any advance, then the player pans freely (drag/wheel/arrows).
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
const CHROME_TOP = 64; // reserved screen band for title + HP
const LEGEND_H = 30; // reserved screen band for the legend
const CULL_PAD = 80; // draw margin around the viewport (perf)

const NODE_W = 50;
const NODE_H = 38;
const BOSS_W = 66;
const BOSS_H = 50;
const NODE_BORDER = 3;
const COL_WAVE = 30;

const TILE = 28; // ground-tile size (Farm bakes 16px; we redraw per frame so go coarser for perf)
const HEIGHT_FREQ = 0.16; // fBm sample frequency over tile coords
const SLOPE_GAIN = 1.4; // hillshade slope weight (Citadel uses 1.3)
const HEIGHT_GAIN = 0.55; // hypsometric weight
const SHADE_THRESHOLD = 0.055; // dark/base/light band cutoff
const SHADOW_OFF = 3; // SE drop-shadow offset (Citadel's fake-height trick)

const ROAD_CORE = 9; // footpath width
const ROAD_STEP = 3; // fine stamp spacing → overlapping stamps read as a continuous trail

const HP_BAR_X = 250;
const HP_BAR_Y = 30;
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
  readonly sky: string; // solid sky fill
  readonly ridge: string; // distant hill silhouette (parallax depth)
  readonly gBase: string; // ground base shade (flat cells)
  readonly gDark: string; // ground shadow band (SE-facing slope)
  readonly gLight: string; // ground lit band (NW-facing slope)
  readonly fleck: string; // zone-signature ground fleck (tilled earth / snow / ember …)
}
const ZONE_THEMES: readonly ZoneTheme[] = [
  // forest — cool deep woods
  { kind: "forest", sky: MATE_PAL.skyBlue, ridge: MATE_PAL.greenDark, gBase: MATE_PAL.greenMid, gDark: MATE_PAL.greenDark, gLight: MATE_PAL.green, fleck: MATE_PAL.teal },
  // village — bright open farmland
  { kind: "village", sky: MATE_PAL.cyan, ridge: MATE_PAL.greenDark, gBase: MATE_PAL.green, gDark: MATE_PAL.greenMid, gLight: MATE_PAL.green, fleck: MATE_PAL.clay },
  // mountains — grey alpine
  { kind: "mountains", sky: MATE_PAL.steel, ridge: MATE_PAL.navy, gBase: MATE_PAL.slate, gDark: MATE_PAL.navy, gLight: MATE_PAL.steel, fleck: MATE_PAL.white },
  // lair — volcanic dark
  { kind: "lair", sky: MATE_PAL.plum, ridge: MATE_PAL.black, gBase: MATE_PAL.bark, gDark: MATE_PAL.black, gLight: MATE_PAL.plum, fleck: MATE_PAL.red },
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
  readonly horizon: number;
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
/** Citadel's hillshade: central-difference gradient under a fixed NW sun → dark(-1)/base(0)/light(1). */
function shadeBand(tx: number, ty: number, seed: number): -1 | 0 | 1 {
  const c = heightAt(tx, ty, seed);
  const gx = heightAt(tx + 1, ty, seed) - heightAt(tx - 1, ty, seed);
  const gy = heightAt(tx, ty + 1, seed) - heightAt(tx, ty - 1, seed);
  const shade = -(gx + gy) * SLOPE_GAIN + (c - 0.5) * HEIGHT_GAIN;
  if (shade < -SHADE_THRESHOLD) return -1;
  if (shade > SHADE_THRESHOLD) return 1;
  return 0;
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
  const playTop = CHROME_TOP + 46;
  const playBottom = worldH - LEGEND_H - 24;
  const horizon = playTop + (playBottom - playTop) * 0.5;

  const nodes = new Map<number, NodeRect>();
  for (const n of map.nodes) {
    const i = colIndexOf.get(n.row)!;
    const size = rowSizeOf.get(n.row)!;
    const isBoss = n.id === map.bossId;
    const cx = columnX(i);
    const t = size <= 1 ? 0.5 : (n.col + 0.5) / size;
    const cy = playTop + 34 + t * (playBottom - playTop - 60) + Math.sin(i * 0.9) * COL_WAVE;
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
  const anchorCy = startRects.length > 0 ? startRects.reduce((s, r) => s + r.cy, 0) / startRects.length : horizon;
  return { nodes, zones: bands, worldW, worldH, horizon, playTop, playBottom, anchor: { cx: MARGIN_X - 46, cy: anchorCy } };
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

/** Soft ground shadow under a scenery object (Citadel's SE-offset height cue). */
function drawGroundShadow(P: Painter, cx: number, baseY: number, halfW: number): void {
  P.rect(cx - halfW + SHADOW_OFF, baseY - 2, halfW * 2, 4, MATE_PAL.ink, 0.28);
}

// --- scenery -------------------------------------------------------------------------------------
function drawPine(P: Painter, x: number, baseY: number, s: number, theme: ZoneTheme): void {
  drawGroundShadow(P, x, baseY, 8 * s);
  P.rect(x - 2 * s, baseY - 6 * s, 4 * s, 6 * s, MATE_PAL.woodDark, 1);
  drawTriangle(P, x, baseY - 5 * s, 9 * s, 12 * s, theme.gDark, 1);
  drawTriangle(P, x, baseY - 11 * s, 7 * s, 10 * s, theme.gBase, 1);
  drawTriangle(P, x, baseY - 17 * s, 5 * s, 8 * s, theme.gLight, 1);
}
function drawFern(P: Painter, x: number, baseY: number, s: number): void {
  drawTriangle(P, x, baseY, 5 * s, 8 * s, MATE_PAL.greenMid, 1);
  drawTriangle(P, x - 3 * s, baseY, 3 * s, 5 * s, MATE_PAL.greenDark, 1);
  drawTriangle(P, x + 3 * s, baseY, 3 * s, 5 * s, MATE_PAL.greenDark, 1);
}
function drawMushroom(P: Painter, x: number, baseY: number, s: number): void {
  P.rect(x - 1 * s, baseY - 4 * s, 2 * s, 4 * s, MATE_PAL.cream, 1); // stalk
  P.rect(x - 3 * s, baseY - 6 * s, 6 * s, 3 * s, MATE_PAL.red, 1); // cap
  P.rect(x - 1 * s, baseY - 5 * s, 1 * s, 1 * s, MATE_PAL.white, 1); // spot
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
  P.rect(x - 6 * s, baseY - 7 * s, 12 * s, 2 * s, MATE_PAL.steel, 1); // rim lip (top light)
  P.rect(x - 3 * s, baseY - 5 * s, 6 * s, 3 * s, MATE_PAL.navy, 1); // water shadow
  P.rect(x - 5 * s, baseY - 16 * s, 2 * s, 9 * s, MATE_PAL.woodDark, 1); // posts
  P.rect(x + 3 * s, baseY - 16 * s, 2 * s, 9 * s, MATE_PAL.woodDark, 1);
  drawTriangle(P, x, baseY - 16 * s, 8 * s, 6 * s, MATE_PAL.rust, 1); // little roof
}
function drawFence(P: Painter, x: number, baseY: number, s: number): void {
  for (let i = 0; i < 4; i++) P.rect(x + i * 5 * s, baseY - 6 * s, 1.5 * s, 6 * s, MATE_PAL.wood, 1);
  P.rect(x, baseY - 5 * s, 15 * s, 1.5 * s, MATE_PAL.wood, 1); // rail
}
function drawPeak(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 22 * s);
  drawTriangle(P, x + 4 * s, baseY, 22 * s, 44 * s, MATE_PAL.navy, 1); // back ridge (depth)
  drawTriangle(P, x, baseY, 24 * s, 46 * s, MATE_PAL.slate, 1);
  drawTriangle(P, x - 3 * s, baseY, 15 * s, 33 * s, MATE_PAL.steel, 1); // NW-lit face
  drawTriangle(P, x, baseY - 24 * s, 6 * s, 11 * s, MATE_PAL.white, 1); // snowcap
}
function drawRock(P: Painter, x: number, baseY: number, s: number): void {
  P.rect(x - 4 * s, baseY - 5 * s, 8 * s, 5 * s, MATE_PAL.slate, 1);
  P.rect(x - 4 * s, baseY - 5 * s, 8 * s, 2 * s, MATE_PAL.steel, 1); // top light
}
function drawDeadTree(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 4 * s);
  P.rect(x - 1.5 * s, baseY - 16 * s, 3 * s, 16 * s, MATE_PAL.black, 1);
  P.rect(x - 6 * s, baseY - 13 * s, 5 * s, 1.5 * s, MATE_PAL.black, 1); // bare branches
  P.rect(x + 1 * s, baseY - 10 * s, 5 * s, 1.5 * s, MATE_PAL.black, 1);
}
function drawLair(P: Painter, x: number, baseY: number, s: number): void {
  drawGroundShadow(P, x, baseY, 26 * s);
  drawTriangle(P, x, baseY, 28 * s, 48 * s, MATE_PAL.bark, 1);
  drawTriangle(P, x, baseY, 19 * s, 32 * s, MATE_PAL.plum, 1); // NW face
  P.rect(x - 6 * s, baseY - 15 * s, 12 * s, 15 * s, MATE_PAL.black, 1); // maw
  P.rect(x - 4 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1); // eyes
  P.rect(x + 1 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
}

/** A small flower: stem + a few petals in a deterministic palette accent. */
function drawFlower(P: Painter, x: number, baseY: number, seed: number): void {
  const c = FLOWER_COLORS[Math.floor(rand01(seed, 5) * FLOWER_COLORS.length)] ?? MATE_PAL.gold;
  P.rect(x, baseY - 5, 1, 5, MATE_PAL.greenMid, 1); // stem
  P.rect(x - 2, baseY - 7, 2, 2, c, 1);
  P.rect(x + 1, baseY - 7, 2, 2, c, 1);
  P.rect(x - 1, baseY - 9, 2, 2, c, 1);
  P.rect(x - 1, baseY - 6, 2, 2, MATE_PAL.yellow, 1); // center
}

function zoneAtX(bands: readonly ZoneBand[], x: number): ZoneBand {
  for (const b of bands) if (x >= b.startX && x < b.endX) return b;
  return bands[bands.length - 1] ?? bands[0]!;
}

/** Solid sky + a distant ridge silhouette (parallax depth) + a rim-light along the horizon. */
function drawSky(P: Painter, band: ZoneBand, L: MapLayout): void {
  const theme = ZONE_THEMES[band.index]!;
  const w = band.endX - band.startX;
  if (!P.visible(band.startX, w)) return;
  const skyTop = CHROME_TOP - 4;
  P.rect(band.startX, skyTop, w, L.horizon - skyTop, theme.sky, 1); // solid sky
  // distant hills — a row of low triangles just under the horizon (a far, static parallax layer)
  const step = 46;
  for (let x = band.startX; x < band.endX; x += step) {
    if (!P.visible(x - step, step * 2)) continue;
    const hgt = 14 + rand01(band.index * 71 + Math.round(x / step), 3) * 20;
    drawTriangle(P, x + step / 2, L.horizon, step * 0.7, hgt, theme.ridge, 1);
  }
  P.rect(band.startX, L.horizon - 2, w, 3, theme.gLight, 1); // sunlit horizon rim
}

/** The ground: a grid of OPAQUE tiles, each shaded by a hillshade band (solid dark/base/light). */
function drawGroundTiles(P: GroundPainter, L: MapLayout): void {
  const top = L.horizon;
  const bottom = L.worldH;
  const ix0 = Math.floor(Math.max(0, P.visibleLeft()) / TILE);
  const ix1 = Math.ceil(P.visibleRight() / TILE);
  const iy0 = Math.floor(top / TILE);
  const iy1 = Math.ceil(bottom / TILE);
  for (let ix = ix0; ix <= ix1; ix++) {
    const x = ix * TILE;
    if (x > L.worldW) break;
    const band = zoneAtX(L.zones, x + TILE / 2);
    const theme = ZONE_THEMES[band.index]!;
    const seed = (band.index + 1) * 1013;
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = iy * TILE;
      const b = shadeBand(ix, iy, seed);
      const base = b < 0 ? theme.gDark : b > 0 ? theme.gLight : theme.gBase;
      P.rect(x, y, TILE + 1, TILE + 1, base, 1); // +1 avoids hairline seams
      // zone-signature flecks + grain (Farm's hash-scattered specks, but opaque)
      const r = rand01(ix * 7 + seed, iy * 13);
      if (theme.kind === "village" && r > 0.9) {
        P.rect(x + 4, y + 5, 7, 4, theme.fleck, 1); // tilled-earth patch
      } else if (theme.kind === "mountains" && b > 0 && r > 0.86) {
        P.rect(x + 6, y + 4, 5, 3, theme.fleck, 1); // snow on lit slope
      } else if (theme.kind === "mountains" && r > 0.94) {
        P.rect(x + 3, y + TILE - 8, 6, 4, MATE_PAL.steel, 1); // scree
      } else if (theme.kind === "lair" && r > 0.9) {
        P.rect(x + 8, y + 9, 3, 3, theme.fleck, 1); // ember
      } else if (theme.kind === "forest" && r > 0.92) {
        P.rect(x + 5, y + 6, 4, 4, theme.gDark, 1); // underbrush clump
      }
      if (r > 0.5 && r < 0.55) P.rect(x + 3, y + 3, 3, 3, theme.gDark, 1); // dark grain
      else if (r > 0.72 && r < 0.77) P.rect(x + TILE - 7, y + 5, 3, 3, theme.gLight, 1); // light grain
    }
  }
}

// --- road (continuous footpath) ------------------------------------------------------------------
function drawRoad(P: Painter, from: { cx: number; cy: number }, to: { cx: number; cy: number }, bright: boolean, seed: number): void {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dist = Math.hypot(dx, dy) || 1;
  if (!P.visible(Math.min(from.cx, to.cx) - ROAD_CORE, Math.abs(dx) + ROAD_CORE * 2)) return;
  const steps = Math.max(6, Math.round(dist / ROAD_STEP));
  const nx = -dy / dist;
  const ny = dx / dist; // unit perpendicular (for verge scatter)
  const edge = MATE_PAL.woodDark;
  const fill = bright ? MATE_PAL.gold : MATE_PAL.clay;
  const dust = bright ? MATE_PAL.yellow : MATE_PAL.tan;
  const edgeA = bright ? 0.7 : 0.55;
  // Pass 1: the trodden dark rim (draw all rims first so overlap doesn't muddy the dirt fill).
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    const w = ROAD_CORE + (rand01(seed, i >> 1) - 0.5) * 2.5 + 3; // organic width wobble
    P.rect(x + SHADOW_OFF - w / 2, y + SHADOW_OFF - w / 2, w, w, edge, edgeA);
  }
  // Pass 2: dirt fill + trodden dust centreline + verge pebbles/flowers.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    const w = ROAD_CORE + (rand01(seed, i >> 1) - 0.5) * 2.5;
    P.rect(x - w / 2, y - w / 2, w, w, fill, 1);
    if (i % 2 === 0) P.rect(x - 1.5, y - 1.5, 3, 3, dust, 0.85); // worn dust down the middle
    if (i % 7 === 0 && rand01(seed + 3, i) > 0.55) {
      const off = w / 2 + 3 + rand01(seed, i) * 4;
      const side = rand01(seed + 9, i) > 0.5 ? 1 : -1;
      P.rect(x + nx * off * side, y + ny * off * side, 2, 2, MATE_PAL.woodDark, 0.7); // verge pebble
    }
    if (i % 11 === 5 && rand01(seed + 5, i) > 0.5) {
      const off = w / 2 + 7 + rand01(seed + 2, i) * 4;
      drawFlower(P, x + nx * off, y + ny * off, seed * 7 + i); // occasional roadside flower
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
  // border
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
  P.rect(cx - 6, feetY - 3, 12, 3, MATE_PAL.black, 0.3); // shadow
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
  P.rect(cx - bw / 2, CHROME_TOP - 2, bw, 18, MATE_PAL.ink, 1);
  P.rect(cx - bw / 2, CHROME_TOP - 2, bw, 2, MATE_PAL.gold, 1);
  P.ctext(name, cx, CHROME_TOP + 1, MATE_PAL.cream, 1);
}

export interface MapScreen {
  render(surface: UISurface, run: RunView, hoverId: number | null, viewW: number, viewH: number): void;
  /** Screen-px → node id (accounts for the camera). */
  nodeAtScreen(sx: number, sy: number): number | null;
  /** Pan the camera by a screen-px delta (clamped to the world). */
  panBy(dx: number, dy: number): void;
  reachableOrder(run: RunView): number[];
}

/** Painter with the ground-tile viewport helpers used by `drawGroundTiles`. */
interface GroundPainter extends Painter {
  visibleLeft(): number;
  visibleRight(): number;
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
      // auto-center on the hero's node on any advance (then the player may pan freely)
      const focus = current !== null ? L.nodes.get(current) : undefined;
      const fx = focus?.cx ?? L.anchor.cx;
      camX = fx - viewW / 2;
      lastCurrent = current;
    }
    clampCam();

    const ox = -camX;
    const oy = -camY;
    const P: GroundPainter = {
      rect: (x, y, w, h, color, alpha = 1) => surface.rect(x + ox, y + oy, w, h, color, alpha),
      text: (t, x, y, color, alpha = 1, scale = 1) => {
        drawText(surface, t, x + ox, y + oy, { color, alpha, scale });
      },
      ctext: (t, cx, y, color, alpha = 1) => {
        if (t.length > 0) drawText(surface, t, cx - measureText(t) / 2 + ox, y + oy, { color, alpha });
      },
      visible: (x, w) => x + w >= camX - CULL_PAD && x <= camX + viewW + CULL_PAD,
      visibleLeft: () => camX - CULL_PAD,
      visibleRight: () => camX + viewW + CULL_PAD,
    };

    // WORLD: sky (per band) → ground tiles → scenery → footpaths → nodes → hero → banners
    for (const band of L.zones) drawSky(P, band, L);
    drawGroundTiles(P, L);
    for (const band of L.zones) drawScenery(P, band, L);

    for (const node of run.map.nodes) {
      const from = L.nodes.get(node.id);
      if (from === undefined) continue;
      for (const targetId of node.next) {
        const to = L.nodes.get(targetId);
        if (to !== undefined) drawRoad(P, from, to, node.id === current, node.id * 131 + targetId);
      }
    }
    if (current === null) for (const id of run.map.startIds) {
      const to = L.nodes.get(id);
      if (to !== undefined) drawRoad(P, L.anchor, to, true, id * 131);
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
      if (rect !== undefined) drawHero(P, rect.cx, rect.cy, rect.h);
    } else {
      drawHero(P, L.anchor.cx, L.anchor.cy, 0);
    }
    for (const band of L.zones) drawZoneBanner(P, band);

    // HUD (fixed screen space) — title, HP, legend, scroll hints.
    drawChrome(surface, run);
    drawLegendAt(surface, viewH);
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

function drawScenery(P: Painter, band: ZoneBand, L: MapLayout): void {
  const theme = ZONE_THEMES[band.index]!;
  const groundY = L.playBottom + 10;
  const count = theme.kind === "lair" ? 3 : theme.kind === "mountains" ? 5 : 6;
  const usable = band.endX - band.startX;
  for (let i = 0; i < count; i++) {
    const x = band.startX + 30 + rand01(band.index * 31 + i, 7) * Math.max(1, usable - 60);
    if (!P.visible(x - 34, 68)) continue;
    const j = rand01(band.index + i, 3);
    switch (theme.kind) {
      case "forest":
        if (i % 3 === 0) drawFern(P, x, groundY, 1 + j * 0.5);
        else if (i % 5 === 4) drawMushroom(P, x, groundY, 1 + j * 0.4);
        else drawPine(P, x, groundY, 1.2 + j * 0.7, theme);
        break;
      case "village":
        if (i % 3 === 0) drawCottage(P, x, groundY, 1.1 + j * 0.4);
        else if (i % 3 === 1) drawFence(P, x, groundY, 1 + j * 0.3);
        else if (i === 2) drawWell(P, x, groundY, 1 + j * 0.3);
        else drawPine(P, x, groundY, 1, ZONE_THEMES[0]!);
        break;
      case "mountains":
        if (i % 4 === 3) drawRock(P, x, groundY, 1 + j * 0.6);
        else drawPeak(P, x, groundY, 0.85 + j * 0.6);
        break;
      case "lair":
        if (i === 0) drawLair(P, x, groundY, 1.1 + j * 0.3);
        else drawDeadTree(P, x, groundY, 1 + j * 0.5);
        break;
    }
  }
}

function drawChrome(surface: UISurface, run: RunView): void {
  drawText(surface, STRINGS.mapTitle, 24, 10, { color: MATE_PAL.gold, scale: 2 });
  drawText(surface, STRINGS.warriorHpLabel, 24, HP_BAR_Y, { color: MATE_PAL.cream });
  surface.rect(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, MATE_PAL.navy);
  const pct = run.warriorMaxHp > 0 ? clamp(run.warriorHp / run.warriorMaxHp, 0, 1) : 0;
  const fillW = Math.round(HP_BAR_W * pct);
  if (fillW > 0) surface.rect(HP_BAR_X, HP_BAR_Y, fillW, HP_BAR_H, MATE_PAL.green);
  drawText(surface, `${run.warriorHp}/${run.warriorMaxHp}`, HP_BAR_X + HP_BAR_W + 10, HP_BAR_Y, { color: MATE_PAL.cream });
}

function drawLegendAt(surface: UISurface, viewH: number): void {
  const y = viewH - 22;
  let x = 24;
  drawText(surface, STRINGS.legendTitle, x, y, { color: MATE_PAL.steel });
  x += measureText(STRINGS.legendTitle) + 12;
  for (const type of LEGEND_ORDER) {
    const text = `${NODE_GLYPH[type]} ${STRINGS.legendLabel[type]}`;
    drawText(surface, text, x, y, { color: NODE_TYPE_COLOR[type] });
    x += measureText(text) + 16;
  }
}
