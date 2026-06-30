/**
 * Citadel — browser entry point.
 *
 * Phase 3: chapel, market, watchpost, tradingpost; decrees; happiness HUD;
 *          trader panel.
 * Phase 4: quarry/sawmill/smith/mine refiners; wall (drag-paint) + gate;
 *          tower/garrison/keep defenses; threat/defense/keep HUD; raider dots.
 * Phase 5: settlement tier HUD; save/load via command-log replay (localStorage
 *          + downloadable JSON blob).
 */
import "./style.css";
import { generateTerrain, getBuildingDef, getProductionDef, TIER_LOCK, tierAtLeast, BUILDING_MAX_LEVEL, upgradeCost, buildCost, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, CitadelSave, SettlementTier, RenderSnapshot } from "@citadel/sim-core";
import { EDG, ParticleSystem, createRng, expSmooth } from "@engine/core";
import type { Camera2D, RendererLike } from "@engine/core";
import { UISurface, computeLayout, renderTree, createInputDispatcher, createA11yMirror, loadFontAtlas } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { createResourceHud } from "./ui/resource-hud";
import type { ResourceHud } from "./ui/resource-hud";
import { createInspectPanel } from "./ui/inspect-panel";
import type { InspectPanel } from "./ui/inspect-panel";
import { createVillagerPanel } from "./ui/villager-panel";
import type { VillagerPanel } from "./ui/villager-panel";
import { buildingAtTile, findSelected } from "./ui/selection";
import type { BuildingSelection } from "./ui/selection";
import { CitadelSimClient } from "./worker/sim-client";
import { CitadelServerClient } from "./worker/server-client";
import {
  createCitadelRenderer,
  fitCameraToCanvas,
  clampZoom,
  pushScene,
  pushGhost,
  pushLightPool,
  pushAmbientCrowd,
  pushWearOverlay,
  pushCatchment,
  pushDisconnectedMarkers,
  eventToDevicePx,
  screenToWorld,
  transformOf,
  screenToTile,
} from "./render/citadel-renderer";
import type { RenderWindowController } from "./render/citadel-renderer";
import {
  CitadelSmoke,
  syncAppearMap,
  buildingKey,
  placementScale,
  easeQuad,
  gaitOffset,
  nearestVillager,
  followReleaseId,
  villagerById,
} from "./render/citadel-fx";
import {
  computeWash,
  dayFractionOf,
  nightFactorOf,
  emittersOf,
  lightPoolQuads,
} from "./render/atmosphere";
import { CitadelWeather } from "./render/weather";
import { CitadelAmbientCrowd } from "./render/ambient-crowd";
import { OccupancyBadgeLayer } from "./render/occupancy-badges";
import { EntityInterpolator, snapshotAlpha } from "./render/entity-interp";
import {
  COVERAGE_SERVICE,
  serviceRadius,
  serviceTint,
  serviceCatchment,
  housesInRadius,
  coverageByNeed,
} from "./render/coverage";
import { PlacementStateManager } from "./ui/placement-state";
import { SettingsModal } from "./ui/settings-modal";
import { ToastManager, newEventsSince } from "./ui/toast";
import { CitadelMinimap } from "./ui/minimap";
import { tileToIso } from "./render/iso";
import { MIN_ZOOM, MAX_ZOOM } from "@engine/core";

const SEED = 0x1a2b3c4d;
const TICKS_PER_DAY = 20;
/**
 * Render-only day/night wash period (ticks). The sim day is very short
 * (TICKS_PER_DAY=20 ≈ 1 s of real time at 1× → the tint would strobe), so the
 * atmospheric wash is decoupled onto a much slower visual cycle: ~1800 ticks ≈
 * 90 s at 1× speed, so the map colour eases gently through dawn→dusk→night.
 * Purely cosmetic — never touches the sim or determinism.
 */
const VISUAL_DAY_TICKS = 1800;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// engine-ui chunk 7: the settlement readout (tier/day/pop/happiness), the goods strip (all
// goods) and the speed/pause controls are now rendered IN-CANVAS via @engine/ui (see resource-hud.ts +
// the HUD wiring further down), so their DOM elements are gone from index.html. The
// remaining siege/hazard readouts stay DOM for now (other todos).
// Phase 4 siege HUD
const hudThreat = document.getElementById("hud-threat")!;
const hudDefense = document.getElementById("hud-defense")!;
const hudKeep = document.getElementById("hud-keep")!;
// Phase 4.5 hazard HUD
const hudFire = document.getElementById("hud-fire")!;
const hudDisease = document.getElementById("hud-disease")!;
const btnDemolish = document.getElementById("btn-demolish")!;
const btnUpgrade = document.getElementById("btn-upgrade")!;
const btnRoad = document.getElementById("btn-build-road")!;
const btnWall = document.getElementById("btn-build-wall")!;
const btnCancel = document.getElementById("btn-cancel")!;
const lblMode = document.getElementById("lbl-mode")!;
// Phase 5: save/load UI
const btnSave = document.getElementById("btn-save")!;
const btnLoad = document.getElementById("btn-load")!;
const loadFileInput = document.getElementById("load-file-input")! as HTMLInputElement;

// Phase 3: decrees
const decreWorkHours     = document.getElementById("decree-workHours")     as HTMLInputElement;
const decreRationing     = document.getElementById("decree-rationing")      as HTMLInputElement;
const decreTithe         = document.getElementById("decree-tithe")           as HTMLInputElement;
const decreConscription  = document.getElementById("decree-conscription")   as HTMLInputElement;

// Phase 3: trader panel
const traderPanel  = document.getElementById("trader-panel")!;
const traderOffers = document.getElementById("trader-offers")!;

// Event toasts (top-center) now render IN-CANVAS via @engine/ui (toast.ts builds a
// @engine/ui column the render loop lays out + draws). Created at module scope so it
// exists before the first snapshot; #toast-live is its hidden aria-live a11y mirror.
const toasts = new ToastManager(document.getElementById("toast-live"));
let lastEventShown: string | null = null;
let minimap: CitadelMinimap | null = null;

// Per-building occupancy badges (Part B): headcount chips floated over each
// building that has people at it. DOM overlay, pooled + positioned each frame.
const occupancyBadges = new OccupancyBadgeLayer(document.getElementById("occupancy-badges")!);

// Build toolbar is icon-only (condensed for laptops); surface each button's name
// as a hover tooltip so the glyphs stay discoverable. Derives the label from the
// button text minus its icon glyph.
for (const btn of document.querySelectorAll<HTMLButtonElement>("#build-bar button")) {
  const icon = btn.querySelector(".bi")?.textContent ?? "";
  const label = (btn.textContent ?? "").replace(icon, "").trim();
  if (label !== "") btn.title = label;
}

// ---------------------------------------------------------------------------
// Camera + renderer (Camera2D + engine WebGPU renderer; created async in boot)
// ---------------------------------------------------------------------------
let camera: Camera2D;
let renderer: RendererLike;
let windowController: RenderWindowController;
// `camera`/`renderer` are assigned asynchronously in boot() (after `await
// createCitadelRenderer`), but the canvas input listeners are registered at module load. A
// pointer/wheel event arriving in that ~1s boot gap would deref an undefined `camera`
// (pan/zoom/updateCursor). World handlers bail until this flips true (set once camera exists).
let inputReady = false;

