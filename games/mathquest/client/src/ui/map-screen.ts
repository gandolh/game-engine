/**
 * MateQuest — the spatial folklore-JOURNEY map (2026-07-22 designer pass v2): a HORIZONTAL trail
 * through four themed zones (Pădurea Adâncă → Satul → Munții Carpați → Bârlogul Zmeului), now
 * **full-viewport** with a **pan/scroll camera** (the world is wider than the screen) and a richer,
 * more-textured Canvas2D look — a CONTINUOUS dirt road with flowers/pebbles/grass tufts scattered
 * alongside, layered-alpha sky gradients, and soft biome blends across zone seams. Drawn entirely
 * from Resurrect-64 `UISurface.rect` + `drawText` (no WebGPU / no shaders — Canvas2D keeps the game
 * running on any device, per the user directive).
 *
 * ## Camera / coordinates
 * The map is laid out in a WORLD space (`worldW × worldH`); `worldW` exceeds the viewport when there
 * are enough columns, so the player scrolls horizontally. The camera (`camX,camY`, clamped to the
 * world) is owned here. `render(surface, run, hoverId, viewW, viewH)` takes the live viewport size
 * (the canvas's CSS px — full screen). WORLD elements are drawn through a small offset painter
 * (`-camX,-camY`); HUD chrome (title / HP / legend / scroll hints) is drawn in fixed SCREEN space.
 * The camera auto-centers on the hero's node whenever it changes (advance), then the player may pan
 * freely (drag / wheel / arrows — wired in `main.ts`) until the next advance.
 *
 * ## Determinism
 * Layout + all scatter (grass, flowers, pebbles) are a PURE function of `RunView` + an integer hash
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

const ROAD_W = 13;
const ROAD_STEP = 7;

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
  readonly sky: string;
  readonly ground: string;
  readonly groundHi: string;
  readonly groundDark: string;
}
const ZONE_THEMES: readonly ZoneTheme[] = [
  { kind: "forest", sky: MATE_PAL.skyBlue, ground: MATE_PAL.greenDark, groundHi: MATE_PAL.greenMid, groundDark: MATE_PAL.teal },
  { kind: "village", sky: MATE_PAL.cyan, ground: MATE_PAL.greenMid, groundHi: MATE_PAL.green, groundDark: MATE_PAL.greenDark },
  { kind: "mountains", sky: MATE_PAL.silver, ground: MATE_PAL.slate, groundHi: MATE_PAL.steel, groundDark: MATE_PAL.navy },
  { kind: "lair", sky: MATE_PAL.bark, ground: MATE_PAL.black, groundHi: MATE_PAL.plum, groundDark: MATE_PAL.ink },
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

// --- scenery -------------------------------------------------------------------------------------
function drawPine(P: Painter, x: number, baseY: number, s: number, theme: ZoneTheme): void {
  P.rect(x - 2 * s, baseY - 6 * s, 4 * s, 6 * s, MATE_PAL.woodDark, 0.95);
  drawTriangle(P, x, baseY - 5 * s, 9 * s, 12 * s, theme.groundDark, 0.95);
  drawTriangle(P, x, baseY - 11 * s, 7 * s, 10 * s, theme.ground, 1);
  drawTriangle(P, x, baseY - 17 * s, 5 * s, 8 * s, theme.groundHi, 1);
}
function drawCottage(P: Painter, x: number, baseY: number, s: number): void {
  const w = 22 * s;
  const h = 15 * s;
  P.rect(x - w / 2, baseY - h, w, h, MATE_PAL.tan, 1);
  drawTriangle(P, x, baseY - h, w / 2 + 3 * s, 11 * s, MATE_PAL.rust, 1);
  P.rect(x - 3 * s, baseY - 8 * s, 6 * s, 8 * s, MATE_PAL.woodDark, 1);
  P.rect(x + 3 * s, baseY - h + 3 * s, 4 * s, 4 * s, MATE_PAL.gold, 0.95);
}
function drawPeak(P: Painter, x: number, baseY: number, s: number): void {
  drawTriangle(P, x, baseY, 24 * s, 46 * s, MATE_PAL.slate, 1);
  drawTriangle(P, x, baseY, 15 * s, 33 * s, MATE_PAL.steel, 0.95);
  drawTriangle(P, x, baseY - 24 * s, 6 * s, 11 * s, MATE_PAL.white, 1);
}
function drawLair(P: Painter, x: number, baseY: number, s: number): void {
  drawTriangle(P, x, baseY, 28 * s, 48 * s, MATE_PAL.bark, 1);
  drawTriangle(P, x, baseY, 19 * s, 32 * s, MATE_PAL.plum, 0.9);
  P.rect(x - 6 * s, baseY - 15 * s, 12 * s, 15 * s, MATE_PAL.black, 1);
  P.rect(x - 4 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
  P.rect(x + 1 * s, baseY - 10 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
}

/** A small flower: stem + a few petals in a deterministic palette accent. */
function drawFlower(P: Painter, x: number, baseY: number, seed: number): void {
  const c = FLOWER_COLORS[Math.floor(rand01(seed, 5) * FLOWER_COLORS.length)] ?? MATE_PAL.gold;
  P.rect(x, baseY - 5, 1, 5, MATE_PAL.greenMid, 0.9); // stem
  P.rect(x - 2, baseY - 7, 2, 2, c, 1);
  P.rect(x + 1, baseY - 7, 2, 2, c, 1);
  P.rect(x - 1, baseY - 9, 2, 2, c, 1);
  P.rect(x - 1, baseY - 6, 2, 2, MATE_PAL.yellow, 1); // center
}

