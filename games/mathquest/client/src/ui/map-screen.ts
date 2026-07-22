/**
 * MateQuest — the spatial, "Mewgenics/Slay-the-Spire"-style progressive map, redesigned as a
 * HORIZONTAL folklore JOURNEY (2026-07-22 designer pass). You travel left→right along a dirt ROAD
 * that winds through four themed ZONES (Pădurea Adâncă → Satul → Munții Carpați → Bârlogul Zmeului),
 * each a tinted band of sky + ground with its own pixel-art scenery (pines / cottages / snowy peaks
 * / the Zmeu's lair) and a name banner, past signpost-style node markers, with the hero token
 * walking the road. All drawn deterministically from Resurrect-64 `UISurface.rect` + `drawText` —
 * no external art. `combat-screen.ts`/`run-over-screen.ts` are unchanged widget screens.
 *
 * Public shape is UNCHANGED from the previous version so `main.ts` needs no edits:
 *   createMapScreen(): { render(surface, run, hoverId), nodeAt(x,y), reachableOrder(run) }
 *
 * ## Layout — a pure function of `RunView.map` (no rng; determinism rule applies to layout too)
 *  - **horizontal climb:** each distinct `MapNode.row` is a COLUMN, spread left→right (row 0 at the
 *    far left, boss at the far right). Within a column, `MapNode.col` spreads the branch nodes
 *    vertically, with a gentle per-column `sin` wave so the road snakes up/down as it advances.
 *  - **zones:** the columns are grouped into four zones (the non-boss columns into three, the boss
 *    into its own), each a contiguous x-band drawn with a themed sky/ground + scenery + banner.
 *
 * ## Token position
 * `run.currentId` is `null` the whole time `mode === "map"` (it's only set inside an active fight),
 * so the hero position derives as `currentId ?? last(visitedIds)`, falling back to a start anchor at
 * the far left only at a true run start.
 */
