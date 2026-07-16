import { UISurface, createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { createResourceHud } from "../ui/resource-hud";
import type { ResourceHud } from "../ui/resource-hud";
import type { SiegeHud } from "../ui/siege-hud";
import { createStatusPanel } from "./status-panel";
import { createPanelPrefs } from "./panel-prefs";
import { renderer } from "./renderer-state";
import { a11yMount, siegeA11yMount } from "./dom";
import { togglePause, setSpeedAndResume } from "./sim-client";

// engine-ui chunk 7: the in-canvas top HUD bar (resource readout + speed/pause), the
// screen-space UI surface over the renderer, the canvas-space input dispatcher, and the
// hidden a11y mirror. All created by initResourceHud() (called from boot.ts) once the
// renderer + font atlas exist.
export let hud: ResourceHud | undefined;
export let uiSurface: UISurface | undefined;
export let uiDispatcher: InputDispatcher | undefined;
export let a11yMirror: A11yMirror | undefined;

/**
 * engine-ui chunk 7: register the in-canvas HUD, wire its render/input/a11y plumbing.
 *  - createResourceHud wires the speed/pause buttons' onActivate to the SAME command
 *    functions the old DOM handlers used (togglePause / setSpeedAndResume).
 *  - the UISurface wraps the renderer's screen-space UI seam.
 *  - the input dispatcher hit-tests the laid-out tree (fed lazily so a rebuild is safe).
 *  - the a11y mirror reflects the tree into hidden DOM; its focus bridge forwards mirror
 *    focus into the dispatcher (and the loop's setFocus mirrors it back).
 * Called once from boot.ts after the atlases are loaded.
 */
export function initResourceHud(): void {
  hud = createResourceHud({ togglePause, setSpeed: setSpeedAndResume });
  uiSurface = new UISurface(renderer);
  uiDispatcher = createInputDispatcher(() => hud?.root ?? null);
  if (a11yMount !== null) {
    a11yMirror = createA11yMirror(a11yMount, {
      rootLabel: "Settlement HUD",
      onFocusNode: (id) => {
        // uiDispatcher is assigned just above, before any mirror focus event can fire.
        if (uiDispatcher === undefined) return;
        if (id === null) uiDispatcher.blur();
        else uiDispatcher.focus(id);
      },
    });
  }
}

// Chunk 1A (brief 106): the siege/hazard HUD — a SECOND top-row in-canvas UI root, anchored
// directly below the resource HUD (see the dynamic `hudBottom`/`siegeHudBottom` anchoring in
// render-loop.ts's loop()). It keeps its own a11y mirror (a sixth hidden mount) so screen-reader
// users still get the threat/defense/keep/fire/disease/mode readout.
export let siegeHud: SiegeHud | undefined;
export let siegeDispatcher: InputDispatcher | undefined;
export let siegeMirror: A11yMirror | undefined;

/** `window.localStorage` can itself throw in strict-privacy browser modes (not just on get/set
 *  item) — guard the access, not just the calls, and fall back to in-memory prefs. Mirrors
 *  Farm Valley's `main/panels.ts::safeLocalStorage`. */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Todo 2026-07-15-citadel-status-collapsible-panel: shared collapsible-panel open/closed store,
// built once. Currently backs only status-panel.ts's "status" section, but lives at module scope
// (like Farm's `panelPrefs` in `main/panels.ts`) so a future collapsible panel can share the same
// store instead of inventing a second one.
const panelPrefs = createPanelPrefs(safeLocalStorage());

/**
 * Chunk 1A (brief 106) + todo 2026-07-15-citadel-status-collapsible-panel: the siege/hazard HUD
 * as a SECOND top-row UI root, now collapsible behind its "Status" toggle (built in
 * `status-panel.ts` — see that module's doc for the collapse structure + the default-OPEN
 * rationale). Called once from boot.ts, after initResourceHud().
 */
export function initSiegeHud(): void {
  siegeHud = createStatusPanel(panelPrefs);
  siegeDispatcher = createInputDispatcher(() => siegeHud?.root ?? null);
  if (siegeA11yMount !== null) {
    siegeMirror = createA11yMirror(siegeA11yMount, { rootLabel: "Siege & hazards" });
  }
}