function drawZoneBackdrop(P: Painter, band: ZoneBand, L: MapLayout): void {
  const theme = ZONE_THEMES[band.index]!;
  const w = band.endX - band.startX;
  if (!P.visible(band.startX, w)) return;
  const skyTop = CHROME_TOP - 4;
  // sky: base tint + a layered-alpha vertical gradient (haze thickening toward the horizon)
  P.rect(band.startX, skyTop, w, L.horizon - skyTop, theme.sky, 0.4);
  const gradBands = 6;
  for (let i = 0; i < gradBands; i++) {
    const yy = L.horizon - ((i + 1) / gradBands) * (L.horizon - skyTop);
    const bh = (L.horizon - skyTop) / gradBands + 1;
    P.rect(band.startX, yy, w, bh, MATE_PAL.cream, 0.05 * (i + 1));
  }
  // ground: base + a darker lower stratum for depth
  P.rect(band.startX, L.horizon, w, L.playBottom + LEGEND_H + 40 - L.horizon, theme.ground, 0.9);
  P.rect(band.startX, L.horizon + (L.worldH - L.horizon) * 0.55, w, L.worldH - L.horizon, theme.groundDark, 0.35);
  P.rect(band.startX, L.horizon - 3, w, 5, theme.groundHi, 0.9); // grassy horizon rim
}

/** Soft biome blend across a seam: overlay each neighbour's colour with a linear-alpha falloff. */
function drawBiomeSeam(P: Painter, left: ZoneBand, right: ZoneBand, L: MapLayout): void {
  const x = right.startX;
  const half = 46;
  const slices = 10;
  const lt = ZONE_THEMES[left.index]!;
  const rt = ZONE_THEMES[right.index]!;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1); // 0 at left edge of seam → 1 at right
    const sx = x - half + (2 * half * i) / slices;
    const sw = (2 * half) / slices + 1;
    // right zone bleeds left (alpha rises L→R); left zone bleeds right (alpha falls L→R)
    P.rect(sx, L.horizon, sw, L.worldH - L.horizon, rt.ground, 0.5 * t);
    P.rect(sx, CHROME_TOP - 4, sw, L.horizon - (CHROME_TOP - 4), rt.sky, 0.3 * t);
    P.rect(sx, L.horizon, sw, L.worldH - L.horizon, lt.ground, 0.5 * (1 - t));
  }
}

function drawGroundTexture(P: Painter, band: ZoneBand, L: MapLayout): void {
  const theme = ZONE_THEMES[band.index]!;
  const groundY = L.playBottom + 8;
  const step = 26;
  for (let x = band.startX + 8; x < band.endX - 8; x += step) {
    if (!P.visible(x, step)) continue;
    for (let k = 0; k < 2; k++) {
      const jx = x + rand01(band.index * 91 + Math.round(x), k) * step;
      const jy = L.horizon + 12 + rand01(k, Math.round(x)) * (groundY - L.horizon - 12);
      // grass tuft: a couple of tiny vertical blades
      P.rect(jx, jy, 1, 3, theme.groundHi, 0.7);
      P.rect(jx + 2, jy - 1, 1, 4, theme.groundHi, 0.6);
      if (rand01(Math.round(jx), band.index) > 0.82) P.rect(jx - 1, jy + 3, 2, 2, theme.groundDark, 0.6); // pebble
    }
  }
}

