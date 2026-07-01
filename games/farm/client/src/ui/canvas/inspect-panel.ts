/**
 * Farm Valley world-anchored inspect panel — a compact card that floats ATTACHED to the followed
 * farmer in the world and tracks them as the camera pans/zooms, rendered IN-CANVAS via `@engine/ui`.
 *
 * This is the reinvention half of "render all Farm UI in-canvas" (todo decision #6 + the
 * "world-anchored panels" new-interaction): instead of a fixed screen-corner box, the inspect card
 * lives over its subject — the host positions it each frame from the farmer's world position via
 * `worldToCanvasCss` (Farm's analogue of Citadel's `tileToCanvasCss` occupancy-badge anchoring).
 *
 * DATA comes from the existing observer snapshot (no new sim state, per decision #8) — the host
 * finds the followed farmer's row and feeds it in. Content: name + personality, gold, FSM state +
 * AP, region, and the current intention (what they're doing right now).
 *
 * EDG32-only: every colour is an `EDG.*` constant.
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { personalityColor } from "../colors";

/** The live values the inspect card displays. Supplied by the host from the observer snapshot. */
export interface InspectState {
  name: string;
  personality: string;
  gold: number;
  fsm: string;
  apCurrent: number;
  apMax: number;
  region: string;
  currentIntention: string | null;
}

/** The retained inspect panel: its root node plus refresh(). */
export interface InspectPanel {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind the card's labels from the latest state. Call once per frame while a farmer is
   * followed. Returns `true` when LAYOUT-AFFECTING content changed (so the host can gate
   * computeLayout + a11y-mirror reconcile behind it); the first call always returns `true`.
   */
  refresh(state: InspectState): boolean;
}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}
function setColor(lbl: LabelNode, color: string): void {
  if (lbl.color !== color) lbl.color = color;
}

/**
 * Build the retained inspect-card widget tree. Created once; `refresh` mutates it per frame. The
 * host anchors `root` over the followed farmer each frame (world → canvas CSS px), so it tracks
 * the subject rather than sitting in a fixed corner.
 */
export function createInspectPanel(): InspectPanel {
  const nameLbl = label("", { color: EDG.cream });
  const personalityLbl = label("", { color: EDG.steel });
  const goldLbl = label("", { color: EDG.gold });
  const stateLbl = label("", { color: EDG.silver });
  const regionLbl = label("", { color: EDG.steel });
  const intentionLbl = label("", { color: EDG.tan });

  const header = box({ direction: "row", gap: 6, align: "center" }, [nameLbl, personalityLbl]);
  const root = panel({ direction: "column", gap: 2, align: "start", padding: 6 }, [
    header,
    goldLbl,
    stateLbl,
    regionLbl,
    intentionLbl,
  ]);

  let changed = false;
  let firstRefresh = true;

  function refresh(state: InspectState): boolean {
    changed = false;

    if (setText(nameLbl, state.name)) changed = true;
    if (setText(personalityLbl, `(${state.personality})`)) changed = true;
    setColor(personalityLbl, personalityColor(state.personality));
    if (setText(goldLbl, `Gold ${state.gold}`)) changed = true;
    if (setText(stateLbl, `${state.fsm}  AP ${state.apCurrent}/${state.apMax}`)) changed = true;
    if (setText(regionLbl, `at ${state.region}`)) changed = true;
    if (setText(intentionLbl, state.currentIntention !== null ? `> ${state.currentIntention}` : "")) {
      changed = true;
    }

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
