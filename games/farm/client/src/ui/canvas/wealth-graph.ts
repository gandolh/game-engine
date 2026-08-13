/**
 * Farm Valley wealth graph — the per-farmer gold-over-time line chart, rendered IN-CANVAS
 * via `@engine/ui`.
 *
 * Unlike `world-clock.ts` (a retained widget tree), this chart is PURE DRAWING: axes, per-
 * farmer lines, endpoint initials, and crossing markers have no `@engine/ui` widget kind (no
 * widget composition — lines aren't panels/boxes/labels). This mirrors Citadel's minimap
 * precedent (`games/citadel/client/src/ui/minimap.ts`): a "draw raw quads on a UISurface"
 * module exposing `render(surface, x, y, w, h, state)` rather than `create() → {root, refresh}`.
 *
 * It supersedes the old DOM `ui/wealth-graph/panel.ts` Canvas2D chart (since deleted). The series
 * math (`computePoints`/`detectCrossings`) is reused UNCHANGED from the retained
 * `ui/wealth-graph/compute.ts` (kept for exactly this reuse).
 *
 * Line drawing: `UISurface` has no line/stroke primitive (only axis-aligned `rect`/`sprite`),
 * so each polyline segment is drawn as a thin rotated-free axis-aligned bounding rect isn't
 * possible either (segments aren't axis-aligned in general) — instead each segment is
 * approximated by a short chain of small axis-aligned "dot" rects stepped along the segment
 * (same spirit as the minimap's "diamonds → small squares" approximation). At the panel's
 * modest pixel size this reads as a continuous line.
 *
 * Labels use the bitmap-font text draw (`drawText`/`measureText` from `@engine/ui`), never
 * `ctx.fillText` — there is no 2D context here at all.
 *
 * EDG32-only: every colour is an `EDG.*` constant (same palette the old Canvas2D chart used).
 *
 * ## Collapsible toggle (brief 117)
 * `render()` itself stays exactly as it was — stateless pure drawing; the host (chunk 4) decides
 * whether to call it at all. Collapsing lives entirely in the small retained widget produced by
 * {@link createWealthToggle}: a single `Wealth` `button()` root that flips a `PanelPrefs` entry.
 * The host owns the actual show/hide decision (call `render()` only when `isOpen()` is true);
 * this factory only tracks the button + open-state-changed signal.
 */
import { EDG } from "@engine/core";
import { button, custom, panel } from "@engine/ui";
import type { ContainerNode, CustomNode, Rect } from "@engine/ui";
import type { UISurface } from "@engine/ui/render";
import { drawText, measureText } from "@engine/ui/text";
import type { SnapshotWealthSeries } from "@farm/sim-core/snapshot";
import { personalityColor } from "../colors";
import { computePoints, detectCrossings } from "../wealth-graph/compute";
import type { ChartBounds } from "../wealth-graph/compute";
import type { PanelPrefs } from "./panel-prefs";

/**
 * Padding (px) inside the chart's `w`×`h` box reserved for axis labels. `PAD_LEFT` bounds the
 * gold-axis labels (`maxGoldText`/`zeroGoldText`, drawn right-aligned via
 * `bounds.left - 2 - measureText(text)`) — was 28, sized for the old 5px-glyph font (a 4-digit
 * `"1234g"` label measured ~27px); at the wider UNSCII font the same label measures ~41px, so
 * bumped to keep 4-5 digit gold totals from spilling past the chart's left edge.
 */
const PAD_LEFT = 44;
const PAD_RIGHT = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

/** Max spacing (px) between consecutive "dot" rects approximating a polyline segment. */
const DOT_STEP = 2;
/** Side length (px) of each line-approximating dot / crossing marker. */
const DOT_SIZE = 1.5;

/** Default chart size (px). Baked into the custom node's layout; the host positions it by
 *  `computeLayout(root, x, y)` (its anchor above the Wealth toggle is bespoke, so it stays host-side). */
const GRAPH_W = 220;
const GRAPH_H = 60;

/**
 * The wealth graph, folded into the layout system as a {@link custom} escape-hatch node (engine-ui
 * backlog item 1): the chart is still raw drawing — `UISurface` has no line primitive — but it now
 * flows through the standard `computeLayout` → `renderTree` path like every other panel instead of a
 * bespoke `render(surface, x, y, w, h, …)` post-pass. The host sets the series each frame, then lays
 * the node out at the desired anchor and renders it.
 */
export interface WealthGraph {
  /** The custom-draw node (size baked in). `computeLayout(root, x, y)` then `renderTree(surface, root)`. */
  readonly root: CustomNode;
  /** Bind the series to draw on the next `renderTree`. Call once per frame before layout/render. */
  setSeries(series: SnapshotWealthSeries[]): void;
}

