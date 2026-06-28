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
import { generateTerrain, getBuildingDef, getProductionDef, TIER_LOCK, tierAtLeast, BUILDING_MAX_LEVEL, upgradeCost, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, CitadelSave, SettlementTier, RenderSnapshot } from "@citadel/sim-core";
import { EDG, ParticleSystem, createRng, expSmooth } from "@engine/core";
import type { Camera2D, RendererLike } from "@engine/core";
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
  destinationLabel,
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

const hudTier = document.getElementById("hud-tier")!;
const hudDay = document.getElementById("hud-day")!;
const hudPop = document.getElementById("hud-pop")!;
const hudBread = document.getElementById("hud-bread")!;
const hudWood = document.getElementById("hud-wood")!;
const hudHappiness = document.getElementById("hud-happiness")!;
// Phase 4 siege HUD
const hudThreat = document.getElementById("hud-threat")!;
const hudDefense = document.getElementById("hud-defense")!;
const hudKeep = document.getElementById("hud-keep")!;
// Phase 4.5 hazard HUD
const hudFire = document.getElementById("hud-fire")!;
const hudDisease = document.getElementById("hud-disease")!;
const btnPause = document.getElementById("btn-pause")!;
const btn1x = document.getElementById("btn-1x")!;
const btn2x = document.getElementById("btn-2x")!;
const btn4x = document.getElementById("btn-4x")!;
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

// Brief 19: follow-cam HUD strip (DOM, since the WebGPU overlay callback is a
// no-op). Shows the followed villager's id / fsm / cargo / destination.
const followHud = document.getElementById("follow-hud")!;

// Event toasts (top-center) replace the old inline #hud-events span — events no
// longer reflow the bottom bar. Created at module scope so it exists before the
// first snapshot arrives (the minimap waits for the camera, so it's made in boot).
const toasts = new ToastManager(document.getElementById("toast-container")!);
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