// engine-ui chunk 7: the in-canvas top HUD bar (resource readout + speed/pause), the
// screen-space UI surface over the renderer, the canvas-space input dispatcher, and the
// hidden a11y mirror. All created in boot() once the renderer + font atlas exist.
let hud: ResourceHud | undefined;
let uiSurface: UISurface | undefined;
let uiDispatcher: InputDispatcher | undefined;
let a11yMirror: A11yMirror | undefined;
// Mount host for the hidden a11y mirror DOM (an empty container in index.html). Read at
// module scope so the keydown guard can test "is focus currently inside the mirror?".
const a11yMount = document.getElementById("ui-a11y-mirror");

// Inspect panel (Citadel inspect chunk 2): a SECOND in-canvas UI root that floats over the
// world describing the selected building. It shares the same `uiSurface` (rendered after the
// HUD) but gets its OWN input dispatcher + a11y mirror (a second hidden mount), each inert
// while closed. `inspectSelection` keys the selection by footprint origin (buildings have no
// stable id); the live snapshot is re-found each frame via `findSelected`.
let inspectPanel: InspectPanel | undefined;
let inspectDispatcher: InputDispatcher | undefined;
let inspectMirror: A11yMirror | undefined;
const inspectA11yMount = document.getElementById("ui-a11y-inspect");
let inspectSelection: BuildingSelection | null = null;
/** Whether the inspect panel is currently open (drives its dispatcher/mirror gating). */
function inspectOpen(): boolean {
  return inspectSelection !== null;
}
/**
 * Close the inspect panel (Esc / click-away / ✕ button / vanished selection). Clears the a11y
 * mirror on EVERY close path so the hidden #ui-a11y-inspect DOM stops advertising the closed
 * building (its Upgrade/✕ buttons must leave the Tab order the moment the panel is gone).
 */
function closeInspect(): void {
  inspectSelection = null;
  inspectMirror?.update(null);
}
/** Open the inspect panel on the building whose footprint contains (tx,ty), if any. */
function openInspectAtTile(tx: number, ty: number): boolean {
  const b = buildingAtTile(currentBuildings, tx, ty);
  if (b === null) return false;
  inspectSelection = { x: b.x, y: b.y };
  // Force a layout + mirror reconcile on this closed→open transition even if the building's
  // content is byte-identical to the last time it was inspected (firstRefresh is per-LIFETIME,
  // not per-open). Guarantees the floating position + hidden DOM are (re)applied on every open.
  inspectPanel?.markOpened();
  return true;
}

// Villager-job chunk 3: a THIRD in-canvas UI root — the floating follow-a-villager panel.
// It shares the same `uiSurface` (rendered after the HUD + inspect panel) and supersedes the
// old DOM #follow-hud strip. Read-only (no buttons), so it has NO input dispatcher; it keeps
// its own a11y mirror (a third hidden mount) so screen-reader users get the job/id/fsm/cargo.
// Open/close is driven entirely by the follow-cam: it is open iff `followId !== null`. The
// live villager is re-found each frame by id (villagers carry a stable id).
let villagerPanel: VillagerPanel | undefined;
let villagerMirror: A11yMirror | undefined;
const villagerA11yMount = document.getElementById("ui-a11y-villager");
// Villager-job code-review FIX B: the villager panel is a `panel` (background:true), so even
// though it has no buttons it should consume clicks on its rect — otherwise a click on the
// panel falls through to the world. It gets its own dispatcher (inert while not following),
// mirroring the inspect panel's pattern. Returns null root while not following → reports
// `consumed: false`, so forwarding events to it is a no-op when the panel is hidden.
let villagerDispatcher: InputDispatcher | undefined;

// Atmosphere (render-only, off-sim): day/night wash, weather FX, ambient crowd.
const weather = new CitadelWeather();
const ambientCrowd = new CitadelAmbientCrowd();
let lastFrameMs = 0; // render clock (performance.now, MAIN-thread only — NOT sim)

// Render-only entity position interpolation: glide villagers/raiders between
// snapshot tiles instead of snapping (units step one tile per sim tick). Driven
// by the measured interval between snapshot arrivals — see entity-interp.ts.
const villagerInterp = new EntityInterpolator();
const raiderInterp = new EntityInterpolator();
let lastSnapshotMs = 0;   // render clock when the latest snapshot arrived
let snapshotIntervalMs = 0; // measured ms between the last two snapshot arrivals

// Brief 25: render-feature toggles (all default ON), driven by the settings
// modal. Each gates its layer in loop() — purely cosmetic, zero sim impact.
const renderToggles = {
  wash: true,        // day/night + seasonal wash (brief 15)
  lightPool: true,   // night light pool (brief 15)
  weather: true,     // weather particle FX (brief 16)
  ambientCrowd: true, // instanced ambient crowd (brief 18)
  smoke: true,       // chimney smoke (brief 17)
};

// Render-side juice (briefs 17 + 19). All off-sim:
//  - particles: chimney smoke, rendered by the WebGPU particle pass via endFrame
//  - fxRng: render-side RNG (seeded off a constant) for smoke jitter ONLY —
//    never the sim RNG, never Math.random in sim-construable code.
//  - appearAt: building-key → first-seen render-clock ms, for the placement ease.
const particles = new ParticleSystem();
const fxRng = createRng(0x5117_c0de);
const smoke = new CitadelSmoke(particles, fxRng);
const appearAt = new Map<string, number>();
//  - burningSince: building-key → render-clock ms a fire first started, so the
//    brief-24 soot overlay can ramp ("accumulate") while a building burns.
const burningSince = new Map<string, number>();

// Follow-cam (brief 19): id of the villager the camera is locked onto, or null.
let followId: number | null = null;

let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

