/**
 * Farm Valley game-over panel — final standings + season arcs + share action, rendered
 * IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `main/game-over.ts` (`createGameOverPanel`/`renderGameOver`, still present
 * but no longer mounted — a later integration chunk wires the swap) onto the retained
 * create/refresh pattern: {@link createGameOverPanel} builds the tree ONCE; `refresh(state)`
 * re-textures headline/standings/arcs/share-status labels in place. The DOM version rendered the
 * standings table as one `white-space: pre` monospace blob; the bitmap font has no proportional
 * layout either, so each standings row is built as its own fixed-content label with the same
 * padded-column text the DOM version computed — a straight text-content port, one row per label
 * so `refresh` can diff row-by-row instead of re-diffing one giant string.
 *
 * The DOM version's "copy share URL to clipboard" side effect can't live in this UI-only module
 * (it needs `location`/`navigator.clipboard`, which are host concerns) — `refresh` takes an
 * already-serialized `shareStatus` string the host sets after performing the copy from its
 * `onShare` action, mirroring how `ResourceHudActions` keeps host side effects out of the panel.
 *
 * EDG32-only.
 */
import { EDG } from "@engine/core";
import { box, button, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import type { FinalStandingRow, RunRecap } from "@farm/sim-core/snapshot";
import { formatSeed } from "./home-screen";

/** Actions the host wires into the panel's controls. */
export interface GameOverActions {
  /** "Share this run" was clicked. The host serializes the run, updates the URL/clipboard, and
   * feeds the resulting status text back in via {@link GameOverState.shareStatus} on the next
   * `refresh`. */
  onShare(): void;
}

/** The live values the panel displays. Supplied by the host from the snapshot + run descriptor. */
export interface GameOverState {
  rows: FinalStandingRow[];
  finalDay: number;
  seed: number;
  recap: RunRecap | null;
  /** Status text shown next to the share button (e.g. "copied URL to clipboard"), or "" for none. */
  shareStatus: string;
}

/** Max rows rendered — mirrors the roster size (matches Farm's fixed 21-farmer cast). */
const MAX_ROWS = 21;

/** The retained game-over panel: its root node plus refresh(). */
export interface GameOverPanel {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all labels from the latest state. Call once per frame while the panel is visible.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it. The first call always returns
   * `true` (initial layout).
   */
  refresh(state: GameOverState): boolean;
}

function cropSummary(crops: FinalStandingRow["crops"] | undefined): string {
  const entries = Object.entries(crops ?? {}) as Array<[string, number | undefined]>;
  const nonZero = entries.filter(([, qty]) => (qty ?? 0) > 0);
  if (nonZero.length === 0) return "-";
  return nonZero.map(([k, qty]) => `${k.slice(0, 1)}:${qty}`).join(" ");
}

function deltaText(d: number): string {
  if (d === 0) return "-";
  return d > 0 ? `+${d}` : `${d}`;
}

function standingLine(row: FinalStandingRow, index: number, recap: RunRecap | null): string {
  const rank = String(index + 1).padEnd(3);
  if (recap !== null) {
    const s = recap.standings[index];
    if (s !== undefined) {
      const delta = deltaText(s.midRankDelta).padEnd(4);
      const name = s.name.padEnd(9);
      const personality = s.personality.padEnd(15);
      const gold = String(s.gold).padStart(5);
      const unsold = String(row.unsoldValue).padStart(5);
      const total = String(s.totalValue).padStart(5);
      return `${rank} ${delta} ${name} ${personality} ${gold}  ${unsold}  ${total}  ${cropSummary(row.crops)}`;
    }
  }
  const name = row.name.padEnd(9);
  const personality = row.personality.padEnd(15);
  const gold = String(row.gold).padStart(5);
  const unsold = String(row.unsoldValue).padStart(5);
  const total = String(row.totalValue).padStart(5);
  return `${rank} ${name} ${personality} ${gold}  ${unsold}  ${total}  ${cropSummary(row.crops)}`;
}

/**
 * Build the retained game-over widget tree and wire the share button to `actions`. The tree is
 * created once; `refresh` mutates it per frame (no re-allocation).
 */
export function createGameOverPanel(actions: GameOverActions): GameOverPanel {
  const headlineLbl = label("", { color: EDG.gold, scale: 2 });
  const seedLbl = label("", { color: EDG.steel });

  const rowLbls: LabelNode[] = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const lbl = label("", { color: EDG.cream });
    rowLbls.push(lbl);
  }
  const standingsBox = box({ direction: "column", gap: 2 }, rowLbls);

  const winnerLbl = label("", { color: EDG.gold });

  const arcsHeaderLbl = label("Season arcs", { color: EDG.tan });
  const arcLbls: LabelNode[] = [];
  const rivalryLbls: LabelNode[] = [];
  const MAX_ARCS = 12;
  const MAX_RIVALRIES = 12;
  for (let i = 0; i < MAX_ARCS; i++) arcLbls.push(label("", { color: EDG.cream }));
  for (let i = 0; i < MAX_RIVALRIES; i++) rivalryLbls.push(label("", { color: EDG.red }));
  const arcsBox = box({ direction: "column", gap: 2 }, [...arcLbls, ...rivalryLbls]);

  const shareBtn = button("Share this run", { onActivate: () => actions.onShare() });
  const shareStatusLbl = label("", { color: EDG.steel });
  const shareRow = box({ direction: "row", gap: 12, align: "center" }, [shareBtn, shareStatusLbl]);

  const column = box({ direction: "column", gap: 10 }, [
    headlineLbl,
    seedLbl,
    standingsBox,
    winnerLbl,
    arcsHeaderLbl,
    arcsBox,
    shareRow,
  ]);
  const root = panel({ direction: "column", padding: 20 }, [column]);

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function refresh(state: GameOverState): boolean {
    changed = false;

    setText(headlineLbl, state.recap?.headline ?? "");
    setText(
      seedLbl,
      `Run #${(state.seed >>> 0).toString(16)}  (seed ${formatSeed(state.seed)})  —  final standings after ${state.finalDay} days`,
    );

    for (let i = 0; i < MAX_ROWS; i++) {
      const row = state.rows[i];
      const lbl = rowLbls[i];
      if (lbl === undefined) continue;
      setText(lbl, row !== undefined ? standingLine(row, i, state.recap) : "");
    }

    const winner = state.rows[0];
    setText(
      winnerLbl,
      winner !== undefined ? `Winner: ${winner.name} (${winner.totalValue}g total value)` : "",
    );

    const arcs = state.recap?.arcs ?? [];
    for (let i = 0; i < MAX_ARCS; i++) {
      const lbl = arcLbls[i];
      if (lbl === undefined) continue;
      setText(lbl, arcs[i] ?? "");
    }

    const rivalries = state.recap?.rivalries ?? [];
    for (let i = 0; i < MAX_RIVALRIES; i++) {
      const lbl = rivalryLbls[i];
      if (lbl === undefined) continue;
      setText(lbl, rivalries[i] ?? "");
    }

    setText(shareStatusLbl, state.shareStatus);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
