/**
 * MateQuest M3 — the run-over screen (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md,
 * Part B): a banner ("Ai învins!" on `"run_won"` / "Ai pierdut" on `"run_lost"`) plus a single
 * "Rulare nouă" (New run) button that posts `new-run`. A retained `@engine/ui` tree built ONCE
 * (`createRunOverScreen`), mirroring `combat-screen.ts`'s banner (built-once, text rebound per
 * `refresh`).
 */
import { button, label, panel } from "@engine/ui";
import type { ContainerNode } from "@engine/ui";
import type { RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { STRINGS } from "../strings";

/** Actions the screen's button invokes — wired once at creation. */
export interface RunOverScreenActions {
  newRun(): void;
}

/** The retained run-over screen: its root node plus `refresh()`. */
export interface RunOverScreen {
  readonly root: ContainerNode;
  /** Re-bind the banner text + the warrior's final HP from the latest run outcome. Call once per
   * frame. Returns `true` when content changed (mirrors `combat-screen.ts`'s `refresh`). */
  refresh(mode: "run_won" | "run_lost", run: RunView): boolean;
}

export function createRunOverScreen(actions: RunOverScreenActions): RunOverScreen {
  const bannerLbl = label("", { color: MATE_PAL.gold, scale: 3 });
  const summaryLbl = label("", { color: MATE_PAL.cream });
  const newRunBtn = button(STRINGS.newRun, { onActivate: () => actions.newRun() });
  const root = panel({ direction: "column", gap: 16, align: "center", padding: 24 }, [
    bannerLbl,
    summaryLbl,
    newRunBtn,
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(mode: "run_won" | "run_lost", run: RunView): boolean {
    changed = false;

    const nextBanner = mode === "run_won" ? STRINGS.runWon : STRINGS.runLost;
    if (bannerLbl.text !== nextBanner) {
      bannerLbl.text = nextBanner;
      changed = true;
    }

    const nextSummary = `${run.visitedIds.length} nodes visited — Warrior HP: ${run.warriorHp}/${run.warriorMaxHp}`;
    if (summaryLbl.text !== nextSummary) {
      summaryLbl.text = nextSummary;
      changed = true;
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
