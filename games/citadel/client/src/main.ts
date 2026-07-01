/**
 * Citadel — browser entry point.
 *
 * Phase 3: chapel, market, watchpost, tradingpost; happiness HUD;
 *          trader panel.
 * Phase 4: quarry/sawmill/smith/mine refiners; wall (drag-paint) + gate;
 *          tower/garrison/keep defenses; threat/defense/keep HUD; raider dots.
 * Phase 5: settlement tier HUD; save/load via command-log replay (localStorage
 *          + downloadable JSON blob).
 */
import "./style.css";
import { generateTerrain, getBuildingDef, getProductionDef, tierAtLeast, BUILDING_MAX_LEVEL, upgradeCost, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, CitadelSave, SettlementTier, RenderSnapshot } from "@citadel/sim-core";
import { EDG, ParticleSystem, createRng, expSmooth } from "@engine/core";
import type { Camera2D, RendererLike } from "@engine/core";
import { UISurface, computeLayout, renderTree, createInputDispatcher, createA11yMirror, loadFontAtlas, label } from "@engine/ui";
import type { InputDispatcher, A11yMirror, LabelNode } from "@engine/ui";
import { createResourceHud } from "./ui/resource-hud";
import type { ResourceHud } from "./ui/resource-hud";
import { createBuildBar } from "./ui/build-bar";
import type { BuildBar, BuildTool } from "./ui/build-bar";
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
  uncoveredHouseTiles,
} from "./render/coverage";
import { PlacementStateManager } from "./ui/placement-state";
import { SettingsModal } from "./ui/settings-modal";
import { ToastManager, newEventsSince } from "./ui/toast";
import { CitadelMinimap, MINIMAP_FACE } from "./ui/minimap";
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
// Build-bar buttons (Demolish/Upgrade/Road/Wall/Cancel + the build-type grid) are now
// in-canvas @engine/ui buttons (src/ui/build-bar.ts); their placement-mode setters live in
// `selectBuild` / `setTool` below, wired as the bar's onActivate callbacks.
const lblMode = document.getElementById("lbl-mode")!;
// Phase 5: save/load UI
const btnSave = document.getElementById("btn-save")!;
const btnLoad = document.getElementById("btn-load")!;
const loadFileInput = document.getElementById("load-file-input")! as HTMLInputElement;

// Event toasts (top-center) now render IN-CANVAS via @engine/ui (toast.ts builds a
// @engine/ui column the render loop lays out + draws). Created at module scope so it
// exists before the first snapshot; #toast-live is its hidden aria-live a11y mirror.
const toasts = new ToastManager(document.getElementById("toast-live"));
let lastEventShown: string | null = null;
// Cozy-pivot Phase F (decision #7): latch for the ONE gentle contentment
// banner, edge-triggered on `allHomesCovered` flipping false→true. `null`
// until the first snapshot arrives, so we can initialize the latch from
// whatever state the town loads in WITHOUT toasting (no spurious banner on
// save-load of an already-happy town) — only a later rising edge congratulates.
let prevAllHomesCovered: boolean | null = null;
let minimap: CitadelMinimap | null = null;

// Per-building occupancy badges (Part B): headcount chips floated over each
// building that has people at it. Now render IN-CANVAS via @engine/ui (pooled
// panel+label chips the render loop lays out + draws), replacing the DOM overlay.
const occupancyBadges = new OccupancyBadgeLayer();

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

// Build bar (DOM-overlay removal): a FOURTH in-canvas UI root — the placement toolbar,
// rendered at the bottom-left (supersedes the DOM #build-bar). Its OWN input dispatcher
// (always live — the bar is always visible) + a11y mirror (a fourth hidden mount). A small
// hover-info label above it shows the hovered button's cost/tier (preserving the old DOM
// `title` tooltip). `lastUiX/Y` track the pointer in CSS-logical px for the hover hit-test.
let buildBar: BuildBar | undefined;
let buildBarDispatcher: InputDispatcher | undefined;
let buildBarMirror: A11yMirror | undefined;
const buildBarA11yMount = document.getElementById("ui-a11y-buildbar");
const buildBarInfoLabel: LabelNode = label("", { muted: true });
let lastUiX = -1;
let lastUiY = -1;

