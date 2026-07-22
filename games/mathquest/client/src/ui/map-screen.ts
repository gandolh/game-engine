/**
 * MateQuest M3 — the branching map screen (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md,
 * Part B). A retained `@engine/ui` widget tree built ONCE (`createMapScreen`) and mutated per
 * frame by `refresh(run)` from the latest `RunView` — mirrors `ui/combat-screen.ts`'s
 * retained-tree + `refresh` + deferred `drawChips`/`drawBars` pattern (which itself mirrors
 * Citadel's `resource-hud.ts` and Farm's `slate-billboard.ts`).
 *
 * The map's actual node COUNT/shape varies run to run (`run/map.ts`'s `generateMap` — 2-3 nodes
 * per row, 6 rows, ≈10-14 non-boss nodes), so this widget over-allocates a fixed
 * `MAX_ROWS` x `MAX_COLS` grid of button SLOTS up front (comfortably above the brief's ≈6x3) and
 * rebinds which underlying `MapNode` each visible slot represents every `refresh()` — the SAME
 * "fixed slot count, rebind contents" trick `combat-screen.ts` uses for its `CHOICE_SLOTS`
 * choice buttons. Unused trailing slots (a row with fewer nodes than `MAX_COLS`, or trailing
 * unused rows) are hidden by removing them from `children` (never merely dimmed — see
 * `combat-screen.ts`'s module doc on why hit-testable-but-invisible is the wrong hide).
 *
 * Edges between rows are a DELIBERATE SKIP (the M3 brief marks them "nice-to-have... adjacency-
 * by-column is an acceptable fallback"): `@engine/ui`'s layout is flexbox-lite row/column only —
 * no absolute positioning — so there's no clean way to draw a line between two arbitrary buttons'
 * centers without reaching into the layout internals. Reachability is instead conveyed the way
 * the brief's own fallback describes: which buttons are enabled (`state:"normal"`) versus
 * disabled/dimmed IS the affordance for "what can I reach from here" — a node's row/col position
 * already reads as "further down the path", and disabling everything else make the reachable set
 * unambiguous without needing a drawn edge.
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, UINode, UISurface } from "@engine/ui";
import type { MapNode, NodeType, RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

/** Comfortably above `run/map.ts`'s actual shape (6 rows of 2-3 nodes) — extra slots just stay
 * hidden if a future tuning pass grows the map within reason. */
const MAX_ROWS = 8;
const MAX_COLS = 4;

const SLOT_WIDTH = 110;
const SLOT_HEIGHT = 36;
const CHIP_HEIGHT = 4;

const HP_BAR_WIDTH = 200;
const HP_BAR_HEIGHT = 12;

/** The node-type color swatch drawn as a thin chip just under each button (`drawChips`) — the
 * ONE piece of "colored by type" the brief asks for that a themed `ButtonNode` can't carry
 * itself (it only exposes theme-driven state colors, not a per-instance tint — see
 * `combat-screen.ts`'s `drawBars` for the same custom-color-needs-a-deferred-pass precedent). */
const NODE_TYPE_CHIP_COLOR: Record<NodeType, string> = {
  combat: MATE_PAL.skyBlue,
  elite: MATE_PAL.crimson,
  rest: MATE_PAL.green,
  boss: MATE_PAL.red,
};

/** Actions the screen's buttons invoke — wired once at creation. */
export interface MapScreenActions {
  chooseNode(id: number): void;
}

interface Slot {
  readonly button: ButtonNode;
  /** The node this slot currently represents; `null` while hidden (row has fewer nodes than
   * `MAX_COLS`, or this row index is past the map's actual row count this run). */
  targetId: number | null;
  /** The node's type, kept alongside `targetId` so `drawChips` knows which color to paint —
   * `null` exactly when `targetId` is `null`. */
  type: NodeType | null;
}

function sameChildren(container: ContainerNode, next: readonly UINode[]): boolean {
  return container.children.length === next.length && container.children.every((c, i) => c === next[i]);
}