/** Build the wealth graph node. Stateless draw — series/bounds are recomputed each frame. */
export function createWealthGraph(): WealthGraph {
  let series: SnapshotWealthSeries[] = [];

  const root = custom((surface, rect) => drawChart(surface, rect, series), {
    width: GRAPH_W,
    height: GRAPH_H,
  });

  function drawChart(surface: UISurface, rect: Rect, series: SnapshotWealthSeries[]): void {
    const { x, y, width: w, height: h } = rect;
    // Backing panel.
    surface.rect(x, y, w, h, EDG.black);

    const hasData = series.length > 0 && series.some((s) => s.rows.length > 0);
    if (!hasData) {
      const text = "no data yet";
      const tw = measureText(text);
      drawText(surface, text, x + (w - tw) / 2, y + h / 2, { color: EDG.steel });
      return;
    }

    const bounds: ChartBounds = {
      left: x + PAD_LEFT,
      top: y + PAD_TOP,
      right: x + w - PAD_RIGHT,
      bottom: y + h - PAD_BOTTOM,
    };

    let maxDay = 1;
    let maxGold = 1;
    for (const s of series) {
      for (const row of s.rows) {
        if (row.day > maxDay) maxDay = row.day;
        if (row.gold > maxGold) maxGold = row.gold;
      }
    }

    // Axes: left (vertical) + bottom (horizontal), each a thin rect.
    surface.rect(bounds.left, bounds.top, 1, bounds.bottom - bounds.top, EDG.ink);
    surface.rect(bounds.left, bounds.bottom, bounds.right - bounds.left, 1, EDG.ink);

    // Axis labels.
    drawText(surface, "0", bounds.left - 14, bounds.bottom + 2, { color: EDG.slate });
    const maxDayText = String(maxDay);
    drawText(
      surface,
      maxDayText,
      bounds.right - measureText(maxDayText),
      bounds.bottom + 10,
      { color: EDG.slate },
    );

    const maxGoldText = `${maxGold}g`;
    drawText(
      surface,
      maxGoldText,
      bounds.left - 2 - measureText(maxGoldText),
      bounds.top,
      { color: EDG.slate },
    );
    const zeroGoldText = "0g";
    drawText(
      surface,
      zeroGoldText,
      bounds.left - 2 - measureText(zeroGoldText),
      bounds.bottom - 7,
      { color: EDG.slate },
    );

    // Per-farmer polylines (dot-chain approximation — see module doc) + endpoint initials.
    const allPoints = computePoints(series, bounds);
    for (let i = 0; i < series.length; i++) {
      const s = series[i]!;
      const pts = allPoints[i]!;
      if (pts.length === 0) continue;

      const color = personalityColor(s.personality);
      for (let k = 0; k + 1 < pts.length; k++) {
        drawLineDots(surface, pts[k]!.x, pts[k]!.y, pts[k + 1]!.x, pts[k + 1]!.y, color);
      }
      if (pts.length === 1) {
        surface.rect(pts[0]!.x - DOT_SIZE / 2, pts[0]!.y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE, color);
      }

      const last = pts[pts.length - 1]!;
      const initial = s.name.charAt(0).toUpperCase();
      drawText(surface, initial, last.x + 2, last.y - 3, { color });
    }

    // Wealth-lead crossings — small yellow square markers.
    const crossings = detectCrossings(series);
    for (const c of crossings) {
      const cx = bounds.left + (c.crossX / maxDay) * (bounds.right - bounds.left);
      const cy = bounds.bottom - (c.crossGold / maxGold) * (bounds.bottom - bounds.top);
      surface.rect(cx - 2.5, cy - 2.5, 5, 5, EDG.yellow);
    }
  }

  return {
    root,
    setSeries(next: SnapshotWealthSeries[]): void {
      series = next;
    },
  };
}

/** Draw a straight segment from (x0,y0) to (x1,y1) as a chain of small dots (no line primitive). */
function drawLineDots(surface: UISurface, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / DOT_STEP));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    surface.rect(px - DOT_SIZE / 2, py - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE, color);
  }
}

/** The retained `Wealth` collapse toggle — a tiny widget tree of one button (see module doc). */
export interface WealthToggle {
  /** The widget tree root — a single `Wealth` button. Pass to `computeLayout` / `renderTree`. */
  readonly root: ContainerNode;
  /**
   * Consume the pending open/closed-changed flag. Call once per frame; cheap — it's a single
   * boolean read.
   * @returns `true` exactly once after the open state changed (button press or `toggleOpen()`);
   * `false` otherwise (the host gates a relayout on this).
   */
  refresh(): boolean;
  /** Toggle open/closed — identical semantics to pressing the `Wealth` button. */
  toggleOpen(): void;
  /** Whether the wealth graph is currently open (`prefs.isOpen("wealth")`). */
  isOpen(): boolean;
}

/**
 * Build the retained `Wealth` toggle-button widget. Defaults to whatever `prefs` already holds
 * for `"wealth"` (closed unless previously persisted open). The button's press handler and
 * `toggleOpen()` share one code path.
 */
export function createWealthToggle(prefs: PanelPrefs): WealthToggle {
  let dirty = false;

  function doToggle(): void {
    prefs.toggle("wealth");
    dirty = true;
  }

  const toggleBtn = button("Wealth", { onActivate: () => doToggle() });
  const root = panel({ direction: "row", gap: 0, align: "center" }, [toggleBtn]);

  function refresh(): boolean {
    if (!dirty) return false;
    dirty = false;
    return true;
  }

  return {
    root,
    refresh,
    toggleOpen: doToggle,
    isOpen: () => prefs.isOpen("wealth"),
  };
}