// Settings modal (DOM-overlay removal): a FIFTH in-canvas UI root — the tabbed settings
// dialog (Display / Atmosphere / Simulation), centred + rendered over everything while open
// (supersedes the DOM modal). Its OWN dispatcher (root null while closed → inert) + a11y
// mirror (a fifth hidden mount). The modal instance is created at module scope below; its
// dispatcher/mirror are wired in boot() once the a11y mount + camera exist.
let settingsDispatcher: InputDispatcher | undefined;
let settingsMirror: A11yMirror | undefined;
const settingsA11yMount = document.getElementById("ui-a11y-settings");
// Tracks whether the settings modal had its post-open layout/mirror reconcile run, so a fresh
// open re-syncs the (just-mutated) control state into the a11y view exactly once.
let settingsLaidOut = false;
// The bar is laid out at the bottom-left only when first shown or the canvas height changes
// (labels are fixed → layout depends only on the bottom anchor). `barTopY` is its top edge.
let barLaidOutH = -1;
let barTopY = 0;

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
  // Settings modal: while open it overlays everything, so it gets first refusal on a press —
  // and a press anywhere while it's open should not fall through to the world (it's modal).
  const settingsC = settingsDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  const hudC = uiDispatcher.pointerDown(x, y, btn).consumed;
  const inspectC = inspectDispatcher?.pointerDown(x, y, btn).consumed ?? false;
  // FIX B: forward to the villager-panel dispatcher too (inert while not following). A press on
  // its rect is UI-owned so the world doesn't start a placement/drag underneath the panel.
  const villagerC = villagerDispatcher?.pointerDown(x, y, btn).consumed ?? false;
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
  if (settingsC || hudC || inspectC || villagerC || barC || minimapC || settingsModal.isOpen()) {
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
  // Always forward to both so a UI press completes/activates, but only block the world when the
  // UI owns this gesture (uiPressActive). A world-owned release — even over the HUD — must reach
  // the world handler so road/wall drags commit.
  uiDispatcher.pointerUp(x, y, btn);
  inspectDispatcher?.pointerUp(x, y, btn);
  villagerDispatcher?.pointerUp(x, y, btn); // FIX B: complete any UI-owned gesture on the panel
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
  // ALWAYS forward to both so hover visuals update, but only block the world (pan/drag) when the
  // UI owns the active gesture. Mere hover must NOT block world pan/drag.
  uiDispatcher.pointerMove(x, y, btn);
  inspectDispatcher?.pointerMove(x, y, btn);
  villagerDispatcher?.pointerMove(x, y, btn); // FIX B
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
  const hudC = uiDispatcher.wheel(x, y, e.deltaY).consumed;
  const inspectC = inspectDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  const villagerC = villagerDispatcher?.wheel(x, y, e.deltaY).consumed ?? false; // FIX B
  const barC = buildBarDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  // Modal open: swallow wheel over its rect (don't zoom the world under the dialog).
  const settingsC = settingsDispatcher?.wheel(x, y, e.deltaY).consumed ?? false;
  // Fix 1: while the modal is open ALL canvas wheel events are swallowed regardless of whether
  // the pointer lands on a modal widget — the backdrop must not zoom the world underneath.
  if (hudC || inspectC || villagerC || barC || settingsC || settingsModal.isOpen()) {
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
  // The active-tool highlight now lives on the in-canvas build bar; it re-binds each frame
  // from `placementState` in the render loop (buildBar.refresh), so no DOM toggling here.
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

/**
 * Enter a standalone tool mode (road/wall/demolish/upgrade) or clear it ("none"). Wired as
 * the build bar's tool-button `onActivate` — the SAME placement-mode transitions the old DOM
 * `#btn-build-road/-wall/-demolish/-upgrade/-cancel` click handlers drove.
 */
function setTool(tool: BuildTool): void {
  if (tool !== "none") clearFollow(); // entering placement releases the follow-cam
  placementState.mode = tool; // "road" | "wall" | "demolish" | "upgrade" | "none"
  if (tool === "road" || tool === "wall") {
    placementState.setRequiresForest(false);
    placementState.setRequiresStone(false);
  }
  updateModeLabel();
}

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
 * renderer's world→screen mapping. Used only by the dev-hook test harness
 * (`__citadel.tileToScreenCss`); in-canvas world-anchoring (occupancy chips)
 * now uses `tileToCanvasCss` (canvas-relative). Render-only.
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

/**
 * Project an iso TILE point to CANVAS-relative CSS-logical px (top-left origin) — the same
 * coordinate space the in-canvas @engine/ui surface draws in. Identical to
 * {@link tileToScreenCss} but WITHOUT the viewport offset (`rect.left/top`), since the UI
 * surface is canvas-relative, not viewport-relative. Used to anchor the in-canvas occupancy
 * chips over their buildings. Render-only.
 */
function tileToCanvasCss(tileX: number, tileY: number): { x: number; y: number } {
  const c = tileToIso(tileX, tileY);
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  const sx = canvas.width / camera.worldUnitsX;
  const sy = canvas.height / camera.worldUnitsY;
  const left = camera.centerX - camera.worldUnitsX / 2;
  const top = camera.centerY - camera.worldUnitsY / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { x: ((c.x - left) * sx) / dpr, y: ((c.y - top) * sy) / dpr };
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
  // `camera` is assigned asynchronously in boot(); the in-canvas SettingsModal constructor
  // reads getZoom() eagerly (to seed the zoom slider) at module load — BEFORE boot runs — so
  // guard against the undefined camera. Falls back to 1× until the camera exists; the modal
  // resyncs from live state on every show() anyway.
  getZoom: () => (camera as Camera2D | undefined)?.zoom ?? 1,
  setZoom: (z) => { (camera as Camera2D | undefined)?.setZoom(clampZoom(z)); },
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
});

// Open/close the in-canvas settings modal. `show()` resyncs the controls from live state but
// does NOT relayout/render or touch the a11y mirror — so on every (re)open we drop the
// laid-out flag, and the render loop runs one layout + mirror reconcile to push the synced
// state to the screen + AT view. On close we clear the modal's a11y mirror so its hidden DOM
// stops advertising controls that are no longer visible.
function openSettings(): void {
  settingsModal.show();
  settingsLaidOut = false;
}
function closeSettings(): void {
  settingsModal.close();
  settingsMirror?.update(null);
}
function toggleSettings(): void {
  if (settingsModal.isOpen()) closeSettings();
  else openSettings();
}

const btnSettings = document.getElementById("btn-settings")!;
btnSettings.addEventListener("click", () => toggleSettings());
// Global Escape: close the settings modal if open (placement/follow Escape
// handlers remain; this just adds modal dismissal at the window level too).
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal.isOpen()) closeSettings();
});

