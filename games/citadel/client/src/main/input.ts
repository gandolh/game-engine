import {
  fitCameraToCanvas,
  clampZoom,
  eventToDevicePx,
  screenToWorld,
  transformOf,
  screenToTile,
} from "../render/citadel-renderer";
import { nearestVillager } from "../render/citadel-fx";
import { COVERAGE_SERVICE, serviceRadius, housesInRadius } from "../render/coverage";
import { MINIMAP_FACE } from "../ui/minimap";
import {
  canvas,
  a11yMount,
  inspectA11yMount,
  buildBarA11yMount,
  settingsA11yMount,
  newGameA11yMount,
} from "./dom";
import { camera, iso, inputReady } from "./renderer-state";
import { placementState } from "./placement-wiring";
import { terrain } from "./terrain";
import { toasts } from "./hud-wiring";
import { currentBuildings, currentVillagers, client } from "./sim-client";
import { uiDispatcher, a11yMirror, siegeDispatcher } from "./hud-panels";
import { inspectDispatcher, inspectMirror, inspectOpen, closeInspect, openInspectAtTile } from "./inspect";
import {
  villagerPanel,
  villagerDispatcher,
  buildBarDispatcher,
  buildBarMirror,
  followId,
  setFollowId,
  clearFollow,
  updateModeLabel,
} from "./build-controls";
import { settingsDispatcher, settingsMirror, settingsModal, closeSettings } from "./settings";
import { newGameDispatcher, newGameMirror, newGameOpen } from "./new-game";
import { minimap } from "./minimap-wiring";