import { drawText, measureText, type UISurface } from "@engine/ui";
import type { MapNode, NodeType, RunMap, RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

// Fixed logical canvas the layout is authored against (matches main.ts's Camera2D design resolution;
// UISurface draws in screen px — same implicit-fixed-size convention combat-screen.ts uses).
const MAP_W = 960;
const MAP_H = 540;

const PLAY_TOP = 70; // below the title + HP chrome
const PLAY_BOTTOM = MAP_H - 44; // above the legend
const PLAY_LEFT = 60;
const PLAY_RIGHT = MAP_W - 60;
const HORIZON = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;

const NODE_W = 46;
const NODE_H = 34;
const BOSS_W = 60;
const BOSS_H = 44;
const NODE_BORDER = 3;
const COL_WAVE = 26; // per-column vertical winding amplitude (px)

const ROAD_W = 12;
const ROAD_STEP = 9; // px between road ribbon stamps

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

/** Font-covered glyphs per node type (⚔/☾/☠ aren't in UNSCII — see strings.ts). */
const NODE_GLYPH: Record<NodeType, string> = { combat: "†", elite: "★", rest: "♥", boss: "♠" };
const LEGEND_ORDER: readonly NodeType[] = ["combat", "elite", "rest", "boss"];

/** A zone's cosmetic theme (drawn per x-band). `kind` selects the scenery drawer. */
type ZoneKind = "forest" | "village" | "mountains" | "lair";
interface ZoneTheme {
  readonly kind: ZoneKind;
  readonly sky: string;
  readonly ground: string;
  readonly groundHi: string;
}
const ZONE_THEMES: readonly ZoneTheme[] = [
  { kind: "forest", sky: MATE_PAL.skyBlue, ground: MATE_PAL.greenDark, groundHi: MATE_PAL.greenMid },
  { kind: "village", sky: MATE_PAL.cyan, ground: MATE_PAL.greenMid, groundHi: MATE_PAL.green },
  { kind: "mountains", sky: MATE_PAL.silver, ground: MATE_PAL.slate, groundHi: MATE_PAL.steel },
  { kind: "lair", sky: MATE_PAL.bark, ground: MATE_PAL.black, groundHi: MATE_PAL.plum },
];

interface NodeRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}
interface ZoneBand {
  readonly index: number; // 0..3
  readonly startX: number;
  readonly endX: number;
}
interface MapLayout {
  readonly nodes: ReadonlyMap<number, NodeRect>;
  readonly zones: readonly ZoneBand[];
  readonly anchor: { readonly cx: number; readonly cy: number };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Small deterministic hash → [0,1), for scenery scatter (never Math.random — layout is pure). */
function rand01(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}

/** Every node's pixel centre + the four zone x-bands, purely from `map`'s row/col shape. */
function computeMapLayout(map: RunMap): MapLayout {
  const rowNumbers = [...new Set(map.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const colCount = rowNumbers.length;
  const colIndexOf = new Map(rowNumbers.map((r, i) => [r, i]));
  const bossRow = map.nodes.find((n) => n.id === map.bossId)?.row ?? rowNumbers[colCount - 1] ?? 0;

  const rowSizeOf = new Map<number, number>();
  for (const n of map.nodes) rowSizeOf.set(n.row, (rowSizeOf.get(n.row) ?? 0) + 1);

  const columnX = (i: number): number =>
    colCount <= 1 ? (PLAY_LEFT + PLAY_RIGHT) / 2 : PLAY_LEFT + (i / (colCount - 1)) * (PLAY_RIGHT - PLAY_LEFT);

  const nodes = new Map<number, NodeRect>();
  for (const n of map.nodes) {
    const i = colIndexOf.get(n.row)!;
    const size = rowSizeOf.get(n.row)!;
    const isBoss = n.id === map.bossId;
    const cx = columnX(i);
    const t = size <= 1 ? 0.5 : (n.col + 0.5) / size;
    const bandTop = PLAY_TOP + 46;
    const bandBottom = PLAY_BOTTOM - 30;
    const cy = bandTop + t * (bandBottom - bandTop) + Math.sin(i * 0.9) * COL_WAVE;
    nodes.set(n.id, { cx, cy, w: isBoss ? BOSS_W : NODE_W, h: isBoss ? BOSS_H : NODE_H });
  }

  // Zone assignment: non-boss columns split into 3 groups, boss column is zone 3.
  const bossColIndex = colIndexOf.get(bossRow) ?? colCount - 1;
  const nonBossCols = colCount - 1;
  const colsPerZone = Math.max(1, Math.ceil(nonBossCols / 3));
  const zoneOfCol = (i: number): number => (i >= bossColIndex ? 3 : Math.min(2, Math.floor(i / colsPerZone)));

  // Contiguous zone x-bands covering [0, MAP_W]; boundaries at midpoints between adjacent columns
  // whose zone differs. Guarantees full coverage with no gaps.
  const bands: ZoneBand[] = [];
  const presentZones = [...new Set(rowNumbers.map((_, i) => zoneOfCol(i)))].sort((a, b) => a - b);
  for (const z of presentZones) {
    const colsInZone = rowNumbers.map((_, i) => i).filter((i) => zoneOfCol(i) === z);
    const firstI = colsInZone[0]!;
    const lastI = colsInZone[colsInZone.length - 1]!;
    const startX = firstI === 0 ? 0 : (columnX(firstI - 1) + columnX(firstI)) / 2;
    const endX = lastI >= colCount - 1 ? MAP_W : (columnX(lastI) + columnX(lastI + 1)) / 2;
    bands.push({ index: z, startX, endX });
  }

  const startRects = map.startIds.map((id) => nodes.get(id)!).filter(Boolean);
  const anchorCy =
    startRects.length > 0 ? startRects.reduce((s, r) => s + r.cy, 0) / startRects.length : HORIZON;
  return { nodes, zones: bands, anchor: { cx: PLAY_LEFT - 34, cy: anchorCy } };
}

function currentNodeId(run: RunView): number | null {
  if (run.currentId !== null) return run.currentId;
  const v = run.visitedIds;
  return v.length > 0 ? v[v.length - 1]! : null;
}

// --- primitive: a chunky pixel triangle (stacked narrowing rects), point up or down --------------
function drawTriangle(
  surface: UISurface,
  cx: number,
  baseY: number,
  halfBase: number,
  height: number,
  color: string,
  alpha = 1,
): void {
  const rows = Math.max(3, Math.round(height / 3));
  const rh = height / rows;
  for (let i = 0; i < rows; i++) {
    const w = halfBase * 2 * (1 - i / rows);
    const y = baseY - (i + 1) * rh;
    surface.rect(cx - w / 2, y, Math.max(2, w), rh + 1, color, alpha);
  }
}

// --- scenery drawers -----------------------------------------------------------------------------
function drawPine(surface: UISurface, x: number, baseY: number, s: number, theme: ZoneTheme): void {
  surface.rect(x - 2 * s, baseY - 6 * s, 4 * s, 6 * s, MATE_PAL.woodDark, 0.9); // trunk
  drawTriangle(surface, x, baseY - 5 * s, 9 * s, 12 * s, theme.ground, 0.95);
  drawTriangle(surface, x, baseY - 11 * s, 7 * s, 10 * s, theme.groundHi, 0.95);
  drawTriangle(surface, x, baseY - 17 * s, 5 * s, 8 * s, theme.groundHi, 1);
}

function drawCottage(surface: UISurface, x: number, baseY: number, s: number): void {
  const w = 20 * s;
  const h = 14 * s;
  surface.rect(x - w / 2, baseY - h, w, h, MATE_PAL.tan, 1); // wall
  drawTriangle(surface, x, baseY - h, w / 2 + 3 * s, 10 * s, MATE_PAL.rust, 1); // roof
  surface.rect(x - 3 * s, baseY - 8 * s, 6 * s, 8 * s, MATE_PAL.woodDark, 1); // door
  surface.rect(x + 3 * s, baseY - h + 3 * s, 4 * s, 4 * s, MATE_PAL.gold, 0.9); // window
}

function drawPeak(surface: UISurface, x: number, baseY: number, s: number): void {
  drawTriangle(surface, x, baseY, 22 * s, 40 * s, MATE_PAL.slate, 1);
  drawTriangle(surface, x, baseY, 14 * s, 30 * s, MATE_PAL.steel, 0.9);
  drawTriangle(surface, x, baseY - 22 * s, 6 * s, 10 * s, MATE_PAL.white, 1); // snow cap
}

function drawLair(surface: UISurface, x: number, baseY: number, s: number): void {
  drawTriangle(surface, x, baseY, 26 * s, 44 * s, MATE_PAL.bark, 1); // dark mound
  drawTriangle(surface, x, baseY, 18 * s, 30 * s, MATE_PAL.plum, 0.9);
  surface.rect(x - 6 * s, baseY - 14 * s, 12 * s, 14 * s, MATE_PAL.black, 1); // cave mouth
  surface.rect(x - 3 * s, baseY - 9 * s, 3 * s, 3 * s, MATE_PAL.red, 1); // glowing eyes
  surface.rect(x + 1 * s, baseY - 9 * s, 3 * s, 3 * s, MATE_PAL.red, 1);
}

function drawScenery(surface: UISurface, band: ZoneBand): void {
  const theme = ZONE_THEMES[band.index]!;
  const groundY = PLAY_BOTTOM - 6;
  const count = theme.kind === "lair" ? 2 : 4;
  const usable = band.endX - band.startX;
  for (let i = 0; i < count; i++) {
    const x = band.startX + 24 + rand01(band.index * 31 + i, 7) * Math.max(1, usable - 48);
    const jitter = rand01(band.index + i, 3);
    switch (theme.kind) {
      case "forest":
        drawPine(surface, x, groundY, 1.1 + jitter * 0.5, theme);
        break;
      case "village":
        if (i % 2 === 0) drawCottage(surface, x, groundY, 1 + jitter * 0.4);
        else drawPine(surface, x, groundY, 0.9, ZONE_THEMES[0]!);
        break;
      case "mountains":
        drawPeak(surface, x, groundY, 0.8 + jitter * 0.5);
        break;
      case "lair":
        drawLair(surface, x, groundY, 1 + jitter * 0.3);
        break;
    }
  }
}

function drawZones(surface: UISurface, zones: readonly ZoneBand[]): void {
  // Backdrop bands: sky (down to horizon) + ground (horizon to bottom), per zone.
  for (const band of zones) {
    const theme = ZONE_THEMES[band.index]!;
    const w = band.endX - band.startX;
    surface.rect(band.startX, PLAY_TOP - 8, w, HORIZON - (PLAY_TOP - 8), theme.sky, 0.45);
    surface.rect(band.startX, HORIZON, w, PLAY_BOTTOM - HORIZON, theme.ground, 0.85);
    surface.rect(band.startX, HORIZON - 3, w, 4, theme.groundHi, 0.9); // grassy horizon rim
    // faint zone divider
    if (band.index > 0) surface.rect(band.startX - 1, PLAY_TOP - 8, 2, PLAY_BOTTOM - PLAY_TOP + 8, MATE_PAL.ink, 0.35);
  }
  // scenery on top of the ground band
  for (const band of zones) drawScenery(surface, band);
  // zone name banners along the top
  for (const band of zones) {
    const name = STRINGS.zoneName[band.index] ?? "";
    if (name.length === 0) continue;
    const cx = (band.startX + band.endX) / 2;
    const tw = measureText(name);
    const bw = tw + 20;
    surface.rect(cx - bw / 2, PLAY_TOP - 4, bw, 18, MATE_PAL.ink, 0.8);
    surface.rect(cx - bw / 2, PLAY_TOP - 4, bw, 2, MATE_PAL.gold, 0.9);
    drawText(surface, name, cx - tw / 2, PLAY_TOP - 1, { color: MATE_PAL.cream });
  }
}

// --- road ribbon ---------------------------------------------------------------------------------
function drawRoad(surface: UISurface, from: { cx: number; cy: number }, to: { cx: number; cy: number }, bright: boolean): void {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.round(dist / ROAD_STEP));
  const base = bright ? MATE_PAL.gold : MATE_PAL.tan;
  const outline = bright ? MATE_PAL.orange : MATE_PAL.woodDark;
  const baseAlpha = bright ? 1 : 0.85;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    surface.rect(x - (ROAD_W + 4) / 2, y - (ROAD_W + 4) / 2, ROAD_W + 4, ROAD_W + 4, outline, baseAlpha * 0.7);
    surface.rect(x - ROAD_W / 2, y - ROAD_W / 2, ROAD_W, ROAD_W, base, baseAlpha);
    if (i % 3 === 0) surface.rect(x - 2, y - 2, 4, 4, bright ? MATE_PAL.yellow : MATE_PAL.cream, 0.9); // dashed centerline
  }
}

type NodeState = "reachable" | "visited" | "locked";

function drawCenteredText(surface: UISurface, text: string, cx: number, y: number, color: string, alpha: number): void {
  if (text.length === 0) return;
  drawText(surface, text, cx - measureText(text) / 2, y, { color, alpha });
}

function drawNode(surface: UISurface, rect: NodeRect, node: MapNode, state: NodeState, hovered: boolean): void {
  const { cx, cy, w, h } = rect;
  const x = cx - w / 2;
  const y = cy - h / 2;

  let fillAlpha: number;
  let textAlpha: number;
  let borderColor: string;
  let borderAlpha: number;
  switch (state) {
    case "reachable":
      fillAlpha = 1;
      textAlpha = 1;
      borderColor = hovered ? MATE_PAL.yellow : MATE_PAL.gold;
      borderAlpha = 1;
      break;
    case "visited":
      fillAlpha = 0.6;
      textAlpha = 0.9;
      borderColor = MATE_PAL.steel;
      borderAlpha = 0.75;
      break;
    case "locked":
      fillAlpha = 0.35;
      textAlpha = 0.55;
      borderColor = MATE_PAL.slate;
      borderAlpha = 0.5;
      break;
  }

  // a post/shadow under the marker so it reads as a signpost standing on the road
  surface.rect(cx - 2, cy, 4, h / 2 + 8, MATE_PAL.woodDark, 0.5 * fillAlpha);
  surface.rect(x - NODE_BORDER, y - NODE_BORDER, w + NODE_BORDER * 2, h + NODE_BORDER * 2, borderColor, borderAlpha);
  surface.rect(x, y, w, h, NODE_TYPE_COLOR[node.type], fillAlpha);
  surface.rect(x + 2, y + 2, w - 4, 3, MATE_PAL.white, 0.25 * fillAlpha); // top highlight

  const glyph = (state === "visited" ? STRINGS.visitedPrefix : "") + NODE_GLYPH[node.type];
  drawCenteredText(surface, glyph, cx, cy - 9, MATE_PAL.white, textAlpha);
  if (node.type !== "rest") {
    drawCenteredText(surface, STRINGS.gradeLabel[node.grade], cx, cy + 2, MATE_PAL.cream, textAlpha);
  }
}

/** The hero token: a tiny figure standing on the current node. */
function drawHero(surface: UISurface, cx: number, cyNode: number, h: number): void {
  const feetY = cyNode - h / 2 - 4;
  surface.rect(cx - 5, feetY - 4, 10, 4, MATE_PAL.woodDark, 0.9); // legs
  surface.rect(cx - 5, feetY - 12, 10, 8, MATE_PAL.red, 1); // tunic
  surface.rect(cx - 3, feetY - 17, 6, 6, MATE_PAL.skin, 1); // head
  surface.rect(cx - 4, feetY - 19, 8, 3, MATE_PAL.gold, 1); // hat/crown
  surface.rect(cx + 5, feetY - 14, 3, 12, MATE_PAL.silver, 1); // sword
}

function drawChrome(surface: UISurface, run: RunView): void {
  drawText(surface, STRINGS.mapTitle, 24, 10, { color: MATE_PAL.gold, scale: 2 });
  drawText(surface, STRINGS.warriorHpLabel, 24, HP_BAR_Y, { color: MATE_PAL.cream });
  surface.rect(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, MATE_PAL.navy);
  const pct = run.warriorMaxHp > 0 ? clamp01(run.warriorHp / run.warriorMaxHp) : 0;
  const fillW = Math.round(HP_BAR_W * pct);
  if (fillW > 0) surface.rect(HP_BAR_X, HP_BAR_Y, fillW, HP_BAR_H, MATE_PAL.green);
  drawText(surface, `${run.warriorHp}/${run.warriorMaxHp}`, HP_BAR_X + HP_BAR_W + 10, HP_BAR_Y, { color: MATE_PAL.cream });
}

function drawLegend(surface: UISurface): void {
  const y = MAP_H - 26;
  let x = 24;
  drawText(surface, STRINGS.legendTitle, x, y, { color: MATE_PAL.steel });
  x += measureText(STRINGS.legendTitle) + 12;
  for (const type of LEGEND_ORDER) {
    const text = `${NODE_GLYPH[type]} ${STRINGS.legendLabel[type]}`;
    drawText(surface, text, x, y, { color: NODE_TYPE_COLOR[type] });
    x += measureText(text) + 16;
  }
}

export interface MapScreen {
  render(surface: UISurface, run: RunView, hoverId: number | null): void;
  nodeAt(x: number, y: number): number | null;
  reachableOrder(run: RunView): number[];
}

export function createMapScreen(): MapScreen {
  let layout: ReadonlyMap<number, NodeRect> = new Map();

  function render(surface: UISurface, run: RunView, hoverId: number | null): void {
    const computed = computeMapLayout(run.map);
    layout = computed.nodes;

    drawZones(surface, computed.zones);
    drawChrome(surface, run);

    const reachable = new Set(run.reachableIds);
    const visited = new Set(run.visitedIds);
    const current = currentNodeId(run);

    // Roads FIRST, under the nodes (brightened leaving the current node / the start anchor).
    for (const node of run.map.nodes) {
      const from = computed.nodes.get(node.id);
      if (from === undefined) continue;
      for (const targetId of node.next) {
        const to = computed.nodes.get(targetId);
        if (to !== undefined) drawRoad(surface, from, to, node.id === current);
      }
    }
    if (current === null) {
      for (const startId of run.map.startIds) {
        const to = computed.nodes.get(startId);
        if (to !== undefined) drawRoad(surface, computed.anchor, to, true);
      }
    }

    // Nodes.
    for (const node of run.map.nodes) {
      const rect = computed.nodes.get(node.id);
      if (rect === undefined) continue;
      const state: NodeState = visited.has(node.id) ? "visited" : reachable.has(node.id) ? "reachable" : "locked";
      drawNode(surface, rect, node, state, hoverId === node.id);
    }

    // Hero token on the current node (or the start anchor).
    if (current !== null) {
      const rect = computed.nodes.get(current);
      if (rect !== undefined) drawHero(surface, rect.cx, rect.cy, rect.h);
    } else {
      drawHero(surface, computed.anchor.cx, computed.anchor.cy, 0);
    }

    drawLegend(surface);
  }

  function nodeAt(x: number, y: number): number | null {
    for (const [id, r] of layout) {
      if (x >= r.cx - r.w / 2 && x <= r.cx + r.w / 2 && y >= r.cy - r.h / 2 && y <= r.cy + r.h / 2) return id;
    }
    return null;
  }

  function reachableOrder(run: RunView): number[] {
    const byId = new Map(run.map.nodes.map((n) => [n.id, n] as const));
    return [...run.reachableIds].sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      if (na.row !== nb.row) return na.row - nb.row; // progression (left→right)
      return na.col - nb.col; // then vertical
    });
  }

  return { render, nodeAt, reachableOrder };
}