let latestSnapshot: RenderSnapshot | null = null;
// Phase C opening framing: one-shot, solo-only. The seeded starter town's
// anchor shifts per-seed (seedFoundingTown ring-searches outward from map
// centre to dodge rivers/water), so we can't just point the camera at a fixed
// tile — we wait for the seeded buildings to actually appear in a snapshot,
// average their footprint centers, and frame that. MP has no seeded town (and
// may use a different world), so this stays gated on solo.
let openingFramed = false;

client.onSnapshot((snap) => {
  latestSnapshot = snap;
  tick = snap.tick;
  day = snap.day + 1;
  season = snap.season;
  tier = snap.tier;  // Phase 5
  peakTier = snap.peakTier;  // gates build/upgrade buttons (never demotes)
  // The build bar's tier-lock/affordability + active-tool states re-bind each frame in the
  // render loop (buildBar.refresh reads peakTier/stockpiles/placementState) — no call here.
  population = snap.population;
  popCap = snap.popCap;
  stockpiles = snap.stockpiles;
  foodSurplus = snap.foodSurplus;
  events = snap.recentEvents;
  // Toast only the freshly-appended events (the rest is backlog already shown).
  // performance.now() is the render clock — main-thread only, never the sim.
  for (const e of newEventsSince(lastEventShown, events)) toasts.push(e, performance.now());
  if (events.length > 0) lastEventShown = events[events.length - 1]!;
  // Cozy-pivot Phase F (decision #7): ONE gentle diegetic banner on the
  // false→true rising edge of `allHomesCovered` — never a nag, never repeats
  // while the state holds. Reset the latch on true→false so a later
  // re-completion is congratulated again. The `=== null` branch only seeds
  // the latch on the very first snapshot; it never toasts (avoids a spurious
  // banner on save-load of an already-happy town).
  if (prevAllHomesCovered === null) {
    prevAllHomesCovered = snap.allHomesCovered;
  } else if (snap.allHomesCovered && !prevAllHomesCovered) {
    toasts.push("Every home is prospering.", performance.now());
    prevAllHomesCovered = true;
  } else if (!snap.allHomesCovered && prevAllHomesCovered) {
    prevAllHomesCovered = false;
  }
  currentBuildings = snap.buildings;
  if (!useServer && !openingFramed && inputReady) {
    const seeded = currentBuildings.filter((b) => b.type !== "road" && b.type !== "bridge");
    if (seeded.length > 0) {
      const cx = seeded.reduce((sum, b) => sum + (b.x + b.w / 2), 0) / seeded.length;
      const cy = seeded.reduce((sum, b) => sum + (b.y + b.h / 2), 0) / seeded.length;
      const c = tileToIso(cx, cy);
      camera.setCenter(c.x, c.y);
      camera.setZoom(clampZoom(MAX_ZOOM));
      openingFramed = true;
    }
  }
  currentVillagers = snap.villagers;
  localPlayerId = snap.localPlayerId;
  // Phase 3
  happiness = snap.happiness;
  traderPresent = snap.traderPresent;
  traderOffersList = snap.traderOffers;
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

  // Phase G: the old always-on DOM trader panel is gone — the tradingpost's in-canvas inspect
  // panel now renders the ≤3-offer trade menu (tradeBox in inspect-panel.ts), gated on
  // traderPresent + only shown while that building is selected. traderPresent/traderOffersList
  // are read straight from the panel's refresh() call above.

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
    // Cozy-pivot Phase F (decision #7): frame the overlay's gaps as a soft
    // invitation rather than raw data — a slow, low-amplitude pulse on houses
    // missing a core need. Only drawn while the player pulled up the overlay
    // (never always-on). Reuses pushCatchment's edge/fill alpha split (0.34 vs
    // 0.16) as the two pulse levels, driven by the render clock so it never
    // touches determinism; a ~2.4s period keeps it gentle, not attention-grabbing.
    const invited = uncoveredHouseTiles(currentBuildings);
    if (invited.length > 0) {
      const lit = Math.sin((nowMs / 1000) * (Math.PI * 2 / 2.4)) > 0;
      const pulseTiles = invited.map((t) => ({ tx: t.tx, ty: t.ty, edge: lit }));
      pushCatchment(renderer, pulseTiles, EDG.cream);
    }
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
          // Phase G: the trade-offer affordance (tradingpost-only; the panel ignores these
          // fields for every other building type).
          traderPresent,
          traderOffers: traderOffersList,
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

    // Build bar: a bottom-left in-canvas UI root (build-bar.ts), rendered before the toasts so
    // they paint over it. Re-bind button states each frame from the live placement state; lay it
    // out at the bottom only when first shown or the canvas height changed (labels are fixed).
    if (buildBar !== undefined) {
      const barChanged = buildBar.refresh({
        mode: placementState.mode,
        selectedType: placementState.selectedType,
        peakTier: peakTier as SettlementTier,
        chargeBuildCost: CHARGE_BUILD_COST,
        stockpiles,
      });
      if (barLaidOutH !== canvas.clientHeight) {
        computeLayout(buildBar.root, 0, 0); // measure → height
        barTopY = canvas.clientHeight - buildBar.root.rect.height - 8;
        computeLayout(buildBar.root, 8, barTopY); // anchor bottom-left
        barLaidOutH = canvas.clientHeight;
        buildBarMirror?.update(buildBar.root);
      } else if (barChanged) {
        buildBarMirror?.update(buildBar.root); // disabled/active changed → reconcile the AT view
      }
      renderTree(uiSurface, buildBar.root);

      // Hover-info: the hovered toolbar button's cost/tier text, just above the bar.
      const info = buildBar.hoverInfoFor(buildBarDispatcher?.hitTest(lastUiX, lastUiY) ?? null);
      if (buildBarInfoLabel.text !== info) buildBarInfoLabel.text = info;
      if (info !== "") {
        computeLayout(buildBarInfoLabel, 8, Math.max(8, barTopY - 16));
        renderTree(uiSurface, buildBarInfoLabel);
      }
    }

    // Per-building occupancy badges: headcount chips over each of the local player's buildings
    // that has people at it (idle residents / workers). Now IN-CANVAS @engine/ui chips, drawn
    // through the same surface (world-anchored: each chip positioned at its building's top-centre
    // tile in CANVAS-relative CSS-logical px — the surface's coordinate space). In-transit
    // villagers are drawn on roads instead (Part A), so badges + road dots == population.
    occupancyBadges.update(currentBuildings, localPlayerId, tileToCanvasCss);
    for (const chip of occupancyBadges.activeChips) {
      computeLayout(chip.node, chip.x, chip.y);
      renderTree(uiSurface, chip.node);
    }

    // Minimap (top-right): drawn IN-CANVAS via raw UISurface quads (terrain + entity specks +
    // camera viewport). Anchored 8px from the top-right corner. Reads snapshots + the camera
    // transform only (render-only).
    if (minimap !== null) {
      const mx = canvas.clientWidth - MINIMAP_FACE - 8;
      minimap.draw(uiSurface, mx, 8, {
        buildings: currentBuildings,
        villagers: currentVillagers,
        raiders: currentRaiders,
        transform: transformOf(camera, canvas.width, canvas.height),
      });
    }

    // Event toasts: a top-CENTRE in-canvas UI root (toast.ts), rendered after the badges/minimap
    // so it paints over them. Two layout passes when toasts are present: the first fills rects so
    // we know the stack width, the second re-anchors it centred at the top. Per-frame opacity (the
    // fade) is render-only — it doesn't change layout — so this is cheap (≤4 small panels).
    if (toasts.root.children.length > 0) {
      computeLayout(toasts.root, 0, 0);
      const cx = Math.max(8, (canvas.clientWidth - toasts.root.rect.width) / 2);
      // y=48 keeps the top-centre stack clear of the in-canvas HUD bar (anchored 8,8, ~36px tall).
      computeLayout(toasts.root, cx, 48);
      renderTree(uiSurface, toasts.root);
    }

    // Settings modal: a top-most in-canvas UI root, rendered LAST so it overlays everything while
    // open. Centred on the canvas (measure → re-anchor, like the toasts). show() resyncs the
    // controls but doesn't lay out / reconcile the mirror; we do that every frame so hover/active
    // colours and tab-swap content changes are reflected live in both the canvas and the AT view.
    // Fix 2: reconcile the mirror every frame while open (not just once via settingsLaidOut).
    // The modal's tab buttons call settingsModal.selectTab(i) which swaps the visible content
    // panel; without a per-frame update the screen-reader sees the previous tab's controls (stale
    // DOM). mirror.update() is idempotent + diffs by node id — per-frame is safe and cheap for a
    // small modal. computeLayout runs BEFORE mirror.update so rects are current.
    if (settingsModal.isOpen()) {
      computeLayout(settingsModal.root, 0, 0); // measure → modal size
      const sx = Math.max(8, (canvas.clientWidth - settingsModal.root.rect.width) / 2);
      const sy = Math.max(8, (canvas.clientHeight - settingsModal.root.rect.height) / 2);
      computeLayout(settingsModal.root, sx, sy); // anchor centred
      settingsMirror?.update(settingsModal.root); // reconcile every frame (tab-swap + first open)
      settingsLaidOut = true; // kept for the openSettings() gate (signals boot is past first frame)
      renderTree(uiSurface, settingsModal.root);
    }

    uiSurface.end();
  }

  // Day/night + seasonal wash (GPU TintPass via endFrame), then particles +
  // weather (both rendered natively by the WebGPU backend).
  // Brief 25: gated — pass undefined wash/weather when their toggles are off.
  const wash = renderToggles.wash ? computeWash(season, dayFraction) : undefined;
  const weatherField = renderToggles.weather ? weather.field : undefined;
  renderer.endFrame(wash, particles, weatherField);

  toasts.tick(nowMs); // age toasts on the render clock

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
    // Phase G (cozy pivot #8): the tiny trade-offer menu in the tradingpost's inspect panel.
    // Sends the current offer index straight through — the panel only shows the button when
    // `traderPresent` and `offerIndex` is within the live `traderOffers` menu.
    trade: (offerIndex) => {
      client.sendCommand({ type: "trade", payload: { offerIndex } });
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

  // Build bar (DOM-overlay removal): a FOURTH UI root — the placement toolbar, in-canvas at the
  // bottom-left. Always visible → its dispatcher always returns the live root. onActivate calls
  // the SAME placement-mode setters the old DOM buttons drove (selectBuild / setTool). Its a11y
  // mirror lives in its own hidden mount (#ui-a11y-buildbar) so its Tab order is distinct.
  buildBar = createBuildBar({ selectBuild, setTool });
  buildBarDispatcher = createInputDispatcher(() => buildBar?.root ?? null);
  if (buildBarA11yMount !== null) {
    buildBarMirror = createA11yMirror(buildBarA11yMount, {
      rootLabel: "Build toolbar",
      onFocusNode: (id) => {
        if (buildBarDispatcher === undefined) return;
        if (id === null) buildBarDispatcher.blur();
        else buildBarDispatcher.focus(id);
      },
    });
  }

  // Settings modal (DOM-overlay removal): wire its dispatcher (root null while closed → inert)
  // + a11y mirror in its own hidden mount (#ui-a11y-settings), so its Tab order is distinct.
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

  // Minimap (top-right): now drawn IN-CANVAS via @engine/ui (raw UISurface quads) in the render
  // loop; clicking it recentres the camera on that tile and releases any follow-cam lock. Camera
  // centre is in iso world-px, so map the clicked tile through the iso projection. No canvas —
  // the host forwards pointer presses to minimap.trySeek (below).
  minimap = new CitadelMinimap(terrain, (tx, ty) => {
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