// engine-ui chunk 7: the in-canvas HUD gets first dibs on pointer/wheel/key events. These
// CAPTURE-phase listeners run before the world (bubble-phase) handlers below; if the UI
// dispatcher consumes the event we stopImmediatePropagation so the world never also acts
// (e.g. clicking a HUD button must NOT also place a building / pick a villager).
//
// Coordinates: the UISurface + computeLayout work in CSS LOGICAL px (canvas-relative,
// top-left origin) — the same space the renderer's UI seam uses (NOT device px). So we
// convert with clientX − rect.left and DO NOT multiply by dpr.
function eventToCssPx(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function pointerButtonOf(e: MouseEvent): "primary" | "secondary" | "auxiliary" {
  return e.button === 2 ? "secondary" : e.button === 1 ? "auxiliary" : "primary";
}
// Pointer "capture" semantics: the OWNER of a pointer gesture is decided at PRESS, not
// per-event. `uiPressActive` is true while a gesture whose mousedown the UI consumed is in
// flight; it (not a per-event hit-test) decides whether the world is blocked for the move/up/
// click of THAT gesture. This fixes three bugs the old hit-test-per-event logic caused:
//   - pan stutter when the cursor merely hovered the HUD mid-pan,
//   - lost road/wall drags released over the HUD,
//   - clicks mis-routed because the release point (not the press) was hit-tested.
let uiPressActive = false;
// Tracks whether the gesture whose `click` is about to fire was UI-owned (set in mouseup just
// before the gesture's click). Lets the click handler suppress the world click only for
// UI-initiated gestures — NOT based on hit-testing the release point.
let uiGestureWasUI = false;
// Inspect chunk 2: the inspect panel is a THIRD UI root. We forward every pointer/key event
// to BOTH dispatchers (HUD + inspect) and treat the gesture as UI-owned if EITHER consumed it,
// so a click on the inspect panel (e.g. its ✕) never falls through to place/demolish in the
// world. The inspect dispatcher returns null root while closed → it reports `consumed: false`,
// so this is inert when no building is selected.
canvas.addEventListener("mousedown", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  // Brief 103: the new-game picker outranks every other root. While it is up the sim has not been
  // inited (no snapshot, no world to act on), so it takes the press and NOTHING else sees it — not
  // the HUD, not the build bar, not the world. Same "truly modal" swallow the settings modal does,
  // but total: no other dispatcher is even forwarded to.
  if (newGameOpen()) {
    newGameDispatcher?.pointerDown(x, y, btn);
    newGameMirror?.setFocus(newGameDispatcher?.focused()?.id ?? null);
    uiPressActive = true; // the release belongs to this gesture too (activates the pressed button)
    e.stopImmediatePropagation();
    return;
  }
  // Settings modal: while open it overlays everything, so it gets first refusal on a press —
  // and a press anywhere while it's open should not fall through to the world (it's modal).
  const settingsC = settingsDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  const hudC = uiDispatcher.pointerDown(x, y, btn).consumed;
  const inspectC = inspectDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // FIX B: forward to the villager-panel dispatcher too (inert while not following). A press on
  // its rect is UI-owned so the world doesn't start a placement/drag underneath the panel.
  const villagerC = villagerDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // Chunk 1A: forward to the siege-HUD dispatcher too (mirrors FIX B) — it has no buttons, but a
  // press on its rect must still be UI-owned so it doesn't fall through to world build/pan.
  const siegeC = siegeDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // Build bar: a press on a toolbar button is UI-owned (selects a tool, never a world placement).
  const barC = buildBarDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // Minimap (top-right): a press inside its face seeks the camera and is UI-owned. Checked only
  // when the settings modal isn't intercepting (the modal can overlap the minimap corner).
  const minimapC =
    !settingsModal.isOpen() && btn === "primary" && minimap !== null
      ? minimap.trySeek(x, y, canvas.clientWidth - MINIMAP_FACE - 8, 8)
      : false;
  // Fix 1: while the settings modal is open, ALL canvas presses are UI-owned regardless of hit-
  // test result. This makes the modal truly modal — presses on the backdrop (outside the panel
  // rect but inside the canvas) can no longer pan/interact with the world, and a first-frame press
  // (before the layout pass fills node rects, so hit-test returns false) is also swallowed. We
  // still forward to settingsDispatcher FIRST (above) so modal buttons/sliders still activate.
  if (settingsC || hudC || inspectC || villagerC || siegeC || barC || minimapC || settingsModal.isOpen()) {
    // Press landed on a UI widget (or the modal is open): the UI owns this gesture. Block the
    // world so it doesn't start a placement/drag, and remember the ownership for this gesture's
    // move/up/click.
    uiPressActive = true;
    e.stopImmediatePropagation();
    // After a pointer press moves focus, mirror it into the a11y DOM of whichever root owns it.
    a11yMirror?.setFocus(uiDispatcher.focused()?.id ?? null);
    inspectMirror?.setFocus(inspectDispatcher?.focused()?.id ?? null);
    buildBarMirror?.setFocus(buildBarDispatcher?.focused()?.id ?? null);
    settingsMirror?.setFocus(settingsDispatcher?.focused()?.id ?? null);
  }
}, { capture: true });
canvas.addEventListener("mouseup", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  // Brief 103: the picker's release ACTIVATES the pressed mode button, which calls startGame() and
  // closes the picker — so `newGameOpen()` flips to false inside this very call. Capture it first,
  // and keep owning the rest of the gesture (the following `click` must not reach the world).
  if (newGameOpen()) {
    newGameDispatcher?.pointerUp(x, y, btn);
    e.stopImmediatePropagation();
    uiGestureWasUI = true;
    uiPressActive = false;
    return;
  }
  // Always forward to both so a UI press completes/activates, but only block the world when the
  // UI owns this gesture (uiPressActive). A world-owned release — even over the HUD — must reach
  // the world handler so road/wall drags commit.
  uiDispatcher.pointerUp(x, y, btn);
  inspectDispatcher?.pointerUp(x, y, btn);
  villagerDispatcher?.pointerUp(x, y, btn); // FIX B: complete any UI-owned gesture on the panel
  siegeDispatcher?.pointerUp(x, y, btn); // chunk 1A: complete any UI-owned gesture on the siege HUD
  buildBarDispatcher?.pointerUp(x, y, btn); // activate the pressed toolbar button on release
  settingsDispatcher?.pointerUp(x, y, btn); // activate a pressed modal control on release
  // Fix 1: while the modal is open every canvas release is UI-owned (mirrors the mousedown gate).
  if (uiPressActive || settingsModal.isOpen()) e.stopImmediatePropagation();
  // The gesture ends here; the `click` handler below reads `uiPressActive` first, then we
  // clear it on the next mousedown — but clear here so a stray click without a press can't
  // inherit stale ownership. (click fires after mouseup, so capture the value first.)
  uiGestureWasUI = uiPressActive || settingsModal.isOpen();
  uiPressActive = false;
}, { capture: true });
canvas.addEventListener("mousemove", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  // Brief 103: picker up → it owns hover (its buttons still light up), the world sees nothing.
  if (newGameOpen()) {
    newGameDispatcher?.pointerMove(x, y, btn);
    e.stopImmediatePropagation();
    return;
  }
  // ALWAYS forward to both so hover visuals update, but only block the world (pan/drag) when the
  // UI owns the active gesture. Mere hover must NOT block world pan/drag.
  uiDispatcher.pointerMove(x, y, btn);
  inspectDispatcher?.pointerMove(x, y, btn);
  villagerDispatcher?.pointerMove(x, y, btn); // FIX B
  siegeDispatcher?.pointerMove(x, y, btn); // chunk 1A
  buildBarDispatcher?.pointerMove(x, y, btn);
  settingsDispatcher?.pointerMove(x, y, btn); // hover visuals + slider drag while the modal is open
  lastUiX = x; lastUiY = y; // track for the build-bar hover-info hit-test (render loop)
  // Fix 1: while the modal is open every canvas move is UI-owned so a right/middle-drag started
  // when the modal was already open cannot pan the world behind it.
  if (uiPressActive || settingsModal.isOpen()) e.stopImmediatePropagation();
}, { capture: true });
canvas.addEventListener("click", (e) => {
  // Activation already happened on pointerUp. Suppress the world `click` handlers only when
  // this gesture's INITIATING mousedown was UI-consumed (a press that began on a HUD button
  // but released over the world must NOT suppress — and vice-versa).
  if (uiDispatcher === undefined) return;
  if (uiGestureWasUI) e.stopImmediatePropagation();
  uiGestureWasUI = false;
}, { capture: true });
canvas.addEventListener("wheel", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  // Brief 103: picker up → no zooming the (empty) world behind the founding choice.
  if (newGameOpen()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  const hudC = uiDispatcher.wheel(x, y, e.deltaY).consumed;
  const inspectC = inspectDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  const villagerC = villagerDispatcher?.wheel(x, y, e.deltaY).consumed ?? false; // FIX B
  const siegeC = siegeDispatcher?.wheel(x, y, e.deltaY).consumed ?? false; // chunk 1A
  const barC = buildBarDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  // Modal open: swallow wheel over its rect (don't zoom the world under the dialog).
  const settingsC = settingsDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  // Fix 1: while the modal is open ALL canvas wheel events are swallowed regardless of whether
  // the pointer lands on a modal widget — the backdrop must not zoom the world underneath.
  if (hudC || inspectC || villagerC || siegeC || barC || settingsC || settingsModal.isOpen()) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, { capture: true, passive: false });
// Keyboard: the UI consumes Tab (focus traversal) + Enter/Space (activate focused button)
// when a HUD widget is focused, so world key handlers (Escape/C) don't double-fire. Run in
// capture so it precedes the window-level world keydown listeners.
//
// IMPORTANT: when a real mirror <button> already holds DOM focus, NATIVE Tab/Enter +
// the mirror's own listeners drive things (mirror focusin → onFocusNode → dispatcher.focus,
// and the <button>'s click → node.onActivate). Intercepting here would fight that, so we
// only run the dispatcher's keyboard path when focus is NOT inside the mirror DOM (the
// canvas-focused path). Other typing targets are also skipped.
window.addEventListener("keydown", (e) => {
  if (uiDispatcher === undefined) return;
  const active = document.activeElement as HTMLElement | null;
  // Brief 103: while the picker is up it is the ONLY keyboard target — every world/HUD key handler
  // is blocked (there is no sim to drive yet). When one of its mirror <button>s holds DOM focus,
  // native Tab/Enter + the mirror's own listeners drive it, so don't fight them (same guard the
  // other mirrors get); either way the event stops here. No Escape wiring: it is not dismissable.
  if (newGameOpen()) {
    const inMirror = active !== null && newGameA11yMount !== null && newGameA11yMount.contains(active);
    if (!inMirror) {
      newGameDispatcher?.key({ key: e.key, shiftKey: e.shiftKey });
      newGameMirror?.setFocus(newGameDispatcher?.focused()?.id ?? null);
    }
    e.stopImmediatePropagation();
    return;
  }
  if (active !== null && a11yMount !== null && a11yMount.contains(active)) return;
  // Same mirror-focus guard for the inspect panel's own a11y mount: when a real inspect mirror
  // <button> holds DOM focus, native Tab/Enter + the mirror's listeners drive it — don't fight.
  if (active !== null && inspectA11yMount !== null && inspectA11yMount.contains(active)) return;
  // Same guard for the build bar's a11y mount: when a real toolbar mirror <button> holds DOM
  // focus, native Tab/Enter + the mirror's listeners drive it — don't fight them.
  if (active !== null && buildBarA11yMount !== null && buildBarA11yMount.contains(active)) return;
  // Same guard for the settings modal's a11y mount: when a real modal mirror control (button /
  // checkbox / range) holds DOM focus, native Tab/Enter/Arrow + the mirror's listeners drive it.
  if (active !== null && settingsA11yMount !== null && settingsA11yMount.contains(active)) return;
  if (active !== null && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
  const hudConsumed = uiDispatcher.key({ key: e.key, shiftKey: e.shiftKey }).consumed;
  // Forward to the inspect dispatcher too (inert/null root while closed → not consumed).
  const inspectConsumed = inspectDispatcher?.key({ key: e.key, shiftKey: e.shiftKey }).consumed ?? false;
  const barConsumed = buildBarDispatcher?.key({ key: e.key, shiftKey: e.shiftKey }).consumed ?? false;
  // Settings modal: route Tab/Enter/Space/Arrow into the modal while it's open (null root → inert).
  const settingsConsumed = settingsDispatcher?.key({ key: e.key, shiftKey: e.shiftKey }).consumed ?? false;
  if (hudConsumed || inspectConsumed || barConsumed || settingsConsumed) {
    e.preventDefault();
    e.stopImmediatePropagation();
    a11yMirror?.setFocus(uiDispatcher.focused()?.id ?? null);
    inspectMirror?.setFocus(inspectDispatcher?.focused()?.id ?? null);
    buildBarMirror?.setFocus(buildBarDispatcher?.focused()?.id ?? null);
    settingsMirror?.setFocus(settingsDispatcher?.focused()?.id ?? null);
  }
}, { capture: true });

export let lastUiX = -1;
export let lastUiY = -1;

canvas.addEventListener("mousedown", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  // Right button (2) pans the camera; left button (0) interacts/builds.
  if (e.button === 2) {
    isPanning = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    return;
  }
  if (e.button !== 0) return;
  placementState.updateCursor(e, canvas, camera, iso, terrain, currentBuildings);
  if (placementState.mode === "road" || placementState.mode === "wall") {
    placementState.startRoadDrag();
    updateModeLabel(); // show the initial drag length readout
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  if ((placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad) {
    placementState.updateCursor(e, canvas, camera, iso, terrain, currentBuildings);
    const routeBlocked = placementState.lastRouteBlocked;
    const tiles = placementState.endRoadDrag();
    if (tiles.length > 0) {
      if (placementState.mode === "wall") {
        client.sendCommand({ type: "placeWall", payload: { tiles } });
      } else {
        // Roads are drawn freehand; if the trail crosses an un-roadable tile the
        // sim will gap it there — tell the player why.
        if (routeBlocked) toasts.push("No clear road route — blocked", performance.now());
        client.sendCommand({ type: "placeRoad", payload: { tiles } });
      }
    }
    updateModeLabel(); // drag ended → drop the length readout from the label
  }
  isPanning = false;
});
canvas.addEventListener("mouseleave", () => { isPanning = false; });

canvas.addEventListener("mousemove", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  if (isPanning) {
    // Convert CSS-px mouse delta to world-px using the live GPU scale.
    // sx = canvas.width (device px) / camera.worldUnitsX. dpr maps CSS→device.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
    const sx = canvas.width / camera.worldUnitsX;
    const sy = canvas.height / camera.worldUnitsY;
    const dx = ((e.clientX - lastMouseX) * dpr) / sx;
    const dy = ((e.clientY - lastMouseY) * dpr) / sy;
    camera.setCenter(camera.centerX - dx, camera.centerY - dy);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
  placementState.updateCursor(e, canvas, camera, iso, terrain, currentBuildings);
  // Live upgrade hint: refresh the mode label as the cursor moves over buildings.
  if (placementState.mode === "upgrade") updateModeLabel();
  // Live road/wall length readout: refresh the label while a drag is in progress.
  if (placementState.isDraggingRoad) updateModeLabel();
});

canvas.addEventListener("wheel", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  e.preventDefault();
  // Zoom toward the cursor: keep the world point under the pointer fixed.
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
  const { sx, sy } = eventToDevicePx(e, canvas);
  const before = screenToWorld(transformOf(camera, canvas.width, canvas.height), sx, sy);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.setZoom(clampZoom(camera.zoom * factor));
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
  const after = screenToWorld(transformOf(camera, canvas.width, canvas.height), sx, sy);
  camera.setCenter(camera.centerX + (before.worldX - after.worldX), camera.centerY + (before.worldY - after.worldY));
}, { passive: false });

canvas.addEventListener("click", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  if (isPanning) return;
  placementState.updateCursor(e, canvas, camera, iso, terrain, currentBuildings);

  if (placementState.mode === "place") {
    const ghost = placementState.ghost();
    if (ghost !== null && ghost.valid) {
      const type = placementState.selectedType;
      client.sendCommand({
        type: "placeBuilding",
        payload: { buildingType: type, x: ghost.tileX, y: ghost.tileY },
      });
      // OpenTTD-influence: a service that reaches no homes is an invisible
      // no-op — say so. Reuses the same centre/radius the sim scores against.
      if (COVERAGE_SERVICE[type] !== undefined) {
        const cx = ghost.tileX + Math.floor(ghost.w / 2);
        const cy = ghost.tileY + Math.floor(ghost.h / 2);
        if (housesInRadius(currentBuildings, cx, cy, serviceRadius(type)) === 0) {
          toasts.push(`${type} covers 0 homes — move it closer`, performance.now());
        }
      }
    }
  } else if (placementState.mode === "demolish") {
    const { tx, ty } = placementState.cursorTile();
    client.sendCommand({ type: "demolish", payload: { x: tx, y: ty } });
  } else if (placementState.mode === "upgrade") {
    const { tx, ty } = placementState.cursorTile();
    client.sendCommand({ type: "upgradeBuilding", payload: { x: tx, y: ty } });
  }
});

// ---------------------------------------------------------------------------
// Follow-cam (brief 19): left-click a villager to lock-follow; left-click on
// empty space or Escape releases. Release-on-despawn is handled in render-loop.ts.
// (Right-click is the camera pan gesture.)
// ---------------------------------------------------------------------------

let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

/** Whether the service-coverage overlay (toggled with `C`) is on. Read by render-loop.ts. */
export let coverageOverlay = false;

/** Resolve a mouse event to the tile under the cursor (device-px → tile). */
function eventTile(e: MouseEvent): { tx: number; ty: number } {
  const { sx, sy } = eventToDevicePx(e, canvas);
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
  return screenToTile(iso, transformOf(camera, canvas.width, canvas.height), sx, sy);
}

// Right-click is the pan gesture, so suppress the browser context menu over
// the canvas (otherwise a right-drag pan pops the menu on release).
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// In idle ("none") mode, left-click resolves with this precedence (inspect chunk 2):
//   1. BUILDING under the cursor → open/replace the inspect panel (and do NOT also pick a
//      villager — a building takes precedence over a villager standing on it).
//   2. otherwise a VILLAGER under the cursor → follow-cam lock (existing behaviour).
//   3. otherwise EMPTY ground → close the inspect panel if open, else release any follow.
// (Clicks the UI consumed never reach here — the capture-phase handler stopped them.)
// Placement modes have their own `click` handler above, so only the idle case is wired here.
canvas.addEventListener("click", (e) => {
  if (isPanning) return; // tail of a pan, not a click
  if (placementState.mode !== "none") return; // placement clicks aren't follow-cam/inspect
  const { tx, ty } = eventTile(e);
  if (openInspectAtTile(tx, ty)) return; // 1: building → inspect (precedence over villager)
  const picked = nearestVillager(currentVillagers, tx, ty);
  if (picked !== null) {
    setFollowId(picked); // 2: villager → follow-cam
    // Force a layout + a11y reconcile on this (re)open, even when following a villager whose
    // job/fsm/cargo happens to match the last one followed (firstRefresh is per-LIFETIME).
    villagerPanel?.markOpened();
  } else {
    // 3: empty ground → close inspect first (if open), else release any follow.
    if (inspectOpen()) closeInspect();
    else if (followId !== null) clearFollow();
  }
});

window.addEventListener("keydown", (e) => {
  // Esc closes the inspect panel first (most recently opened transient), else releases follow.
  if (e.key !== "Escape") return;
  if (inspectOpen()) closeInspect();
  else if (followId !== null) clearFollow();
});

// `C` toggles the service-coverage overlay (OpenTTD-influence brief). Ignore it
// while typing in a form control or with a modifier held (keeps Ctrl+C copy).
window.addEventListener("keydown", (e) => {
  if (e.key !== "c" && e.key !== "C") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  coverageOverlay = !coverageOverlay;
  toasts.push(
    coverageOverlay ? "Coverage overlay ON — faith/safety/goods" : "Coverage overlay OFF",
    performance.now(),
  );
});

// Global Escape: close the settings modal if open (placement/follow Escape
// handlers above remain; this just adds modal dismissal at the window level too).
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal.isOpen()) closeSettings();
});
