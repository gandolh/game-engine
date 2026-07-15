import { MIN_ZOOM, MAX_ZOOM } from "@engine/core";
import type { Camera2D } from "@engine/core";
import { createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { clampZoom } from "../render/citadel-renderer";
import { SettingsModal } from "../ui/settings-modal";
import { renderToggles } from "./fx";
import { camera } from "./renderer-state";
import { citadelAudio } from "./hud-wiring";
import { settingsA11yMount, btnSettings } from "./dom";
import { client } from "./sim-client";

// ---------------------------------------------------------------------------
// Brief 25: Settings modal — tabbed (Display / Atmosphere / Simulation),
// a11y tablist with roving tabindex + keyword search. UI-only; wires the
// render-feature toggles, sim speed, and camera zoom via getters/setters.
// ---------------------------------------------------------------------------
export const settingsModal = new SettingsModal({
  toggles: [
    {
      id: "wash",
      label: "Day/night wash",
      keywords: "wash daynight tint colour color seasonal atmosphere lighting",
      get: () => renderToggles.wash,
      set: (v) => { renderToggles.wash = v; },
    },
    {
      id: "lightPool",
      label: "Night light pool",
      keywords: "light pool glow lamp night windows warm atmosphere",
      get: () => renderToggles.lightPool,
      set: (v) => { renderToggles.lightPool = v; },
    },
    {
      id: "clouds",
      label: "Cloud shadows / haze",
      keywords: "cloud shadow fog haze mist overcast fbm atmosphere weather sky",
      get: () => renderToggles.clouds,
      set: (v) => { renderToggles.clouds = v; },
    },
    {
      id: "weather",
      label: "Weather effects",
      keywords: "weather rain snow particles storm fx atmosphere",
      get: () => renderToggles.weather,
      set: (v) => { renderToggles.weather = v; },
    },
    {
      id: "ambientCrowd",
      label: "Ambient crowd",
      keywords: "crowd pedestrians villagers people ambient bustle atmosphere",
      get: () => renderToggles.ambientCrowd,
      set: (v) => { renderToggles.ambientCrowd = v; },
    },
    {
      id: "smoke",
      label: "Chimney smoke",
      keywords: "smoke chimney bakery smith woodcutter particles atmosphere",
      get: () => renderToggles.smoke,
      set: (v) => { renderToggles.smoke = v; },
    },
  ],
  setSpeed: (n) => client.setSpeed(n),
  // `camera` is assigned asynchronously by boot.ts (renderer-state.ts's setRendererState); the
  // in-canvas SettingsModal constructor reads getZoom() eagerly (to seed the zoom slider) at
  // module load — BEFORE boot runs — so guard against the undefined camera. Falls back to 1×
  // until the camera exists; the modal resyncs from live state on every show() anyway.
  getZoom: () => (camera as Camera2D | undefined)?.zoom ?? 1,
  setZoom: (z) => { (camera as Camera2D | undefined)?.setZoom(clampZoom(z)); },
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  audioMuted: {
    get: () => citadelAudio.muted,
    set: (v) => { citadelAudio.muted = v; },
  },
});

// Settings modal (DOM-overlay removal): a SIXTH in-canvas UI root — the tabbed settings
// dialog (Display / Atmosphere / Simulation), centred + rendered over everything while open
// (supersedes the DOM modal). Its OWN dispatcher (root null while closed → inert) + a11y
// mirror (a fifth hidden mount), wired by initSettingsDispatcher() once the a11y mount + camera
// exist.
export let settingsDispatcher: InputDispatcher | undefined;
export let settingsMirror: A11yMirror | undefined;
// Tracks whether the settings modal had its post-open layout/mirror reconcile run, so a fresh
// open re-syncs the (just-mutated) control state into the a11y view exactly once. (Note: no
// code currently branches on this flag's value — both writers just set it — but the writes
// are preserved verbatim per the original's "kept for the openSettings() gate" comment below.)
let settingsLaidOut = false;
export function setSettingsLaidOut(v: boolean): void {
  settingsLaidOut = v;
}

/**
 * Settings modal (DOM-overlay removal): wire its dispatcher (root null while closed → inert)
 * + a11y mirror in its own hidden mount (#ui-a11y-settings), so its Tab order is distinct.
 * Called once from boot.ts.
 */
export function initSettingsDispatcher(): void {
  settingsDispatcher = createInputDispatcher(() => (settingsModal.isOpen() ? settingsModal.root : null));
  if (settingsA11yMount !== null) {
    settingsMirror = createA11yMirror(settingsA11yMount, {
      rootLabel: "Settings",
      onFocusNode: (id) => {
        if (settingsDispatcher === undefined) return;
        if (id === null) settingsDispatcher.blur();
        else settingsDispatcher.focus(id);
      },
    });
  }
}

// Open/close the in-canvas settings modal. `show()` resyncs the controls from live state but
// does NOT relayout/render or touch the a11y mirror — so on every (re)open we drop the
// laid-out flag, and the render loop runs one layout + mirror reconcile to push the synced
// state to the screen + AT view. On close we clear the modal's a11y mirror so its hidden DOM
// stops advertising controls that are no longer visible.
export function openSettings(): void {
  settingsModal.show();
  settingsLaidOut = false;
}
export function closeSettings(): void {
  settingsModal.close();
  settingsMirror?.update(null);
}
export function toggleSettings(): void {
  if (settingsModal.isOpen()) closeSettings();
  else openSettings();
}

btnSettings.addEventListener("click", () => toggleSettings());