canvas.addEventListener("mousedown", (e) => {
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

// In idle ("none") mode, left-click is the follow-cam gesture: clicking a
// villager locks the camera to it, clicking empty space releases. Placement
// modes have their own `click` handler above, so only the idle case is wired
// here.
canvas.addEventListener("click", (e) => {
  if (isPanning) return; // tail of a pan, not a click
  if (placementState.mode !== "none") return; // placement clicks aren't follow-cam
  const { tx, ty } = eventTile(e);
  const picked = nearestVillager(currentVillagers, tx, ty);
  if (picked !== null) {
    followId = picked;
    updateFollowHud();
  } else if (followId !== null) {
    clearFollow();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && followId !== null) clearFollow();
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

function clearFollow(): void {
  followId = null;
  updateFollowHud();
}

/**
 * Refresh the follow HUD strip (brief 19). Hidden when not following; otherwise
 * shows the followed villager's id, fsm, cargo, and fsm-derived destination.
 * Called on right-click pick, on release, and each snapshot (state may change).
 */
function updateFollowHud(): void {
  if (followId === null) {
    followHud.classList.remove("visible");
    followHud.textContent = "";
    return;
  }
  const v = villagerById(currentVillagers, followId);
  if (v === null) {
    // Will be released by the loop's despawn check; hide pre-emptively.
    followHud.classList.remove("visible");
    return;
  }
  const cargo = v.carryGood !== null ? v.carryGood : "—";
  followHud.textContent =
    `Following #${v.id}  ·  ${v.fsm}  ·  cargo: ${cargo}  ·  ${destinationLabel(v.fsm)}  ·  [Esc to release]`;
  followHud.classList.add("visible");
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

/**
 * Grey out / disable build buttons whose building type is locked behind a
 * settlement tier the player hasn't reached yet. Keeps buttons VISIBLE so the
 * player can see what climbing the tier ladder unlocks. The Road button is
 * never locked. Mirrors the sim-side reject guard (defense in depth).
 */
function refreshBuildButtonLocks(): void {
  for (const [type, btn] of buildButtonsByType) {
    const required = TIER_LOCK[type];
    if (required !== undefined && !tierAtLeast(peakTier as SettlementTier, required)) {
      btn.disabled = true;
      btn.classList.add("tier-locked");
      btn.title = `Requires ${required}`;
    } else {
      btn.disabled = false;
      btn.classList.remove("tier-locked");
      btn.title = "";
    }
  }
}

btnRoad.addEventListener("click", () => {
  placementState.mode = "road";
  placementState.setRequiresForest(false);
  placementState.setRequiresStone(false);
  updateModeLabel();
});
btnWall.addEventListener("click", () => {
  placementState.mode = "wall";
  placementState.setRequiresForest(false);
  placementState.setRequiresStone(false);
  updateModeLabel();
});
btnDemolish.addEventListener("click", () => {
  placementState.mode = "demolish";
  updateModeLabel();
});
btnUpgrade.addEventListener("click", () => {
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
let day = 1;
let tick = 0;            // render-side mirror of snap.tick (for the day/night wash)
let season = "spring";
let tier = "Hamlet"; // Phase 5: settlement tier (current; displayed in HUD)
let peakTier = "Hamlet"; // highest tier ever reached; gates build/upgrade buttons
let population = 0;
let popCap = 0;
let localPlayerId = 0; // owner id the snapshot is the view of (solo = 0)
let bread = 0;
let wood = 0;
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

btnPause.addEventListener("click", () => {
  if (paused) {
    client.resume();
    btnPause.textContent = "Pause";
  } else {
    client.pause();
    btnPause.textContent = "Resume";
  }
  paused = !paused;
});
/** Picking a speed also resumes if paused (standard city-builder behaviour). */
function setSpeedAndResume(n: number): void {
  client.setSpeed(n);
  if (paused) {
    client.resume();
    btnPause.textContent = "Pause";
    paused = false;
  }
}
btn1x.addEventListener("click", () => setSpeedAndResume(1));
btn2x.addEventListener("click", () => setSpeedAndResume(2));
btn4x.addEventListener("click", () => setSpeedAndResume(4));

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
  bread = snap.stockpiles.bread ?? 0;
  wood = snap.stockpiles.wood ?? 0;
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

  // Brief 19: release the follow if its villager despawned (night / starvation),
  // else refresh the HUD strip with the latest fsm / cargo.
  followId = followReleaseId(followId, currentVillagers);
  updateFollowHud();
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
  const surplusSign = foodSurplus >= 0 ? "+" : "";
  // Phase 5: tier display — color by tier level
  hudTier.textContent = tier;
  const tierColors: Record<string, string> = {
    "Hamlet": EDG.steel,
    "Village": EDG.green,
    "Town": EDG.cyan,
    "Citadel": EDG.yellow,
    "Fortress-City": EDG.red,
  };
  hudTier.style.color = tierColors[tier] ?? EDG.silver;
  hudDay.textContent = `Day ${day} (${season})`;
  hudPop.textContent = `Pop ${population}/${popCap}`;
  hudBread.textContent = `Bread: ${bread} (${surplusSign}${foodSurplus})`;
  hudWood.textContent = `Wood: ${wood}`;
  // Phase 3: happiness display with color coding (EDG cyan / yellow / red)
  const happinessColor = happiness >= 60 ? EDG.cyan : happiness >= 40 ? EDG.yellow : EDG.red;
  hudHappiness.textContent = `Happy: ${happiness}`;
  hudHappiness.style.color = happinessColor;
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

  // Minimap (top-right): clicking it recentres the camera on that tile and
  // releases any follow-cam lock. Camera centre is in iso world-px, so map the
  // clicked tile through the iso projection.
  const minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
  minimap = new CitadelMinimap(minimapCanvas, terrain, (tx, ty) => {
    followId = null;
    updateFollowHud();
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
