/**
 * MateQuest M3.1 — the spatial, "Mewgenics/Slay-the-Spire"-style progressive map
 * (corpus/todos/2026-07-22-mathquest-M3.1-spatial-map.md). REPLACES M3's retained `@engine/ui`
 * widget-tree map (a grid of buttons; see git history) with a CUSTOM-DRAWN screen: nodes at
 * absolute pixel positions along a winding path, connected by dotted trails, with a party token
 * on the current node — the layout `@engine/ui`'s flexbox-only widget tree can't express (no
 * absolute positioning), which is exactly why M3 skipped edges.
 *
 * `render(surface, run, hoverId)` draws the WHOLE screen in one raw pass (chrome, trails, nodes,
 * token, legend) directly through `UISurface.rect` + `drawText`/`measureText` — no widget tree,
 * no `computeLayout`/`renderTree`, no a11y mirror for this screen (a full DOM mirror for a
 * spatial canvas map is a known follow-up; `main.ts` keeps the widget dispatcher/mirror wired to
 * `null` while in map mode instead — see its module doc). `combat-screen.ts`/`run-over-screen.ts`
 * are UNCHANGED and keep their widget tree + dispatcher + a11y mirror.
 *
 * ## Layout — a pure function of `RunView.map`
 * `computeMapLayout` derives every node's pixel centre from its `row`/`col` + the row's node
 * count ONLY (no `Math.random`/`Date.now` — root CLAUDE.md's determinism rule applies to layout
 * too, per the brief, even though this is pure render code with no sim/rng involved):
 *  - **vertical climb:** row 0 sits near the BOTTOM of the fixed `MAP_W x MAP_H` logical canvas
 *    (matching `main.ts`'s `Camera2D` design resolution — the same "author against a fixed
 *    logical size" convention `combat-screen.ts`'s absolute pixel constants already use), the
 *    boss row at the TOP; rows are evenly spaced across the play area.
 *  - **winding:** each row gets a deterministic `sin(rowIndex)`-based horizontal phase offset
 *    (`rowPhaseOffset`) added to its nodes' otherwise-evenly-spread x positions, so the column of
 *    nodes snakes left/right instead of stacking in straight vertical columns — the Mewgenics/StS
 *    "winding trail" read.
 *
 * ## The "current node" for the token + trail highlight
 * The brief's suggested `run.currentId` is `null` for the ENTIRE time `mode === "map"` (it is set
 * only inside an active `Combat`, cleared the instant a fight resolves back to `"map"` — see
 * `sim-bootstrap.ts`'s `chooseNode`/`resolveCombatIfOver`) — so a literal `run.currentId` read
 * would show the "you start here" anchor forever and the token would never move.
 * **Deviation (noted per the brief's "if a needed API differs, adapt to the REAL API" rule):**
 * this screen derives the party's map position as `run.currentId ?? lastOf(run.visitedIds)`,
 * falling back to the "before the first choice" anchor only when BOTH are empty (true run start).
 * This is what actually makes the token move as the player advances (verified in the browser
 * steps in the report) while still satisfying the brief's "when `currentId` is `null` ... place
 * it just below row 0" clause for the true start case.
 */