function makeSlot(actions: MapScreenActions): Slot {
  const slot: Slot = {
    button: button("", { layout: { width: SLOT_WIDTH, height: SLOT_HEIGHT } }),
    targetId: null,
    type: null,
  };
  slot.button.onActivate = () => {
    if (slot.targetId !== null) actions.chooseNode(slot.targetId);
  };
  return slot;
}

/** The retained map screen: its root node plus `refresh()` + the deferred `drawChips()` pass. */
export interface MapScreen {
  readonly root: ContainerNode;
  /** Re-bind every node slot + the warrior HP bar from the latest `RunView`. Call once per
   * frame. Returns `true` when layout-affecting content changed. */
  refresh(run: RunView): boolean;
  /** Paint the node-type color chips + the HP bar's colored fill. Call AFTER `computeLayout` +
   * `renderTree` (needs up-to-date `rect`s) and BEFORE `surface.end()`. */
  drawChips(surface: UISurface): void;
}

export function createMapScreen(actions: MapScreenActions): MapScreen {
  // --- Node grid: MAX_ROWS x MAX_COLS slots, built once, rebound every refresh -----------------
  const rows: Slot[][] = Array.from({ length: MAX_ROWS }, () =>
    Array.from({ length: MAX_COLS }, () => makeSlot(actions)),
  );
  const rowBoxes: ContainerNode[] = rows.map((slots) =>
    box({ direction: "row", gap: 12, align: "center" }, slots.map((s) => s.button)),
  );
  const gridBox = box({ direction: "column", gap: 14 }, rowBoxes);

  // --- Boss slot: its own row, visually set apart ---------------------------------------------
  const bossSlot = makeSlot(actions);
  const bossRow = box({ direction: "row", align: "center" }, [bossSlot.button]);

  // --- Legend -----------------------------------------------------------------------------------
  const legendEntries = (Object.keys(STRINGS.legendLabel) as NodeType[]).map((type) =>
    label(`${legendGlyph(type)} ${STRINGS.legendLabel[type]}`, { color: NODE_TYPE_CHIP_COLOR[type] }),
  );
  const legend = box({ direction: "row", gap: 16 }, [
    label(STRINGS.legendTitle, { color: MATE_PAL.steel }),
    ...legendEntries,
  ]);

  // --- Warrior HP bar -----------------------------------------------------------------------------
  const hpFill = box({ width: 0, height: HP_BAR_HEIGHT }, []);
  const hpTrack = box({ width: HP_BAR_WIDTH, height: HP_BAR_HEIGHT, padding: 0 }, [hpFill]);
  const hpLbl = label("", { color: MATE_PAL.cream });
  const hpRow = box({ direction: "row", gap: 8, align: "center" }, [
    label(STRINGS.warriorHpLabel, { color: MATE_PAL.cream }),
    hpTrack,
    hpLbl,
  ]);

  const titleLbl = label(STRINGS.mapTitle, { color: MATE_PAL.gold, scale: 2 });
  const root = panel({ direction: "column", gap: 12, padding: 16 }, [
    titleLbl,
    hpRow,
    gridBox,
    bossRow,
    legend,
  ]);

  let changed = false;
  let firstRefresh = true;

  function bindSlot(slot: Slot, node: MapNode | undefined, reachable: boolean, visited: boolean): void {
    const nextTargetId = node?.id ?? null;
    if (slot.targetId !== nextTargetId) {
      slot.targetId = nextTargetId;
      changed = true;
    }
    const nextType = node?.type ?? null;
    if (slot.type !== nextType) {
      slot.type = nextType;
      changed = true;
    }

    const nextLabel = node === undefined ? "" : (visited ? STRINGS.visitedPrefix : "") + STRINGS.nodeLabel(node.type, node.grade);
    if (slot.button.label !== nextLabel) {
      slot.button.label = nextLabel;
      changed = true;
    }
    const nextState = node === undefined || !reachable ? "disabled" : "normal";
    if (slot.button.state !== nextState) {
      slot.button.state = nextState;
      changed = true;
    }
  }

  function refresh(run: RunView): boolean {
    changed = false;

    const reachable = new Set(run.reachableIds);
    const visited = new Set(run.visitedIds);

    const nonBoss = run.map.nodes.filter((n) => n.id !== run.map.bossId);
    const rowNumbers = [...new Set(nonBoss.map((n) => n.row))].sort((a, b) => a - b);

    for (let r = 0; r < MAX_ROWS; r++) {
      const rowNumber = rowNumbers[r];
      const nodesInRow =
        rowNumber === undefined ? [] : nonBoss.filter((n) => n.row === rowNumber).sort((a, b) => a.col - b.col);
      for (let c = 0; c < MAX_COLS; c++) {
        const node = nodesInRow[c];
        bindSlot(rows[r]![c]!, node, node !== undefined && reachable.has(node.id), node !== undefined && visited.has(node.id));
      }
      // Hide unused trailing slots in this row entirely (never merely dim — see the module doc).
      const visibleCount = Math.min(nodesInRow.length, MAX_COLS);
      const nextChildren = rows[r]!.slice(0, visibleCount).map((s) => s.button);
      if (!sameChildren(rowBoxes[r]!, nextChildren)) {
        rowBoxes[r]!.children = nextChildren;
        changed = true;
      }
    }
    // Hide unused trailing ROWS (the map always has exactly `rowNumbers.length` non-boss rows).
    const visibleRowCount = Math.min(rowNumbers.length, MAX_ROWS);
    const nextGridChildren = rowBoxes.slice(0, visibleRowCount);
    if (!sameChildren(gridBox, nextGridChildren)) {
      gridBox.children = nextGridChildren;
      changed = true;
    }

    const bossNode = run.map.nodes.find((n) => n.id === run.map.bossId);
    bindSlot(
      bossSlot,
      bossNode,
      bossNode !== undefined && reachable.has(bossNode.id),
      bossNode !== undefined && visited.has(bossNode.id),
    );

    // Warrior HP bar.
    const pct = run.warriorMaxHp > 0 ? Math.max(0, Math.min(1, run.warriorHp / run.warriorMaxHp)) : 0;
    const width = Math.round(HP_BAR_WIDTH * pct);
    if (hpFill.layout.width !== width) {
      hpFill.layout = { ...hpFill.layout, width };
      changed = true;
    }
    const hpText = `${run.warriorHp}/${run.warriorMaxHp}`;
    if (hpLbl.text !== hpText) {
      hpLbl.text = hpText;
      changed = true;
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  function drawChips(surface: UISurface): void {
    const drawSlotChip = (slot: Slot): void => {
      if (slot.type === null) return;
      const { x, y, width, height } = slot.button.rect;
      if (width <= 0) return;
      surface.rect(x, y + height + 2, width, CHIP_HEIGHT, NODE_TYPE_CHIP_COLOR[slot.type]);
    };
    for (const row of rows) for (const slot of row) drawSlotChip(slot);
    drawSlotChip(bossSlot);

    const { x, y, width, height } = hpTrack.rect;
    surface.rect(x, y, width, height, MATE_PAL.navy);
    const { width: fw } = hpFill.rect;
    if (fw > 0) surface.rect(x, y, fw, height, MATE_PAL.green);
  }

  return { root, refresh, drawChips };
}

/** A legend entry's leading glyph — the SAME glyph `STRINGS.nodeLabel` uses for that type, minus
 * the grade suffix (rest has none to begin with). */
function legendGlyph(type: NodeType): string {
  switch (type) {
    case "combat":
      return "⚔";
    case "elite":
      return "★";
    case "rest":
      return "☾";
    case "boss":
      return "☠";
  }
}
