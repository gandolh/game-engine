import { createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { createInspectPanel } from "../ui/inspect-panel";
import type { InspectPanel } from "../ui/inspect-panel";
import { buildingAtTile } from "../ui/selection";
import type { BuildingSelection } from "../ui/selection";
import { inspectA11yMount } from "./dom";
import { currentBuildings, client } from "./sim-client";

// Inspect panel (Citadel inspect chunk 2): a SECOND in-canvas UI root that floats over the
// world describing the selected building. It shares the same `uiSurface` (rendered after the
// HUD) but gets its OWN input dispatcher + a11y mirror (a second hidden mount), each inert
// while closed. `inspectSelection` keys the selection by footprint origin (buildings have no
// stable id); the live snapshot is re-found each frame via `findSelected` (render-loop.ts).
export let inspectPanel: InspectPanel | undefined;
export let inspectDispatcher: InputDispatcher | undefined;
export let inspectMirror: A11yMirror | undefined;
export let inspectSelection: BuildingSelection | null = null;

/** Whether the inspect panel is currently open (drives its dispatcher/mirror gating). */
export function inspectOpen(): boolean {
  return inspectSelection !== null;
}

/**
 * Close the inspect panel (Esc / click-away / ✕ button / vanished selection). Clears the a11y
 * mirror on EVERY close path so the hidden #ui-a11y-inspect DOM stops advertising the closed
 * building (its Upgrade/✕ buttons must leave the Tab order the moment the panel is gone).
 */
export function closeInspect(): void {
  inspectSelection = null;
  inspectMirror?.update(null);
}

/** Open the inspect panel on the building whose footprint contains (tx,ty), if any. */
export function openInspectAtTile(tx: number, ty: number): boolean {
  const b = buildingAtTile(currentBuildings, tx, ty);
  if (b === null) return false;
  inspectSelection = { x: b.x, y: b.y };
  // Force a layout + mirror reconcile on this closed→open transition even if the building's
  // content is byte-identical to the last time it was inspected (firstRefresh is per-LIFETIME,
  // not per-open). Guarantees the floating position + hidden DOM are (re)applied on every open.
  inspectPanel?.markOpened();
  return true;
}

/**
 * Inspect chunk 2: the floating inspect panel as a THIRD UI root. Its OWN dispatcher returns
 * null root while closed (`inspectOpen()` false) → inert, so forwarding events to it is safe.
 * Its OWN a11y mirror lives in a SEPARATE hidden mount (#ui-a11y-inspect) so its DOM subtree
 * and Tab order are distinct from the HUD's; `inspectMirror.update(null)` clears it on close.
 * Upgrade button drives the SAME command the old DOM `#btn-upgrade` tool issued
 * ({ type: "upgradeBuilding", payload: { x, y } }), targeting the selected footprint origin.
 * The sim host re-validates ownership / tier / max-level / affordability; the panel only
 * disables the button when at max or unaffordable. Called once from boot.ts.
 */
export function initInspectPanel(): void {
  inspectPanel = createInspectPanel({
    close: closeInspect,
    upgrade: () => {
      if (inspectSelection === null) return;
      client.sendCommand({
        type: "upgradeBuilding",
        payload: { x: inspectSelection.x, y: inspectSelection.y },
      });
    },
    // Phase G (cozy pivot #8): the tiny trade-offer menu in the tradingpost's inspect panel.
    // Brief 97/21: sends the offer's CONTENT, not its position — `traderOffers` re-rolls daily,
    // so a positional index captured at click time could race the re-roll and resolve to a
    // different offer server/worker-side. The sim matches by content against its live menu and
    // no-ops if it's gone.
    trade: (offer) => {
      client.sendCommand({ type: "trade", payload: offer });
    },
  });
  inspectDispatcher = createInputDispatcher(() => (inspectOpen() ? inspectPanel?.root ?? null : null));
  if (inspectA11yMount !== null) {
    inspectMirror = createA11yMirror(inspectA11yMount, {
      rootLabel: "Building inspector",
      onFocusNode: (id) => {
        if (inspectDispatcher === undefined) return;
        if (id === null) inspectDispatcher.blur();
        else inspectDispatcher.focus(id);
      },
    });
  }
}