import { drawText, measureText, type UISurface } from "@engine/ui";
import type { MapNode, NodeType, RunMap, RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

// --- Fixed logical canvas the layout is authored against (matches `main.ts`'s Camera2D design
// resolution — `UISurface` draws in CSS screen px, so this is a convention, not a hard readout of
// the actual canvas size, same implicit assumption `combat-screen.ts`'s absolute pixel constants
// already make). ---------------------------------------------------------------------------------
const MAP_W = 960;
const MAP_H = 540;

const CHROME_TOP = 78; // title + warrior HP bar
const CHROME_BOTTOM = 54; // legend row
const SIDE_MARGIN = 96;

const NODE_W = 44;
const NODE_H = 32;
const NODE_BORDER = 3;

/** Per-row horizontal winding amplitude, in px — a deterministic `sin(row)` phase offset. */
const WIND_AMPLITUDE = 50;

const ANCHOR_GAP = 20; // "just below row 0", in px, for the pre-first-choice token position.
const TOKEN_SIZE = 10;
const TOKEN_LIFT = 7; // token floats just above the node it's sitting on, not over its glyph text.

const HP_BAR_X = 220;
const HP_BAR_Y = 30;
const HP_BAR_W = 200;
const HP_BAR_H = 12;

const TRAIL_DOT = 3;
const TRAIL_STEP_PX = 14; // ~px between sampled dots along a trail segment.

const NODE_TYPE_COLOR: Record<NodeType, string> = {
  combat: MATE_PAL.skyBlue,
  elite: MATE_PAL.crimson,
  rest: MATE_PAL.green,
  boss: MATE_PAL.red,
};

/** Same glyphs `strings.ts`'s `nodeLabel` uses per type — kept local since this screen needs the
 * glyph and the `G{grade}` suffix as two SEPARATELY centered lines, not `nodeLabel`'s one string.
 * Limited to the @engine/ui font's covered symbols (⚔/☾/☠ aren't in UNSCII — see strings.ts). */
const NODE_GLYPH: Record<NodeType, string> = {
  combat: "†",
  elite: "★",
  rest: "♥",
  boss: "♠",
};

const LEGEND_ORDER: readonly NodeType[] = ["combat", "elite", "rest", "boss"];

interface NodeRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

interface MapLayout {
  readonly nodes: ReadonlyMap<number, NodeRect>;
  readonly anchor: { readonly cx: number; readonly cy: number };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Row index (0 = bottom) -> pixel y, evenly spread across the play area. Pure function of the
 * row's position among the map's distinct row numbers — no rng. */
function rowY(rowIndex: number, rowCount: number, playTop: number, playBottom: number): number {
  if (rowCount <= 1) return (playTop + playBottom) / 2;
  const t = rowIndex / (rowCount - 1);
  return playBottom - t * (playBottom - playTop);
}

/** Deterministic per-row horizontal phase offset — the "winding trail" read. Function of the row
 * index only, never `Math.random`. */
function rowPhaseOffset(rowIndex: number): number {
  return Math.sin(rowIndex * 0.9) * WIND_AMPLITUDE;
}

function colX(col: number, rowSize: number, rowIndex: number, left: number, right: number): number {
  const usable = right - left;
  const t = rowSize <= 1 ? 0.5 : (col + 0.5) / rowSize;
  const base = left + t * usable;
  const offset = rowPhaseOffset(rowIndex);
  const minX = left + NODE_W / 2;
  const maxX = right - NODE_W / 2;
  return Math.max(minX, Math.min(maxX, base + offset));
}

/**
 * Every node's pixel centre, purely from `map`'s row/col shape (see the module doc). Rebuilt each
 * `render()` call — cheap (≈10-15 nodes) — so the screen never carries a stale layout across a
 * fresh run's differently-shaped map.
 */
function computeMapLayout(map: RunMap): MapLayout {
  const rowNumbers = [...new Set(map.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const rowCount = rowNumbers.length;
  const rowIndexOf = new Map(rowNumbers.map((r, i) => [r, i]));

  const rowSizeOf = new Map<number, number>();
  for (const n of map.nodes) rowSizeOf.set(n.row, (rowSizeOf.get(n.row) ?? 0) + 1);

  const playTop = CHROME_TOP + NODE_H / 2;
  const playBottom = MAP_H - CHROME_BOTTOM - NODE_H / 2;
  const left = SIDE_MARGIN;
  const right = MAP_W - SIDE_MARGIN;

  const nodes = new Map<number, NodeRect>();
  for (const n of map.nodes) {
    const rowIndex = rowIndexOf.get(n.row)!;
    const rowSize = rowSizeOf.get(n.row)!;
    const cy = rowY(rowIndex, rowCount, playTop, playBottom);
    const cx = colX(n.col, rowSize, rowIndex, left, right);
    nodes.set(n.id, { cx, cy, w: NODE_W, h: NODE_H });
  }

  const startRects = map.startIds.map((id) => nodes.get(id)!);
  const anchorCx =
    startRects.length > 0 ? startRects.reduce((s, r) => s + r.cx, 0) / startRects.length : MAP_W / 2;
  const startRowIndex = rowIndexOf.get(0) ?? 0;
  const anchorCy = rowY(startRowIndex, rowCount, playTop, playBottom) + ANCHOR_GAP;

  return { nodes, anchor: { cx: anchorCx, cy: anchorCy } };
}

/** The party's current map position: the brief's `run.currentId`, falling back to the most
 * recently visited node (see the module doc's deviation note), `null` only at a true run start. */
function currentNodeId(run: RunView): number | null {
  if (run.currentId !== null) return run.currentId;
  const v = run.visitedIds;
  return v.length > 0 ? v[v.length - 1]! : null;
}

function drawTrail(surface: UISurface, from: NodeRect, to: { cx: number; cy: number }, bright: boolean): void {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(5, Math.round(dist / TRAIL_STEP_PX));
  const color = bright ? MATE_PAL.gold : MATE_PAL.slate;
  const alpha = bright ? 0.9 : 0.4;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.cx + dx * t;
    const y = from.cy + dy * t;
    surface.rect(x - TRAIL_DOT / 2, y - TRAIL_DOT / 2, TRAIL_DOT, TRAIL_DOT, color, alpha);
  }
}

type NodeState = "reachable" | "visited" | "locked";

function drawCenteredText(surface: UISurface, text: string, cx: number, y: number, color: string, alpha: number): void {
  if (text.length === 0) return;
  const w = measureText(text);
  drawText(surface, text, cx - w / 2, y, { color, alpha });
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
      fillAlpha = 0.55;
      textAlpha = 0.9;
      borderColor = MATE_PAL.steel;
      borderAlpha = 0.7;
      break;
    case "locked":
      fillAlpha = 0.28;
      textAlpha = 0.5;
      borderColor = MATE_PAL.slate;
      borderAlpha = 0.4;
      break;
  }

  surface.rect(x - NODE_BORDER, y - NODE_BORDER, w + NODE_BORDER * 2, h + NODE_BORDER * 2, borderColor, borderAlpha);
  surface.rect(x, y, w, h, NODE_TYPE_COLOR[node.type], fillAlpha);

  const glyphLine = (state === "visited" ? STRINGS.visitedPrefix : "") + NODE_GLYPH[node.type];
  drawCenteredText(surface, glyphLine, cx, cy - 9, MATE_PAL.white, textAlpha);
  if (node.type !== "rest") {
    drawCenteredText(surface, `G${node.grade}`, cx, cy + 2, MATE_PAL.cream, textAlpha);
  }
}

function drawToken(surface: UISurface, pos: { cx: number; cy: number }, h: number): void {
  surface.rect(pos.cx - TOKEN_SIZE / 2, pos.cy - h / 2 - TOKEN_LIFT - TOKEN_SIZE / 2, TOKEN_SIZE, TOKEN_SIZE, MATE_PAL.gold, 1);
}

function drawChrome(surface: UISurface, run: RunView): void {
  drawText(surface, STRINGS.mapTitle, 24, 12, { color: MATE_PAL.gold, scale: 2 });

  drawText(surface, STRINGS.warriorHpLabel, 24, HP_BAR_Y, { color: MATE_PAL.cream });
  surface.rect(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, MATE_PAL.navy);
  const pct = run.warriorMaxHp > 0 ? clamp01(run.warriorHp / run.warriorMaxHp) : 0;
  const fillW = Math.round(HP_BAR_W * pct);
  if (fillW > 0) surface.rect(HP_BAR_X, HP_BAR_Y, fillW, HP_BAR_H, MATE_PAL.green);
  drawText(surface, `${run.warriorHp}/${run.warriorMaxHp}`, HP_BAR_X + HP_BAR_W + 10, HP_BAR_Y, {
    color: MATE_PAL.cream,
  });
}

function drawLegend(surface: UISurface): void {
  const y = MAP_H - CHROME_BOTTOM + 16;
  let x = 24;
  drawText(surface, STRINGS.legendTitle, x, y, { color: MATE_PAL.steel });
  x += measureText(STRINGS.legendTitle) + 12;
  for (const type of LEGEND_ORDER) {
    const text = `${NODE_GLYPH[type]} ${STRINGS.legendLabel[type]}`;
    drawText(surface, text, x, y, { color: NODE_TYPE_COLOR[type] });
    x += measureText(text) + 16;
  }
}

/** The custom-drawn spatial map screen — no retained widget tree, no `computeLayout`/`renderTree`.
 * `main.ts` owns click→`choose-node` (via `nodeAt`) now, so `createMapScreen` takes no actions. */
export interface MapScreen {
  /** Draw the whole map for this frame. Call between `surface.begin()`/`end()`. */
  render(surface: UISurface, run: RunView, hoverId: number | null): void;
  /** Node id whose marker contains `(x, y)` in CSS-logical px, else `null`. Reads the layout built
   * by the most recent `render()` call. */
  nodeAt(x: number, y: number): number | null;
  /** Reachable node ids in a stable order (col asc, then row asc) for `main.ts`'s `1..9` keyboard
   * selection. A pure function of `run` — does not need a prior `render()` call. */
  reachableOrder(run: RunView): number[];
}

export function createMapScreen(): MapScreen {
  let layout: ReadonlyMap<number, NodeRect> = new Map();

  function render(surface: UISurface, run: RunView, hoverId: number | null): void {
    const computed = computeMapLayout(run.map);
    layout = computed.nodes;

    drawChrome(surface, run);

    const reachable = new Set(run.reachableIds);
    const visited = new Set(run.visitedIds);
    const current = currentNodeId(run);

    // --- Trails FIRST, under the nodes (brief: dotted, brightened leaving the current node). ---
    for (const node of run.map.nodes) {
      const from = computed.nodes.get(node.id);
      if (from === undefined) continue;
      for (const targetId of node.next) {
        const to = computed.nodes.get(targetId);
        if (to === undefined) continue;
        drawTrail(surface, from, to, node.id === current);
      }
    }
    // True run start (no current node yet): light up the anchor's trails to every start option.
    if (current === null) {
      for (const startId of run.map.startIds) {
        const to = computed.nodes.get(startId);
        if (to !== undefined) drawTrail(surface, { ...computed.anchor, w: 0, h: 0 }, to, true);
      }
    }

    // --- Nodes ------------------------------------------------------------------------------
    for (const node of run.map.nodes) {
      const rect = computed.nodes.get(node.id);
      if (rect === undefined) continue;
      const state: NodeState = visited.has(node.id) ? "visited" : reachable.has(node.id) ? "reachable" : "locked";
      drawNode(surface, rect, node, state, hoverId === node.id);
    }

    // --- Party token --------------------------------------------------------------------------
    if (current !== null) {
      const rect = computed.nodes.get(current);
      if (rect !== undefined) drawToken(surface, rect, rect.h);
    } else {
      drawToken(surface, computed.anchor, 0);
    }

    drawLegend(surface);
  }

  function nodeAt(x: number, y: number): number | null {
    for (const [id, r] of layout) {
      if (x >= r.cx - r.w / 2 && x <= r.cx + r.w / 2 && y >= r.cy - r.h / 2 && y <= r.cy + r.h / 2) {
        return id;
      }
    }
    return null;
  }

  function reachableOrder(run: RunView): number[] {
    const byId = new Map(run.map.nodes.map((n) => [n.id, n] as const));
    return [...run.reachableIds].sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      if (na.col !== nb.col) return na.col - nb.col;
      return na.row - nb.row;
    });
  }

  return { render, nodeAt, reachableOrder };
}
