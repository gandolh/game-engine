/**
 * Citadel "follow a villager" panel — a small floating in-canvas card via `@engine/ui`.
 *
 * Chunk 3 of the villager-job feature. When the player left-clicks a villager (in idle mode,
 * and only when no building is under the cursor — buildings take precedence and open the
 * INSPECT panel instead), the host locks the follow-cam onto it and opens this retained panel.
 * It supersedes the old DOM `#follow-hud` strip: it surfaces the followed villager's JOB
 * (prominent, the new Chunk-1 `VillagerSnapshot.job`) plus the context the strip showed — id,
 * fsm/activity, and carried good. Releasing the follow (Esc / click-away / despawn) closes it.
 *
 * Read-only: no buttons, so it does NOT need its own input dispatcher. It DOES keep an a11y
 * mirror so screen-reader users still get the job/id/activity/cargo readout that the in-canvas
 * card shows sighted players.
 *
 * Mirrors the `inspect-panel.ts` / `resource-hud.ts` consumer pattern: the tree is built ONCE
 * (`createVillagerPanel`) and kept across frames; `refresh(state)` re-textures the labels in
 * place from the latest snapshot and returns whether LAYOUT-AFFECTING content changed (so the
 * host can gate `computeLayout` + the a11y-mirror reconcile behind it). `markOpened()` forces
 * the next refresh to report changed so reopening on a different villager re-lays-out + re-
 * populates the mirror even when the content happens to match the last open.
 *
 * EDG32-only: every colour is an `EDG.*` constant. No DOM, no `any`, deterministic.
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";

/**
 * The live, per-frame view of the followed villager the panel renders. The host fills this
 * from the matched `VillagerSnapshot` (re-found each frame by villager id). When the villager
 * has no cargo, `carryGood` is `null` (rendered as an em dash).
 */
export interface VillagerPanelState {
  /** Stable villager id (from the snapshot). */
  id: number;
  /** Job label: farmer/miller/baker/…/idle (Chunk 1; shown readably/capitalised). */
  job: string;
  /** Current FSM/activity (idle/work/walkToWork/haulToStore/walkHome). */
  fsm: string;
  /** Carried good name, or null when empty-handed. */
  carryGood: string | null;
}

/** The retained villager panel: its root node (laid out + rendered by the host) plus refresh(). */
export interface VillagerPanel {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind every label from `state`. Call once per frame while the panel is open.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed (any label text changed), so the host
   * can gate `computeLayout` + the a11y reconcile behind it. The first call always returns
   * `true` (initial layout). `renderTree` must still run every frame.
   */
  refresh(state: VillagerPanelState): boolean;
  /**
   * Mark a closed→open transition so the NEXT `refresh` returns `true` even if the content is
   * byte-identical to the last time the panel was open. The host calls this when it (re)opens
   * the panel on a villager, guaranteeing a layout + a11y-mirror reconcile pass on every open
   * (the floating position + hidden DOM are re-applied), not just on the first lifetime refresh.
   */
  markOpened(): void;
}

/**
 * Build the retained villager-panel widget tree. The tree is created once; `refresh` mutates
 * it per frame (no re-allocation). Read-only — no buttons, no actions.
 *
 * Tree shape (top→bottom):
 *   panel(column)
 *     ├ header box(row): [titleLbl "Villager #N"]
 *     ├ jobLbl                     (prominent: the villager's job, gold)
 *     ├ fsmLbl                     ("Activity: …")
 *     ├ cargoLbl                   ("Carrying: …")
 *     └ hintLbl                    ("[Esc to release]", muted)
 */
export function createVillagerPanel(): VillagerPanel {
  const titleLbl = label("Villager", { color: EDG.cyan });
  const header = box({ direction: "row", align: "center", gap: 8 }, [titleLbl]);

  // The job is the headline of this panel (Chunk 3's whole point) — gold + larger scale.
  const jobLbl = label("", { color: EDG.gold, scale: 2 });
  const fsmLbl = label("");
  const cargoLbl = label("");
  const hintLbl = label("[Esc to release]", { muted: true });

  const root = panel({ direction: "column", gap: 6, width: 200 }, [
    header,
    jobLbl,
    fsmLbl,
    cargoLbl,
    hintLbl,
  ]);

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function refresh(state: VillagerPanelState): boolean {
    changed = false;
    setText(titleLbl, `Villager #${state.id}`);
    setText(jobLbl, jobLabel(state.job));
    setText(fsmLbl, `Activity: ${state.fsm}`);
    setText(cargoLbl, `Carrying: ${state.carryGood !== null ? titleCase(state.carryGood) : "—"}`);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  /** Force the next refresh to report changed (closed→open transition). See VillagerPanel. */
  function markOpened(): void {
    firstRefresh = true;
  }

  return { root, refresh, markOpened };
}

// ---------------------------------------------------------------------------
// Line builders (pure; tested directly via the panel's labels)
// ---------------------------------------------------------------------------

/** Capitalise a single word ("farmer" → "Farmer", "" stays ""). */
function titleCase(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/** The headline job label: capitalised, with "idle" reading as a gentle "Idle" too. */
function jobLabel(job: string): string {
  return `Job: ${titleCase(job)}`;
}
