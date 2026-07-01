/**
 * Farm Valley leaderboard — the ranked farmer standings panel, rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `ui/leaderboard.ts` (`LeaderboardPanel`) onto the create/refresh pattern
 * established by `createResourceHud` (Citadel) / `createWorldClock` (Farm): a retained widget
 * tree built ONCE by {@link createLeaderboard}, then `refresh(state, dtMs)` re-textures rows in
 * place each frame from the latest snapshot-derived rows.
 *
 * Row identity is keyed by farmer `id` (stable across re-ranks), mirroring the DOM version's
 * `rowCache`. Rows are re-parented into rank order via array splicing (no DOM insertBefore
 * needed — `computeLayout` just walks `children` in array order).
 *
 * Score-bump animation: when a farmer's `totalValue` increases, its total label plays an
 * `easeOutBack` scale bump (1.0 → PEAK → 1.0), matching the DOM version's CSS-transform bump.
 * `@engine/ui` labels don't support a free transform, so the bump is expressed as `LabelNode.scale`
 * (the bitmap font's per-label text-scale knob) — visually the same "pop" cue. Animation time is
 * injected via `dtMs` (never a wall clock), consistent with the engine's determinism contract for
 * anything render-adjacent that still needs a frame-rate-independent driver.
 *
 * EDG32-only: rank colours mirror the DOM `RANK_COLORS` map (gold/silver/clay for 1st/2nd/3rd,
 * steel otherwise); the personality chip colour reuses `personalityColor`.
 */
import { EDG } from "@engine/core";
import { easeOutBack } from "@engine/core/animation";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { personalityColor } from "../colors";

export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}

/** Duration of the easeOutBack scale bump (1.0 -> PEAK -> 1.0), seconds. */
const BUMP_DURATION_S = 0.35;
/** Peak scale factor during the bump. */
const BUMP_PEAK_SCALE = 1.3;

const RANK_COLORS: Record<number, string> = {
  1: EDG.gold,
  2: EDG.silver,
  3: EDG.clay,
};

function rankColor(rank: number): string {
  return RANK_COLORS[rank] ?? EDG.steel;
}

interface BumpState {
  active: boolean;
  elapsed: number;
}

interface RowNodes {
  readonly root: ContainerNode;
  readonly rankLbl: LabelNode;
  readonly nameLbl: LabelNode;
  readonly personalityLbl: LabelNode;
  readonly totalLbl: LabelNode;
  readonly bump: BumpState;
  prevTotal: number;
}

/** The retained leaderboard: its root node plus refresh(). */
export interface Leaderboard {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all rows from the latest ranked rows. Call once per frame.
   *
   * @param rows Ranked leaderboard rows (rank 1 first).
   * @param dtMs Milliseconds elapsed since the last call (drives the score-bump animation only;
   *   never sim time). Defaults to 0 (no animation advance — useful for a single-shot test call).
   * @returns `true` when LAYOUT-AFFECTING content changed this call (rows added/removed/reordered,
   *   or any label text changed). Bump-only scale changes do NOT mark it changed.
   */
  refresh(rows: readonly LeaderboardRow[], dtMs?: number): boolean;
}

function buildRow(): RowNodes {
  const rankLbl = label("#0", { color: EDG.steel });
  const nameLbl = label("", { color: EDG.white });
  const personalityLbl = label("", { color: EDG.mauve });
  const totalLbl = label("0g", { color: EDG.gold });

  const root = box({ direction: "row", gap: 6, align: "center" }, [
    rankLbl,
    nameLbl,
    personalityLbl,
    totalLbl,
  ]);

  return {
    root,
    rankLbl,
    nameLbl,
    personalityLbl,
    totalLbl,
    bump: { active: false, elapsed: 0 },
    prevTotal: -1,
  };
}

/**
 * Build the retained leaderboard widget tree. The tree is created once; `refresh` mutates it per
 * frame (no re-allocation of already-known rows).
 */
export function createLeaderboard(): Leaderboard {
  const title = label("Standings", { color: EDG.white });
  const rowsBox = box({ direction: "column", gap: 4, align: "stretch" }, []);
  const root = panel({ direction: "column", gap: 6, align: "stretch" }, [title, rowsBox]);

  const rowCache = new Map<number, RowNodes>();

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }
  function setColor(lbl: LabelNode, color: string): void {
    if (lbl.color !== color) lbl.color = color;
  }

  function refresh(rows: readonly LeaderboardRow[], dtMs = 0): boolean {
    changed = false;
    const dtSec = Math.min(Math.max(dtMs, 0) / 1000, 0.1);

    const currentIds = new Set(rows.map((r) => r.id));
    for (const [id] of rowCache) {
      if (!currentIds.has(id)) {
        rowCache.delete(id);
        changed = true;
      }
    }

    rows.forEach((row, index) => {
      let nodes = rowCache.get(row.id);
      if (nodes === undefined) {
        nodes = buildRow();
        rowCache.set(row.id, nodes);
        changed = true;
      }

      // Trigger the bump when the total increased since the last refresh.
      if (nodes.prevTotal >= 0 && row.totalValue > nodes.prevTotal) {
        nodes.bump.active = true;
        nodes.bump.elapsed = 0;
      }
      nodes.prevTotal = row.totalValue;

      // Advance the bump animation (scale-only — never marks `changed`, matching the DOM
      // version's CSS-transform bump not affecting flow layout).
      if (nodes.bump.active) {
        nodes.bump.elapsed += dtSec;
        if (nodes.bump.elapsed >= BUMP_DURATION_S) {
          nodes.bump.active = false;
          nodes.bump.elapsed = 0;
          nodes.totalLbl.scale = 1;
        } else {
          const t = nodes.bump.elapsed / BUMP_DURATION_S;
          const bump =
            t < 0.5
              ? easeOutBack(t * 2) * (BUMP_PEAK_SCALE - 1)
              : (1 - (t - 0.5) * 2) * (BUMP_PEAK_SCALE - 1);
          nodes.totalLbl.scale = 1 + bump;
        }
      }

      setText(nodes.rankLbl, `#${row.rank}`);
      setColor(nodes.rankLbl, rankColor(row.rank));
      setText(nodes.nameLbl, row.name);
      setText(nodes.personalityLbl, row.personality);
      setColor(nodes.personalityLbl, personalityColor(row.personality));
      setText(nodes.totalLbl, `${row.totalValue}g`);

      if (rowsBox.children[index] !== nodes.root) {
        changed = true;
      }
    });

    // Rebuild the child order array to match `rows` exactly (cheap — rows.length is small).
    rowsBox.children = rows.map((row) => rowCache.get(row.id)!.root);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