const placementState = new PlacementStateManager();
// OpenTTD-influence coverage overlay (2026-06-22): toggled with `C`, tints the
// faith/safety/goods catchments across the map so gaps are visible at a glance.
let coverageOverlay = false;
let currentBuildings: readonly BuildingSnapshot[] = [];
let currentVillagers: readonly VillagerSnapshot[] = [];
let currentRaiders: readonly RaiderSnapshot[] = [];

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
// Inspect chunk 2: the inspect panel is a SECOND UI root. We forward every pointer/key event
// to BOTH dispatchers (HUD + inspect) and treat the gesture as UI-owned if EITHER consumed it,
// so a click on the inspect panel (e.g. its ✕) never falls through to place/demolish in the
// world. The inspect dispatcher returns null root while closed → it reports `consumed: false`,
// so this is inert when no building is selected.
canvas.addEventListener("mousedown", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  const hudC = uiDispatcher.pointerDown(x, y, btn).consumed;
  const inspectC = inspectDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // FIX B: forward to the villager-panel dispatcher too (inert while not following). A press on
  // its rect is UI-owned so the world doesn't start a placement/drag underneath the panel.
  const villagerC = villagerDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  if (hudC || inspectC || villagerC) {
    // Press landed on a UI widget: the UI owns this gesture. Block the world so it doesn't
    // start a placement/drag, and remember the ownership for this gesture's move/up/click.
    uiPressActive = true;
    e.stopImmediatePropagation();
    // After a pointer press moves focus, mirror it into the a11y DOM of whichever root owns it.
    a11yMirror?.setFocus(uiDispatcher.focused()?.id ?? null);
    inspectMirror?.setFocus(inspectDispatcher?.focused()?.id ?? null);
  }
}, { capture: true });
canvas.addEventListener("mouseup", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  // Always forward to both so a UI press completes/activates, but only block the world when the
  // UI owns this gesture (uiPressActive). A world-owned release — even over the HUD — must reach
  // the world handler so road/wall drags commit.
  uiDispatcher.pointerUp(x, y, btn);
  inspectDispatcher?.pointerUp(x, y, btn);
  villagerDispatcher?.pointerUp(x, y, btn); // FIX B: complete any UI-owned gesture on the panel
  if (uiPressActive) e.stopImmediatePropagation();
  // The gesture ends here; the `click` handler below reads `uiPressActive` first, then we
  // clear it on the next mousedown — but clear here so a stray click without a press can't
  // inherit stale ownership. (click fires after mouseup, so capture the value first.)
  uiGestureWasUI = uiPressActive;
  uiPressActive = false;
}, { capture: true });
canvas.addEventListener("mousemove", (e) => {
  if (uiDispatcher === undefined) return;
  const { x, y } = eventToCssPx(e);
  const btn = pointerButtonOf(e);
  // ALWAYS forward to both so hover visuals update, but only block the world (pan/drag) when the
  // UI owns the active gesture. Mere hover must NOT block world pan/drag.
  uiDispatcher.pointerMove(x, y, btn);
  inspectDispatcher?.pointerMove(x, y, btn);
  villagerDispatcher?.pointerMove(x, y, btn); // FIX B
  if (uiPressActive) e.stopImmediatePropagation();
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
  const hudC = uiDispatcher.wheel(x, y, e.deltaY).consumed;
  const inspectC = inspectDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  const villagerC = villagerDispatcher?.wheel(x, y, e.deltaY).consumed ?? false; // FIX B
  if (hudC || inspectC || villagerC) {
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
// canvas-focused path). Other typing targets (decree checkboxes, etc.) are also skipped.
window.addEventListener("keydown", (e) => {
  if (uiDispatcher === undefined) return;
  const active = document.activeElement as HTMLElement | null;
  if (active !== null && a11yMount !== null && a11yMount.contains(active)) return;
  // Same mirror-focus guard for the inspect panel's own a11y mount: when a real inspect mirror
  // <button> holds DOM focus, native Tab/Enter + the mirror's listeners drive it — don't fight.
  if (active !== null && inspectA11yMount !== null && inspectA11yMount.contains(active)) return;
  if (active !== null && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
  const hudConsumed = uiDispatcher.key({ key: e.key, shiftKey: e.shiftKey }).consumed;
  // Forward to the inspect dispatcher too (inert/null root while closed → not consumed).
  const inspectConsumed = inspectDispatcher?.key({ key: e.key, shiftKey: e.shiftKey }).consumed ?? false;
  if (hudConsumed || inspectConsumed) {
    e.preventDefault();
    e.stopImmediatePropagation();
    a11yMirror?.setFocus(uiDispatcher.focused()?.id ?? null);
    inspectMirror?.setFocus(inspectDispatcher?.focused()?.id ?? null);
  }
}, { capture: true });

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
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
  if (placementState.mode === "road" || placementState.mode === "wall") {
    placementState.startRoadDrag();
    updateModeLabel(); // show the initial drag length readout
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  if ((placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad) {
    placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
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
    fitCameraToCanvas(camera, canvas.width, canvas.height);
    const sx = canvas.width / camera.worldUnitsX;
    const sy = canvas.height / camera.worldUnitsY;
    const dx = ((e.clientX - lastMouseX) * dpr) / sx;
    const dy = ((e.clientY - lastMouseY) * dpr) / sy;
    camera.setCenter(camera.centerX - dx, camera.centerY - dy);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
  // Live upgrade hint: refresh the mode label as the cursor moves over buildings.
  if (placementState.mode === "upgrade") updateModeLabel();
  // Live road/wall length readout: refresh the label while a drag is in progress.
  if (placementState.isDraggingRoad) updateModeLabel();
});

canvas.addEventListener("wheel", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  e.preventDefault();
  // Zoom toward the cursor: keep the world point under the pointer fixed.
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  const { sx, sy } = eventToDevicePx(e, canvas);
  const before = screenToWorld(transformOf(camera, canvas.width, canvas.height), sx, sy);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.setZoom(clampZoom(camera.zoom * factor));
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  const after = screenToWorld(transformOf(camera, canvas.width, canvas.height), sx, sy);
  camera.setCenter(camera.centerX + (before.worldX - after.worldX), camera.centerY + (before.worldY - after.worldY));
}, { passive: false });

canvas.addEventListener("click", (e) => {
  if (!inputReady) return; // camera not yet created (async boot) — ignore early events
  if (isPanning) return;
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);

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
// empty space or Escape releases. Release-on-despawn is handled in the loop.
// (Right-click is the camera pan gesture.)
// ---------------------------------------------------------------------------

/** Resolve a mouse event to the tile under the cursor (device-px → tile). */
function eventTile(e: MouseEvent): { tx: number; ty: number } {
  const { sx, sy } = eventToDevicePx(e, canvas);
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  return screenToTile(transformOf(camera, canvas.width, canvas.height), sx, sy);
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
    followId = picked; // 2: villager → follow-cam
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

/**
 * Release the follow-cam and hide the in-canvas villager panel. Clears the panel's a11y mirror
 * on EVERY release path (Esc / click-away / minimap jump / despawn) so the hidden
 * #ui-a11y-villager DOM stops advertising the released villager (its readout must leave the
 * accessibility tree the moment the follow is gone).
 */
function clearFollow(): void {
  followId = null;
  villagerMirror?.update(null);
}

/** Building whose footprint contains (tx,ty) in the latest snapshot, or null. */
function buildingAt(tx: number, ty: number): BuildingSnapshot | null {
  for (const b of currentBuildings) {
    if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
  }
  return null;
}

/** Lightweight upgrade hint for the hovered building (cost + valid/locked). */
function upgradeHint(): string {
  const { tx, ty } = placementState.cursorTile();
  const b = buildingAt(tx, ty);
  if (b === null) return "Mode: Upgrade (click a building)";
  if (b.level >= BUILDING_MAX_LEVEL) return `Mode: Upgrade — ${b.type} is max level (L${b.level})`;
  const nextLevel = b.level + 1;
  const reqTier = b.level === 1 ? "Village" : "Town";
  const cost = upgradeCost(b.type, nextLevel);
  const costStr = Object.entries(cost)
    .map(([g, q]) => `${q} ${g}`)
    .join(", ");
  const locked = !tierAtLeast(peakTier as SettlementTier, reqTier);
  const status = locked ? ` [LOCKED: needs ${reqTier}]` : "";
  return `Mode: Upgrade ${b.type} → L${nextLevel} (${costStr})${status}`;
}

/**
 * While a road/wall drag is active, a " — N tiles" (with " · blocked" when the
 * route couldn't be cleared) suffix for the mode label, so the player sees the
 * run's length + legality live before releasing. Empty when not dragging.
 */
function dragLengthSuffix(): string {
  if (!placementState.isDraggingRoad) return "";
  const n = placementState.roadTiles.length;
  if (n === 0) return "";
  const blocked = placementState.lastRouteBlocked ? " · blocked" : "";
  return ` — ${n} tile${n === 1 ? "" : "s"}${blocked}`;
}

function updateModeLabel(): void {
  const mode = placementState.mode;
  if (mode === "place") lblMode.textContent = `Mode: Place ${placementState.selectedType}`;
  else if (mode === "demolish") lblMode.textContent = "Mode: Demolish";
  else if (mode === "road") lblMode.textContent = `Mode: Road (drag)${dragLengthSuffix()}`;
  else if (mode === "wall") lblMode.textContent = `Mode: Wall (drag)${dragLengthSuffix()}`;
  else if (mode === "upgrade") lblMode.textContent = upgradeHint();
  else lblMode.textContent = "Mode: None";
  highlightActiveBuildButton();
}

/**
 * Highlight the build-toolbar button matching the active placement mode so the
 * current tool is visually obvious (selection used to live only in the text
 * label). `place` maps to the selected building's button; the standalone modes
 * map to their dedicated buttons. `none` clears all highlights.
 */
function highlightActiveBuildButton(): void {
  const active: HTMLElement | null =
    placementState.mode === "place"
      ? buildButtonsByType.get(placementState.selectedType) ?? null
      : placementState.mode === "road"
        ? btnRoad
        : placementState.mode === "wall"
          ? btnWall
          : placementState.mode === "demolish"
            ? btnDemolish
            : placementState.mode === "upgrade"
              ? btnUpgrade
              : null;
  for (const btn of buildModeButtons) btn.classList.toggle("selected", btn === active);
}

function selectBuild(type: string): void {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "place";
  placementState.selectedType = type;
  const def = getBuildingDef(type);
  if (def !== undefined) placementState.setFootprint(def.w, def.h);
  const prod = getProductionDef(type);
  placementState.setRequiresForest(prod?.terrainReq === "forest");
  placementState.setRequiresStone(prod?.terrainReq === "stone");
  updateModeLabel();
}

const BUILD_BUTTONS: ReadonlyArray<readonly [string, string]> = [
  ["btn-build-house",        "house"],
  ["btn-build-farm",         "farm"],
  ["btn-build-mill",         "mill"],
  ["btn-build-bakery",       "bakery"],
  ["btn-build-woodcutter",   "woodcutter"],
  ["btn-build-storehouse",   "storehouse"],
  // Phase 3 service buildings
  ["btn-build-town-hall",    "town-hall"],
  ["btn-build-chapel",       "chapel"],
  ["btn-build-market",       "market"],
  ["btn-build-watchpost",    "watchpost"],
  ["btn-build-tradingpost",  "tradingpost"],
  // Phase 4 refiners + siege structures
  ["btn-build-quarry",       "quarry"],
  ["btn-build-sawmill",      "sawmill"],
  ["btn-build-smith",        "smith"],
  ["btn-build-mine",         "mine"],
  ["btn-build-gate",         "gate"],
  ["btn-build-tower",        "tower"],
  ["btn-build-garrison",     "garrison"],
  ["btn-build-keep",         "keep"],
  // Phase 4.5 hazard mitigation
  ["btn-build-well",         "well"],
  ["btn-build-healer",       "healer"],
];
/** DOM elements for tier-lockable build buttons, keyed by building type. */
const buildButtonsByType = new Map<string, HTMLButtonElement>();
for (const [id, type] of BUILD_BUTTONS) {
  const btn = document.getElementById(id);
  if (btn !== null) {
    btn.addEventListener("click", () => selectBuild(type));
    buildButtonsByType.set(type, btn as HTMLButtonElement);
  }
}
// The wall button drives a "wall" placement type and is tier-locked too.
buildButtonsByType.set("wall", btnWall as HTMLButtonElement);

/**
 * Every toolbar button that maps to a placement mode — used to toggle the
 * `.selected` highlight. Includes the type buttons plus the standalone
 * road/demolish/upgrade tools (wall is already in buildButtonsByType).
 */
const buildModeButtons: HTMLElement[] = [
  ...buildButtonsByType.values(),
  btnRoad,
  btnDemolish,
  btnUpgrade,
];

/** "4 wood, 2 stone" (or "free") — the material cost of placing `type`. */
function costLabel(type: string): string {
  const entries = Object.entries(buildCost(type));
  return entries.length === 0 ? "free" : entries.map(([g, q]) => `${q} ${g}`).join(", ");
}

/** Can the player currently afford `type` from the live stockpile? */
function canAffordBuild(type: string): boolean {
  for (const [g, q] of Object.entries(buildCost(type))) {
    if ((stockpiles[g] ?? 0) < (q ?? 0)) return false;
  }
  return true;
}

/**
 * Refresh each build button's disabled state + tooltip from the live snapshot:
 *  - tier-locked types (settlement tier not yet reached) → greyed, "Requires <tier>";
 *  - otherwise, when solo build costs are on, unaffordable types → greyed,
 *    "<type> — needs <cost>" (re-enabled live as the stockpile grows);
 *  - affordable / free → enabled, tooltip shows the cost on hover.
 * Buttons stay VISIBLE so the player can see the cost + what climbing the ladder unlocks.
 * Mirrors the sim-side reject guards (tier + cost) — defense in depth.
 */
function refreshBuildButtonLocks(): void {
  for (const [type, btn] of buildButtonsByType) {
    const required = TIER_LOCK[type];
    const cost = CHARGE_BUILD_COST ? costLabel(type) : null;
    if (required !== undefined && !tierAtLeast(peakTier as SettlementTier, required)) {
      btn.disabled = true;
      btn.classList.add("tier-locked");
      btn.classList.remove("unaffordable");
      btn.title = cost !== null ? `${type} — requires ${required} (costs ${cost})` : `Requires ${required}`;
    } else if (CHARGE_BUILD_COST && !canAffordBuild(type)) {
      btn.disabled = true;
      btn.classList.remove("tier-locked");
      btn.classList.add("unaffordable");
      btn.title = `${type} — needs ${cost}`;
    } else {
      btn.disabled = false;
      btn.classList.remove("tier-locked");
      btn.classList.remove("unaffordable");
      btn.title = cost !== null ? `${type} — costs ${cost}` : "";
    }
  }
}

btnRoad.addEventListener("click", () => {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "road";
  placementState.setRequiresForest(false);
  placementState.setRequiresStone(false);
  updateModeLabel();
});
btnWall.addEventListener("click", () => {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "wall";
  placementState.setRequiresForest(false);
  placementState.setRequiresStone(false);
  updateModeLabel();
});
btnDemolish.addEventListener("click", () => {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "demolish";
  updateModeLabel();
});
btnUpgrade.addEventListener("click", () => {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "upgrade";
  updateModeLabel();
});
btnCancel.addEventListener("click", () => {
  placementState.mode = "none";
  updateModeLabel();
});

// ---------------------------------------------------------------------------
// Phase 5: Save / Load
// ---------------------------------------------------------------------------

/**
 * Download the current save as a JSON file.
 * Uses Date.now() for the filename only (not in sim code — UI thread only).
 */
btnSave.addEventListener("click", () => {
  client.requestSave((save: CitadelSave) => {
    const json = JSON.stringify(save, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    // Date.now() is fine on the main thread (UI, not sim code).
    a.href = url;
    a.download = `citadel-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

/**
 * Load a save from a JSON file.  Opens a file picker, reads the JSON,
 * sends it to the Worker which replays the command log.
 */
btnLoad.addEventListener("click", () => {
  loadFileInput.click();
});

loadFileInput.addEventListener("change", () => {
  const file = loadFileInput.files?.[0];
  if (file === undefined) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      const save = JSON.parse(text) as CitadelSave;
      if (save.version !== 1) {
        console.warn("Citadel: unrecognized save version", save.version);
        return;
      }
      client.loadSave(save);
    } catch (err) {
      console.error("Citadel: failed to parse save file", err);
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be selected again.
  loadFileInput.value = "";
});

// ---------------------------------------------------------------------------
// Phase 3: Decree toggles
// ---------------------------------------------------------------------------
function wireDecree(checkbox: HTMLInputElement, decree: string): void {
  checkbox.addEventListener("change", () => {
    client.sendCommand({ type: "setDecree", payload: { decree, active: checkbox.checked } });
  });
}
wireDecree(decreWorkHours,    "workHours");
wireDecree(decreRationing,    "rationing");
wireDecree(decreTithe,        "tithe");
wireDecree(decreConscription, "conscription");

// ---------------------------------------------------------------------------
// Sim client — solo runs the sim in an in-browser Worker; `?mp` drives it over
// a WebSocket to the multi-writer @citadel/server (Citadel 35). Both transports
// share one interface, so the rest of main.ts is transport-agnostic.
// ---------------------------------------------------------------------------
const useServer = typeof location !== "undefined" && new URLSearchParams(location.search).has("mp");
/** Build cost is charged only in solo (the cozy economy, set in the Worker bootstrap); MP keeps placement free. */
const CHARGE_BUILD_COST = !useServer;
const client: CitadelSimClient | CitadelServerClient = useServer
  ? new CitadelServerClient()
  : new CitadelSimClient();

// Dev-only test hook: lets an automated harness (Playwright) drive the same
// command channel the UI uses, for deterministic end-to-end validation. Guarded
// by import.meta.env.DEV so it never ships in a production build.
if (import.meta.env.DEV) {
  (window as unknown as { __citadel?: unknown }).__citadel = {
    send: (cmd: unknown) => client.sendCommand(cmd as never),
    terrain: () => terrain,
    buildings: () => currentBuildings,
    villagers: () => currentVillagers,
    // Project a tile centre to a CSS-px point (relative to the viewport) so a
    // test harness can drive REAL UI gestures — hovering the placement ghost,
    // clicking a specific tile — not just the command channel. Mirrors the
    // renderer's world→screen transform.
    tileToScreenCss: (tx: number, ty: number) => tileToScreenCss(tx + 0.5, ty + 0.5),
  };
}

/**
 * Project an iso TILE point (fractional tile coords) to a CSS-px point relative
 * to the viewport, using the live camera + canvas transform. Mirrors the
 * renderer's world→screen mapping. Used for DOM overlays anchored to the world
 * (occupancy badges) and the dev-hook test harness. Render-only.
 */
function tileToScreenCss(tileX: number, tileY: number): { x: number; y: number } {
  const c = tileToIso(tileX, tileY);
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  const sx = canvas.width / camera.worldUnitsX;
  const sy = canvas.height / camera.worldUnitsY;
  const left = camera.centerX - camera.worldUnitsX / 2;
  const top = camera.centerY - camera.worldUnitsY / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((c.x - left) * sx) / dpr, y: rect.top + ((c.y - top) * sy) / dpr };
}

let paused = false;
let speed = 1; // current sim-speed multiplier (1/2/4); drives the HUD speed-button highlight
let day = 1;
let tick = 0;            // render-side mirror of snap.tick (for the day/night wash)
let season = "spring";
let tier = "Hamlet"; // Phase 5: settlement tier (current; displayed in HUD)
let peakTier = "Hamlet"; // highest tier ever reached; gates build/upgrade buttons
let population = 0;
let popCap = 0;
let localPlayerId = 0; // owner id the snapshot is the view of (solo = 0)
// The full stockpile from the latest snapshot (every good → count); feeds the HUD goods strip.
let stockpiles: Readonly<Record<string, number>> = {};
let foodSurplus = 0;
let happiness = 40;
let events: readonly string[] = [];

// Phase 3 state
let traderPresent = false;
let traderOffersList: readonly { give: string; giveQty: number; receive: string; receiveQty: number }[] = [];
let activeDecrees: readonly string[] = [];

// Phase 4 state
let threatLevel = 0;
let defensiveStrength = 0;
let keepPresent = false;
let keepSacked = false;
let nextRaidDay = -1;
// Phase 4.5 hazard state
let sickVillagers = 0;
let outbreakActive = false;
let activeFires = 0;

// engine-ui chunk 7: pause/speed are now in-canvas @engine/ui buttons. These two
// functions are the single shared command path — invoked by the HUD buttons' onActivate
// (mouse, Tab+Enter via the dispatcher, AND the a11y mirror's <button>). The pause label
// flip + the active-speed highlight are derived from `paused`/`speed` in the HUD's refresh.
function togglePause(): void {
  if (paused) {
    client.resume();
  } else {
    client.pause();
  }
  paused = !paused;
}
/** Picking a speed also resumes if paused (standard city-builder behaviour). */
function setSpeedAndResume(n: number): void {
  client.setSpeed(n);
  speed = n;
  if (paused) {
    client.resume();
    paused = false;
  }
}

// ---------------------------------------------------------------------------
// Brief 25: Settings modal — tabbed (Display / Atmosphere / Simulation),
// a11y tablist with roving tabindex + keyword search. UI-only; wires the
// render-feature toggles, sim speed, and camera zoom via getters/setters.
// ---------------------------------------------------------------------------
const settingsModal = new SettingsModal({
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
  getZoom: () => camera.zoom,
  setZoom: (z) => camera.setZoom(clampZoom(z)),
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
});

const btnSettings = document.getElementById("btn-settings")!;
btnSettings.addEventListener("click", () => settingsModal.toggle());
// Global Escape: close the settings modal if open (placement/follow Escape
// handlers remain; this just adds modal dismissal at the window level too).
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal.isOpen()) settingsModal.close();
});

let latestSnapshot: RenderSnapshot | null = null;

client.onSnapshot((snap) => {
  latestSnapshot = snap;
  tick = snap.tick;
  day = snap.day + 1;
  season = snap.season;
  tier = snap.tier;  // Phase 5
  peakTier = snap.peakTier;  // gates build/upgrade buttons (never demotes)
  refreshBuildButtonLocks();
  population = snap.population;
  popCap = snap.popCap;
  stockpiles = snap.stockpiles;
  foodSurplus = snap.foodSurplus;
  events = snap.recentEvents;
  // Toast only the freshly-appended events (the rest is backlog already shown).
  // performance.now() is the render clock — main-thread only, never the sim.
  for (const e of newEventsSince(lastEventShown, events)) toasts.push(e, performance.now());
  if (events.length > 0) lastEventShown = events[events.length - 1]!;
  currentBuildings = snap.buildings;
  currentVillagers = snap.villagers;
  localPlayerId = snap.localPlayerId;
  // Phase 3
  happiness = snap.happiness;
  traderPresent = snap.traderPresent;
  traderOffersList = snap.traderOffers;
  activeDecrees = snap.activeDecrees;
  // Phase 4
  currentRaiders = snap.raiders;
  // Render-only interpolation bookkeeping: feed the new snapshot's unit positions
  // and measure the inter-snapshot interval (so the glide adapts to 1×/2×/4× and
  // jitter). performance.now() is the render clock — main-thread only, never sim.
  {
    const nowMs = performance.now();
    if (lastSnapshotMs > 0) {
      const dt = nowMs - lastSnapshotMs;
      // Light smoothing so one late frame doesn't lengthen the glide; clamp out
      // pauses/tab-throttle (a multi-second gap must not stretch the lerp).
      const clamped = Math.min(dt, 1000);
      snapshotIntervalMs = snapshotIntervalMs === 0 ? clamped : snapshotIntervalMs * 0.6 + clamped * 0.4;
    }
    lastSnapshotMs = nowMs;
    villagerInterp.ingest(currentVillagers);
    raiderInterp.ingest(currentRaiders);
  }
  threatLevel = snap.threatLevel;
  defensiveStrength = snap.defensiveStrength;
  keepPresent = snap.keepPresent;
  keepSacked = snap.keepSacked;
  nextRaidDay = snap.nextRaidDay;
  // Phase 4.5 hazards
  sickVillagers = snap.sickVillagers;
  outbreakActive = snap.outbreakActive;
  activeFires = snap.activeFires;

  // Sync decree checkboxes with server state (in case decrees change externally)
  decreWorkHours.checked    = activeDecrees.includes("workHours");
  decreRationing.checked    = activeDecrees.includes("rationing");
  decreTithe.checked        = activeDecrees.includes("tithe");
  decreConscription.checked = activeDecrees.includes("conscription");

  // Update trader panel
  if (traderPresent) {
    traderPanel.classList.add("visible");
    traderOffers.innerHTML = "";
    traderOffersList.forEach((offer, i) => {
      const btn = document.createElement("button");
      btn.className = "trade-offer-btn";
      btn.textContent = `${offer.giveQty} ${offer.give} → ${offer.receiveQty} ${offer.receive}`;
      btn.addEventListener("click", () => {
        client.sendCommand({ type: "barter", payload: { offerIndex: i } });
      });
      traderOffers.appendChild(btn);
    });
  } else {
    traderPanel.classList.remove("visible");
  }

  // Brief 19: release the follow if its villager despawned (night / starvation). The in-canvas
  // villager panel re-finds the live villager by id each frame in loop(), so the per-snapshot
  // readout refresh is no longer needed here; we just clear the a11y mirror on a despawn release.
  const stillFollowing = followReleaseId(followId, currentVillagers);
  if (followId !== null && stillFollowing === null) villagerMirror?.update(null);
  followId = stillFollowing;
});

// ---------------------------------------------------------------------------
// Terrain (generated at module scope; baked into the static layer by the
// renderer during boot, and read by placement validation).
// ---------------------------------------------------------------------------
const terrain: TerrainGrid = generateTerrain(SEED);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
function loop(): void {
  // engine-ui chunk 7: the settlement readout (tier/day/pop/happiness), the goods strip + the
  // speed/pause buttons are rendered IN-CANVAS via @engine/ui now. Refresh their widget
  // text/state from the latest snapshot here; the actual layout + draw happens after the
  // world scene is submitted, below (so the HUD paints on top). hud may be undefined for
  // the first frame(s) before boot() finishes — guard it.
  // refresh() returns whether LAYOUT-AFFECTING content changed (label text / button label).
  // HUD content only changes on sim ticks (~1–4 Hz), so we gate the per-frame-expensive
  // computeLayout + a11y-mirror reconcile behind it (see the HUD submit block below).
  // renderTree + surface.begin/end still run EVERY frame (the UI layer is re-submitted each
  // frame). undefined on the first frame(s) before boot — treat that as "no HUD to lay out".
  const hudContentChanged = hud?.refresh({
    tier, day, season, population, popCap,
    stockpiles, foodSurplus, happiness, paused, speed,
  }) ?? false;
  // Phase 4: siege HUD
  const threatColor = threatLevel >= 60 ? EDG.red : threatLevel >= 30 ? EDG.gold : EDG.green;
  hudThreat.textContent = `Threat: ${threatLevel}` + (nextRaidDay >= 0 ? ` (next ~d${nextRaidDay + 1})` : "");
  hudThreat.style.color = threatColor;
  hudDefense.textContent = `Defense: ${defensiveStrength}`;
  if (keepSacked) {
    hudKeep.textContent = "KEEP SACKED";
    hudKeep.style.color = EDG.red;
  } else if (keepPresent) {
    hudKeep.textContent = "Keep: standing";
    hudKeep.style.color = EDG.green;
  } else {
    hudKeep.textContent = "Keep: none";
    hudKeep.style.color = EDG.steel;
  }
  // Phase 4.5: hazard HUD
  if (activeFires > 0) {
    hudFire.textContent = `Fire: ${activeFires} building(s) burning!`;
    hudFire.style.color = EDG.gold;
  } else {
    hudFire.textContent = "Fire: none";
    hudFire.style.color = EDG.steel;
  }
  if (outbreakActive) {
    hudDisease.textContent = `Disease: ${sickVillagers} sick!`;
    hudDisease.style.color = EDG.mauve;
  } else {
    hudDisease.textContent = "Disease: none";
    hudDisease.style.color = EDG.steel;
  }

  // --- Render clock (performance.now is main-thread only — never the sim).
  const nowMs = performance.now();
  const timeSec = nowMs / 1000;
  const dt = lastFrameMs === 0 ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  // --- Brief 17 placement ease-in: diff the building set against the appear map
  // (records first-seen render-clock ms per x,y,type; drops demolished keys).
  syncAppearMap(appearAt, currentBuildings, nowMs);

  // --- Brief 24 wear/decay (render-only): track when each building first started
  // burning so the soot overlay can ramp from ignition. Drop keys once the fire
  // is out (so a re-ignite re-ramps) or the building is gone.
  {
    const burningKeys = new Set<string>();
    for (const b of currentBuildings) {
      if (!b.burning && !b.onFire) continue;
      const key = buildingKey(b);
      burningKeys.add(key);
      if (!burningSince.has(key)) burningSince.set(key, nowMs);
    }
    for (const key of burningSince.keys()) {
      if (!burningKeys.has(key)) burningSince.delete(key);
    }
  }

  // --- Brief 19 follow-cam glide: lerp the camera centre toward the followed
  // villager's world position with expSmooth (a smooth glide, not a snap). The
  // villager dot tile-steps (no interpolation yet), so the cam is the smoothing.
  if (followId !== null) {
    const fv = villagerById(currentVillagers, followId);
    if (fv !== null) {
      const targetX = fv.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = fv.y * TILE_SIZE + TILE_SIZE / 2;
      camera.setCenter(
        expSmooth(camera.centerX, targetX, 6, dt),
        expSmooth(camera.centerY, targetY, 6, dt),
      );
    }
  }

  // --- WebGPU scene: terrain is the baked static layer; entities + ghost are
  // sprite-batch quads. beginFrame sizes the canvas backing store, so fit the
  // camera to it first.
  renderer.beginFrame();
  fitCameraToCanvas(camera, canvas.width, canvas.height);

  // Brief 21/22: on the large MP world, re-bake the camera-windowed static
  // layer when the window shifts (drained at a per-frame budget so a fast pan
  // never triggers a synchronous re-bake). No-op on the small solo world.
  windowController.update(camera);

  // Render-only movement interpolation: fraction through the gap between the two
  // latest snapshots, from the measured inter-snapshot interval. Units glide to
  // their new tile instead of snapping. When paused there are no new snapshots,
  // so alpha pins to 1 (entities rest at their current tile).
  const interpAlpha = paused ? 1 : snapshotAlpha(nowMs, lastSnapshotMs, snapshotIntervalMs);

  // Brief 17 FX hooks: placement ease-in (building scale/alpha) + idle bob
  // (villager Y) + render-only position interpolation (villager/raider glide).
  // All pure; the appear map + render clock + interpolators feed them here.
  pushScene(
    renderer,
    {
      buildings: currentBuildings,
      villagers: currentVillagers,
      raiders: currentRaiders,
    },
    {
      building: (b, quad) => {
        const born = appearAt.get(`${b.x},${b.y},${b.type}`);
        if (born === undefined) return { quad, alpha: 1 };
        const fx = placementScale(nowMs - born);
        return { quad: easeQuad(quad, fx), alpha: fx.alpha };
      },
      // Movement-aware gait: walking villagers get a springy step hop, idle ones
      // keep the gentle sway. `isMoving` comes from the interpolator (prev≠cur).
      villagerYOffset: (v) => gaitOffset(timeSec, v.id, villagerInterp.isMoving(v.id)),
      villagerPos: (v) => villagerInterp.positionOf(v.id, interpAlpha, v.x, v.y),
      raiderPos: (r) => raiderInterp.positionOf(r.id, interpAlpha, r.x, r.y),
    },
    // Render clock drives render-only animation (the mill's rotating sails).
    // performance.now — main-thread only, never the sim.
    nowMs,
  );

  // --- Brief 24 wear/decay soot overlay (render-only). For each burning
  // building, stamp soot ramped by how long it's been on fire (per-building
  // render clock from burningSince). Healthy buildings emit nothing.
  for (const b of currentBuildings) {
    if (!b.burning && !b.onFire) continue;
    const since = burningSince.get(buildingKey(b)) ?? nowMs;
    pushWearOverlay(renderer, [b], nowMs - since);
  }

  // --- Atmosphere (render-only). Day/night wash + night light pool (brief 15),
  // ambient crowd (brief 18), weather (brief 16). All driven off snapshot
  // fields (tick/season/tier/day) + the render clock — zero sim impact.
  const dayFraction = dayFractionOf(tick, VISUAL_DAY_TICKS);
  const nightFactor = nightFactorOf(dayFraction);

  // Night light pool: warm glow quads over emitter buildings (sprite-batch).
  // Brief 25: gated — when off, skip the push entirely (no quads emitted).
  if (renderToggles.lightPool) {
    pushLightPool(renderer, lightPoolQuads(emittersOf(currentBuildings), nightFactor));
  }

  // Ambient crowd: wandering pedestrians, density by tier (sprite-batch).
  // Brief 25: gated — when off, skip both the update and the push.
  if (renderToggles.ambientCrowd) {
    if (latestSnapshot !== null) ambientCrowd.update(dt, latestSnapshot);
    pushAmbientCrowd(renderer, ambientCrowd.quads());
  }

  const ghost = placementState.ghost();

  // --- Service coverage (OpenTTD-influence brief, 2026-06-22). Two paths share
  // one ground-tile decal: the full overlay (toggled with `C`) washes every
  // catchment by need so gaps show; the placement ring previews the selected
  // service's reach around the ghost BEFORE committing. Render-only — the tile
  // geometry mirrors the sim's coverage math (render/coverage.ts).
  if (coverageOverlay) {
    for (const grp of coverageByNeed(currentBuildings)) pushCatchment(renderer, grp.tiles, grp.hex);
  }
  if (placementState.mode === "place" && ghost !== null) {
    const cx = ghost.tileX + Math.floor(ghost.w / 2);
    const cy = ghost.tileY + Math.floor(ghost.h / 2);
    // serviceCatchment dispatches on shape: the well previews its 8×6 rectangle;
    // diamond services preview their Manhattan ring. Empty for non-services.
    const ring = serviceCatchment(placementState.selectedType, cx, cy);
    if (ring.length > 0) {
      pushCatchment(renderer, ring, serviceTint(placementState.selectedType));
    }
  }

  // --- Road-builder feedback: float a "no road" pip over any production/housing/
  // storage building that isn't connected to the network, so the connectivity the
  // economy depends on is visible (the `connected` flag was previously unsurfaced).
  // Render-only; reads the snapshot flag. nowMs drives the gentle attention pulse.
  pushDisconnectedMarkers(renderer, currentBuildings, nowMs);

  const dragging = (placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad;
  // Drag preview tints each tile green/red by whether the sim will accept it.
  pushGhost(renderer, ghost, dragging ? placementState.roadTilesWithValidity() : []);

  // Weather field (engine RainField → GPU WeatherPass). Update against the
  // visible world rect, then hand it to endFrame.
  // Brief 25: gated — when weather is off, skip the field update so endFrame
  // receives no weather pass below.
  if (renderToggles.weather) {
    const halfX = camera.worldUnitsX / 2;
    const halfY = camera.worldUnitsY / 2;
    weather.update(dt, season, day, {
      left: camera.centerX - halfX,
      right: camera.centerX + halfX,
      top: camera.centerY - halfY,
      bottom: camera.centerY + halfY,
    });
  }

  // Brief 17 chimney smoke: emit rising grey puffs from bakery/smith/woodcutter
  // (render-side RNG jitter only), advance the pool, hand it to endFrame so the
  // WebGPU particle pass draws it natively (the overlay callback is a no-op).
  // Brief 25: gated — when off, skip emission (existing puffs still advance/age
  // out via particles.update so the pool drains cleanly).
  if (renderToggles.smoke) smoke.update(currentBuildings, nowMs);
  particles.update(dt);

  // engine-ui chunk 7: lay out + submit the in-canvas HUD. computeLayout writes screen-px
  // rects (CSS logical, top-left origin); renderTree emits quads/text through the UISurface
  // (renderer.beginUI/pushUI/endUI), which the renderer flushes LAST inside endFrame() so
  // the HUD paints on top of the world scene + wash. Anchored at the top-left (8,8). The
  // a11y mirror is reconciled against the same tree so the HUD is keyboard/AT-reachable.
  if (hud !== undefined && uiSurface !== undefined) {
    // Gate ONLY the expensive work (computeLayout allocates + re-measures every label;
    // a11yMirror.update re-walks + re-patches the DOM) behind a content change — content
    // changes at sim-tick rate (~1–4 Hz), not frame rate (~60 Hz). The first frame's refresh
    // returns true, so the initial layout always runs. renderTree re-submits the (already
    // laid-out) tree EVERY frame so hover/active colour changes still paint immediately.
    if (hudContentChanged) {
      computeLayout(hud.root, 8, 8);
      a11yMirror?.update(hud.root);
    }
    uiSurface.begin();
    renderTree(uiSurface, hud.root);

    // Inspect chunk 2: the inspect panel is a SECOND UI root rendered inside the SAME
    // surface.begin()/end(), after the HUD so it paints on top. Re-find the live snapshot
    // for the selected building by footprint origin each frame; if it vanished (demolished),
    // auto-close. Then refresh + lay out + draw + mirror — all gated on being open.
    if (inspectPanel !== undefined && inspectSelection !== null) {
      const b = findSelected(currentBuildings, inspectSelection);
      if (b === null) {
        closeInspect(); // also clears the a11y mirror (every close path does)
      } else {
        const changed = inspectPanel.refresh({
          type: b.type,
          level: b.level,
          connected: b.connected,
          workerCount: b.workerCount,
          outputBuffer: b.outputBuffer,
          season,
          stockpiles: latestSnapshot?.stockpiles ?? {},
          // Tier the owner has reached — mirrors the sim's upgrade gate (unlockTier = peakTier).
          peakTier: peakTier as SettlementTier,
        });
        // Floating position: pinned to the LEFT edge, BELOW the top HUD bar (anchored at 8,8,
        // ~32px tall) so it never overlaps the HUD or the top-right minimap. On-screen and
        // fixed (the panel has a fixed width:240, so it doesn't reflow the world or HUD).
        if (changed) {
          computeLayout(inspectPanel.root, 8, 56);
          inspectMirror?.update(inspectPanel.root);
        }
        renderTree(uiSurface, inspectPanel.root);
      }
    }

    // Villager-job chunk 3: the follow-a-villager panel is a THIRD UI root, rendered inside the
    // SAME surface.begin()/end(), after the HUD + inspect panel so it paints on top. Open iff a
    // villager is followed; re-find the live villager by id each frame (villagers have a stable
    // id). If it vanished, the snapshot handler already released the follow + cleared the mirror,
    // so `followId` is null here and we skip. Then refresh + lay out + draw + mirror.
    if (villagerPanel !== undefined && followId !== null) {
      const fv = villagerById(currentVillagers, followId);
      if (fv !== null) {
        const changed = villagerPanel.refresh({
          id: fv.id,
          job: fv.job,
          fsm: fv.fsm,
          carryGood: fv.carryGood,
        });
        // Floating position: pinned to the BOTTOM-LEFT corner (anchored by its TOP edge well
        // below the top HUD bar + the inspect panel at 8,56, and clear of the top-right minimap).
        // y=380 keeps the ~110px-tall card on-screen above the bottom build toolbar.
        if (changed) {
          computeLayout(villagerPanel.root, 8, 380);
          villagerMirror?.update(villagerPanel.root);
        }
        renderTree(uiSurface, villagerPanel.root);
      }
    }

    // Event toasts: a top-CENTRE in-canvas UI root (toast.ts), rendered last so it paints
    // over everything. Two layout passes when toasts are present: the first fills rects so we
    // know the stack width, the second re-anchors it centred at the top. Per-frame opacity (the
    // fade) is render-only — it doesn't change layout — so this is cheap (≤4 small panels).
    if (toasts.root.children.length > 0) {
      computeLayout(toasts.root, 0, 0);
      const cx = Math.max(8, (canvas.clientWidth - toasts.root.rect.width) / 2);
      // y=48 keeps the top-centre stack clear of the in-canvas HUD bar (anchored 8,8, ~36px tall).
      computeLayout(toasts.root, cx, 48);
      renderTree(uiSurface, toasts.root);
    }

    uiSurface.end();
  }

  // Day/night + seasonal wash (GPU TintPass via endFrame), then particles +
  // weather (both rendered natively by the WebGPU backend).
  // Brief 25: gated — pass undefined wash/weather when their toggles are off.
  const wash = renderToggles.wash ? computeWash(season, dayFraction) : undefined;
  const weatherField = renderToggles.weather ? weather.field : undefined;
  renderer.endFrame(wash, particles, weatherField);

  // Part B: per-building occupancy badges. Headcount chips over each of the local
  // player's buildings that has people at it (idle residents / workers). DOM
  // overlay positioned via the world→screen map; in-transit villagers are drawn
  // on roads instead (Part A), so badges + road dots == population.
  occupancyBadges.update(currentBuildings, localPlayerId, (tx, ty) => tileToScreenCss(tx, ty));

  // Minimap overview + event-toast aging (both render-only overlays).
  if (minimap !== null) {
    minimap.draw({
      buildings: currentBuildings,
      villagers: currentVillagers,
      raiders: currentRaiders,
      transform: transformOf(camera, canvas.width, canvas.height),
    });
  }
  toasts.tick(nowMs);

  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Boot: create the WebGPU renderer (bakes terrain), then start sim + loop.
// Citadel is WebGPU-only at runtime — if WebGPU is unavailable this throws and
// the surface stays blank (matches the FV pattern; no Canvas2D fallback).
// ---------------------------------------------------------------------------
async function boot(): Promise<void> {
  const created = await createCitadelRenderer(canvas, terrain);
  renderer = created.renderer;
  camera = created.camera;
  windowController = created.windowController;
  inputReady = true; // camera/renderer live → world input handlers may run

  // engine-ui chunk 7: register the bitmap font atlas (once), build the in-canvas HUD,
  // and wire its render/input/a11y plumbing.
  //  - addAtlas(loadFontAtlas()) makes drawText's glyph quads resolvable by the renderer.
  //  - createResourceHud wires the speed/pause buttons' onActivate to the SAME command
  //    functions the old DOM handlers used (togglePause / setSpeedAndResume).
  //  - the UISurface wraps the renderer's screen-space UI seam.
  //  - the input dispatcher hit-tests the laid-out tree (fed lazily so a rebuild is safe).
  //  - the a11y mirror reflects the tree into hidden DOM; its focus bridge forwards mirror
  //    focus into the dispatcher (and the loop's setFocus mirrors it back).
  renderer.addAtlas(await loadFontAtlas());
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

  // Inspect chunk 2: the floating inspect panel as a SECOND UI root. Its OWN dispatcher returns
  // null root while closed (`inspectOpen()` false) → inert, so forwarding events to it is safe.
  // Its OWN a11y mirror lives in a SEPARATE hidden mount (#ui-a11y-inspect) so its DOM subtree
  // and Tab order are distinct from the HUD's; `inspectMirror.update(null)` clears it on close.
  // Upgrade button drives the SAME command the old DOM `#btn-upgrade` tool issued
  // ({ type: "upgradeBuilding", payload: { x, y } }), targeting the selected footprint origin.
  // The sim host re-validates ownership / tier / max-level / affordability; the panel only
  // disables the button when at max or unaffordable.
  inspectPanel = createInspectPanel({
    close: closeInspect,
    upgrade: () => {
      if (inspectSelection === null) return;
      client.sendCommand({
        type: "upgradeBuilding",
        payload: { x: inspectSelection.x, y: inspectSelection.y },
      });
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

  // Villager-job chunk 3: the floating follow-a-villager panel as a THIRD UI root. Read-only
  // (no buttons) → NO input dispatcher; events never need forwarding to it. It keeps its OWN
  // a11y mirror in a SEPARATE hidden mount (#ui-a11y-villager) so its readout's DOM subtree is
  // distinct from the HUD's and the inspect panel's. `villagerMirror.update(null)` clears it on
  // every follow-release path (Esc / click-away / minimap / despawn — all via clearFollow()).
  villagerPanel = createVillagerPanel();
  // FIX B: a dispatcher that hit-tests the panel root only while following, so a click on the
  // panel's rect is consumed (UI-owned) and never reaches world build/pan. No buttons → no
  // focus/activation behaviour is needed; it exists purely for click consumption.
  villagerDispatcher = createInputDispatcher(() => (followId !== null ? villagerPanel?.root ?? null : null));
  if (villagerA11yMount !== null) {
    villagerMirror = createA11yMirror(villagerA11yMount, { rootLabel: "Followed villager" });
  }

  // Minimap (top-right): clicking it recentres the camera on that tile and
  // releases any follow-cam lock. Camera centre is in iso world-px, so map the
  // clicked tile through the iso projection.
  const minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
  minimap = new CitadelMinimap(minimapCanvas, terrain, (tx, ty) => {
    clearFollow(); // release the follow-cam + hide the in-canvas villager panel
    const c = tileToIso(tx, ty);
    camera.setCenter(c.x, c.y);
  });

  client.init(SEED, TICKS_PER_DAY);
  updateModeLabel();
  requestAnimationFrame(loop);
}

void boot().catch((err) => {
  console.error("[citadel] boot failed", err);
});