// --- road ----------------------------------------------------------------------------------------
function drawRoad(P: Painter, from: { cx: number; cy: number }, to: { cx: number; cy: number }, bright: boolean, seed: number): void {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dist = Math.hypot(dx, dy);
  if (!P.visible(Math.min(from.cx, to.cx), Math.abs(dx) + ROAD_W * 2)) return;
  const steps = Math.max(4, Math.round(dist / ROAD_STEP));
  const base = bright ? MATE_PAL.gold : MATE_PAL.tan;
  const outline = bright ? MATE_PAL.orange : MATE_PAL.woodDark;
  const a = bright ? 1 : 0.9;
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1); // unit perpendicular, for flowers along the verge
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    P.rect(x - (ROAD_W + 4) / 2, y - (ROAD_W + 4) / 2, ROAD_W + 4, ROAD_W + 4, outline, a * 0.75); // edge
    P.rect(x - ROAD_W / 2, y - ROAD_W / 2, ROAD_W, ROAD_W, base, a); // fill
    if (i % 4 === 0) P.rect(x - 2, y - 2, 4, 4, bright ? MATE_PAL.yellow : MATE_PAL.cream, 0.85); // dashed centerline
    if (i % 5 === 0 && rand01(seed, i) > 0.55) P.rect(x + (rand01(i, seed) - 0.5) * 6, y + (rand01(seed, i * 3) - 0.5) * 6, 2, 2, MATE_PAL.woodDark, 0.5); // pebbles
    // flowers along the verge (both sides), off the road surface
    if (i % 6 === 3) {
      const off = ROAD_W / 2 + 6 + rand01(seed, i) * 5;
      if (rand01(seed + 1, i) > 0.4) drawFlower(P, x + nx * off, y + ny * off, seed * 7 + i);
      if (rand01(seed + 2, i) > 0.5) drawFlower(P, x - nx * off, y - ny * off, seed * 11 + i);
    }
  }
}

type NodeState = "reachable" | "visited" | "locked";

function drawNode(P: Painter, rect: NodeRect, node: MapNode, state: NodeState, hovered: boolean): void {
  const { cx, cy, w, h } = rect;
  if (!P.visible(cx - w, w * 2)) return;
  const x = cx - w / 2;
  const y = cy - h / 2;
  let fillA: number;
  let textA: number;
  let border: string;
  let borderA: number;
  switch (state) {
    case "reachable":
      fillA = 1;
      textA = 1;
      border = hovered ? MATE_PAL.yellow : MATE_PAL.gold;
      borderA = 1;
      break;
    case "visited":
      fillA = 0.62;
      textA = 0.9;
      border = MATE_PAL.steel;
      borderA = 0.75;
      break;
    case "locked":
      fillA = 0.34;
      textA = 0.55;
      border = MATE_PAL.slate;
      borderA = 0.5;
      break;
  }
  P.rect(cx - 3, cy, 6, h / 2 + 10, MATE_PAL.woodDark, 0.5 * fillA); // signpost
  P.rect(x - NODE_BORDER, y - NODE_BORDER, w + NODE_BORDER * 2, h + NODE_BORDER * 2, border, borderA);
  P.rect(x, y, w, h, NODE_TYPE_COLOR[node.type], fillA);
  P.rect(x + 2, y + 2, w - 4, 3, MATE_PAL.white, 0.25 * fillA); // top highlight
  P.ctext((state === "visited" ? STRINGS.visitedPrefix : "") + NODE_GLYPH[node.type], cx, cy - 10, MATE_PAL.white, textA);
  if (node.type !== "rest") P.ctext(STRINGS.gradeLabel[node.grade], cx, cy + 2, MATE_PAL.cream, textA);
}

function drawHero(P: Painter, cx: number, cyNode: number, h: number): void {
  const feetY = cyNode - h / 2 - 4;
  P.rect(cx - 6, feetY - 3, 12, 3, MATE_PAL.black, 0.3); // shadow
  P.rect(cx - 5, feetY - 4, 10, 4, MATE_PAL.woodDark, 0.95);
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
  P.rect(cx - bw / 2, CHROME_TOP - 2, bw, 18, MATE_PAL.ink, 0.82);
  P.rect(cx - bw / 2, CHROME_TOP - 2, bw, 2, MATE_PAL.gold, 0.9);
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

    // WORLD: backdrops → biome seams → ground texture → scenery → roads → nodes → hero → banners
    for (const band of L.zones) drawZoneBackdrop(P, band, L);
    for (let i = 1; i < L.zones.length; i++) drawBiomeSeam(P, L.zones[i - 1]!, L.zones[i]!, L);
    for (const band of L.zones) drawGroundTexture(P, band, L);
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
  const count = theme.kind === "lair" ? 2 : 4;
  const usable = band.endX - band.startX;
  for (let i = 0; i < count; i++) {
    const x = band.startX + 30 + rand01(band.index * 31 + i, 7) * Math.max(1, usable - 60);
    if (!P.visible(x - 30, 60)) continue;
    const jitter = rand01(band.index + i, 3);
    switch (theme.kind) {
      case "forest":
        drawPine(P, x, groundY, 1.2 + jitter * 0.6, theme);
        break;
      case "village":
        if (i % 2 === 0) drawCottage(P, x, groundY, 1.1 + jitter * 0.4);
        else drawPine(P, x, groundY, 1, ZONE_THEMES[0]!);
        break;
      case "mountains":
        drawPeak(P, x, groundY, 0.9 + jitter * 0.5);
        break;
      case "lair":
        drawLair(P, x, groundY, 1.1 + jitter * 0.3);
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
