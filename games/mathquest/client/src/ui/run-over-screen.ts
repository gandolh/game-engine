/**
 * MateQuest M3 — the run-over screen (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md,
 * Part B): a banner ("Ai învins!" on `"run_won"` / "Ai pierdut" on `"run_lost"`) plus a single
 * "Rulare nouă" (New run) button that posts `new-run`. A retained `@engine/ui` tree built ONCE
 * (`createRunOverScreen`), mirroring `combat-screen.ts`'s banner (built-once, text rebound per
 * `refresh`).
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) adds a mastery readout — one
 * line per topic (RO name + `correct/attempts` + tier) from `run.mastery` — the natural place for
 * it: the run is OVER (won or lost), so this is the moment to show what was actually learned. Also
 * RO-ifies the summary line via `strings.runSummary`, fixing the pre-M4c EN literal that used to
 * live inline here.
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) adds `createRunOverScreen`'s
 * `strings` param — every label on this screen is now bound from the resolved `Strings` bundle at
 * construction; a locale toggle rebuilds this screen, like every other widget screen.
 */
import { button, label, panel } from "@engine/ui";
import type { ContainerNode } from "@engine/ui";
import type { MathTopic, RunView } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import type { Strings } from "../strings";

/** The 4 M2 topics, in the SAME fixed order `strings.topicName`/`run.mastery.topics` use —
 * mirrors `run/mastery.ts`'s own `ALL_TOPICS` (kept local since this is client code, not
 * sim-core). */
const TOPICS: readonly MathTopic[] = ["addition", "subtraction", "multiplication", "comparison"];

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

export function createRunOverScreen(actions: RunOverScreenActions, strings: Strings): RunOverScreen {
  const bannerLbl = label("", { color: MATE_PAL.gold, scale: 3 });
  const summaryLbl = label("", { color: MATE_PAL.cream });
  // M4c: one label per topic, built ONCE (the topic set is fixed) — text rebound per refresh, same
  // build-once-tree/per-frame-rebind shape as every other label on this screen.
  const masteryLbls = TOPICS.map(() => label("", { color: MATE_PAL.steel }));
  const newRunBtn = button(strings.newRun, { onActivate: () => actions.newRun() });
  const root = panel({ direction: "column", gap: 16, align: "center", padding: 24 }, [
    bannerLbl,
    summaryLbl,
    ...masteryLbls,
    newRunBtn,
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(mode: "run_won" | "run_lost", run: RunView): boolean {
    changed = false;

    const nextBanner = mode === "run_won" ? strings.runWon : strings.runLost;
    if (bannerLbl.text !== nextBanner) {
      bannerLbl.text = nextBanner;
      changed = true;
    }

    const nextSummary = strings.runSummary(run.visitedIds.length, run.warriorHp, run.warriorMaxHp);
    if (summaryLbl.text !== nextSummary) {
      summaryLbl.text = nextSummary;
      changed = true;
    }

    // M4c: mastery survives death — the SAME store shows on a run_lost as a run_won (folded in by
    // sim-bootstrap.ts's resolveCombatIfOver on every fight end, win or loss).
    TOPICS.forEach((topic, i) => {
      const lbl = masteryLbls[i]!;
      const next = strings.masteryLine(topic, run.mastery.topics[topic]);
      if (lbl.text !== next) {
        lbl.text = next;
        changed = true;
      }
    });

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
