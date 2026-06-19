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
import { generateTerrain, getBuildingDef, getProductionDef, TIER_LOCK, tierAtLeast, BUILDING_MAX_LEVEL, upgradeCost, TILE_SIZE } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, CitadelSave, SettlementTier, RenderSnapshot } from "@citadel/sim-core";
import { EDG, ParticleSystem, createRng, expSmooth } from "@engine/core";
import type { Camera2D, RendererLike } from "@engine/core";
import { CitadelSimClient } from "./worker/sim-client";
import {
  createCitadelRenderer,
  fitCameraToCanvas,
  clampZoom,
  pushScene,
  pushGhost,
  pushLightPool,
  pushAmbientCrowd,
  eventToDevicePx,
  screenToWorld,
  transformOf,
  screenToTile,
} from "./render/citadel-renderer";
import {
  CitadelSmoke,
  syncAppearMap,
  placementScale,
  easeQuad,
  bobOffset,
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
import { PlacementStateManager } from "./ui/placement-state";

const SEED = 0x1a2b3c4d;
const TICKS_PER_DAY = 20;

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
const hudEvents = document.getElementById("hud-events")!;
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

// ---------------------------------------------------------------------------
// Camera + renderer (Camera2D + engine WebGPU renderer; created async in boot)
// ---------------------------------------------------------------------------
let camera: Camera2D;
let renderer: RendererLike;

// Atmosphere (render-only, off-sim): day/night wash, weather FX, ambient crowd.
const weather = new CitadelWeather();
const ambientCrowd = new CitadelAmbientCrowd();
let lastFrameMs = 0; // render clock (performance.now, MAIN-thread only — NOT sim)

// Render-side juice (briefs 17 + 19). All off-sim:
//  - particles: chimney smoke, rendered by the WebGPU particle pass via endFrame
//  - fxRng: render-side RNG (seeded off a constant) for smoke jitter ONLY —
//    never the sim RNG, never Math.random in sim-construable code.
//  - appearAt: building-key → first-seen render-clock ms, for the placement ease.
const particles = new ParticleSystem();
const fxRng = createRng(0x5117_c0de);
const smoke = new CitadelSmoke(particles, fxRng);
const appearAt = new Map<string, number>();

// Follow-cam (brief 19): id of the villager the camera is locked onto, or null.
let followId: number | null = null;

let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

const placementState = new PlacementStateManager();
let currentBuildings: readonly BuildingSnapshot[] = [];
let currentVillagers: readonly VillagerSnapshot[] = [];
let currentRaiders: readonly RaiderSnapshot[] = [];

canvas.addEventListener("mousedown", (e) => {
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
  if (placementState.mode === "road" || placementState.mode === "wall") {
    placementState.startRoadDrag();
    return;
  }
  // Otherwise begin a camera pan.
  isPanning = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener("mouseup", (e) => {
  if ((placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad) {
    placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
    const tiles = placementState.endRoadDrag();
    if (tiles.length > 0) {
      if (placementState.mode === "wall") {
        client.sendCommand({ type: "placeWall", payload: { tiles } });
      } else {
        client.sendCommand({ type: "placeRoad", payload: { tiles } });
      }
    }
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
      client.sendCommand({
        type: "placeBuilding",
        payload: { buildingType: placementState.selectedType, x: ghost.tileX, y: ghost.tileY },
      });
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
// Follow-cam (brief 19): right-click a villager to lock-follow; left-click on
// empty space or Escape releases. Release-on-despawn is handled in the loop.
// ---------------------------------------------------------------------------

/** Resolve a mouse event to the tile under the cursor (device-px → tile). */
function eventTile(e: MouseEvent): { tx: number; ty: number } {
  const { sx, sy } = eventToDevicePx(e, canvas);
  fitCameraToCanvas(camera, canvas.width, canvas.height);
  return screenToTile(transformOf(camera, canvas.width, canvas.height), sx, sy);
}

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const { tx, ty } = eventTile(e);
  const picked = nearestVillager(currentVillagers, tx, ty);
  if (picked !== null) {
    followId = picked;
    updateFollowHud();
  }
});

// Left-click on empty space (no placement mode, no villager hit) releases the
// follow. The placement `click` handler above already returns early for its own
// modes, so only wire release for the idle "none" / pan case.
canvas.addEventListener("click", (e) => {
  if (followId === null) return;
  if (isPanning) return; // tail of a pan, not a release click
  if (placementState.mode !== "none") return; // placement clicks aren't a release
  const { tx, ty } = eventTile(e);
  // Clicking the followed villager (or any villager in range) keeps following;
  // clicking empty space releases.
  if (nearestVillager(currentVillagers, tx, ty) === null) clearFollow();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && followId !== null) clearFollow();
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
  const locked = !tierAtLeast(tier as SettlementTier, reqTier);
  const status = locked ? ` [LOCKED: needs ${reqTier}]` : "";
  return `Mode: Upgrade ${b.type} → L${nextLevel} (${costStr})${status}`;
}

function updateModeLabel(): void {
  const mode = placementState.mode;
  if (mode === "place") lblMode.textContent = `Mode: Place ${placementState.selectedType}`;
  else if (mode === "demolish") lblMode.textContent = "Mode: Demolish";
  else if (mode === "road") lblMode.textContent = "Mode: Road (drag)";
  else if (mode === "wall") lblMode.textContent = "Mode: Wall (drag)";
  else if (mode === "upgrade") lblMode.textContent = upgradeHint();
  else lblMode.textContent = "Mode: None";
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
 * Grey out / disable build buttons whose building type is locked behind a
 * settlement tier the player hasn't reached yet. Keeps buttons VISIBLE so the
 * player can see what climbing the tier ladder unlocks. The Road button is
 * never locked. Mirrors the sim-side reject guard (defense in depth).
 */
function refreshBuildButtonLocks(): void {
  for (const [type, btn] of buildButtonsByType) {
    const required = TIER_LOCK[type];
    if (required !== undefined && !tierAtLeast(tier as SettlementTier, required)) {
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
// Sim client (Worker)
// ---------------------------------------------------------------------------
const client = new CitadelSimClient();

let paused = false;
let day = 1;
let tick = 0;            // render-side mirror of snap.tick (for the day/night wash)
let season = "spring";
let tier = "Hamlet"; // Phase 5: settlement tier
let population = 0;
let popCap = 0;
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
btn1x.addEventListener("click", () => client.setSpeed(1));
btn2x.addEventListener("click", () => client.setSpeed(2));
btn4x.addEventListener("click", () => client.setSpeed(4));

let latestSnapshot: RenderSnapshot | null = null;

client.onSnapshot((snap) => {
  latestSnapshot = snap;
  tick = snap.tick;
  day = snap.day + 1;
  season = snap.season;
  tier = snap.tier;  // Phase 5
  refreshBuildButtonLocks();
  population = snap.population;
  popCap = snap.popCap;
  bread = snap.stockpiles.bread ?? 0;
  wood = snap.stockpiles.wood ?? 0;
  foodSurplus = snap.foodSurplus;
  events = snap.recentEvents;
  currentBuildings = snap.buildings;
  currentVillagers = snap.villagers;
  // Phase 3
  happiness = snap.happiness;
  traderPresent = snap.traderPresent;
  traderOffersList = snap.traderOffers;
  activeDecrees = snap.activeDecrees;
  // Phase 4
  currentRaiders = snap.raiders;
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
  hudEvents.textContent = events.length > 0 ? events[events.length - 1]! : "";

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

  // Brief 17 FX hooks: placement ease-in (building scale/alpha) + idle bob
  // (villager Y). Both pure; the appear map + render clock feed them here.
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
      villagerYOffset: (v) => bobOffset(timeSec, v.id),
    },
  );

  // --- Atmosphere (render-only). Day/night wash + night light pool (brief 15),
  // ambient crowd (brief 18), weather (brief 16). All driven off snapshot
  // fields (tick/season/tier/day) + the render clock — zero sim impact.
  const dayFraction = dayFractionOf(tick, TICKS_PER_DAY);
  const nightFactor = nightFactorOf(dayFraction);

  // Night light pool: warm glow quads over emitter buildings (sprite-batch).
  pushLightPool(renderer, lightPoolQuads(emittersOf(currentBuildings), nightFactor));

  // Ambient crowd: wandering pedestrians, density by tier (sprite-batch).
  if (latestSnapshot !== null) ambientCrowd.update(dt, latestSnapshot);
  pushAmbientCrowd(renderer, ambientCrowd.quads());

  const ghost = placementState.ghost();
  const dragging = (placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad;
  pushGhost(renderer, ghost, dragging ? placementState.roadTiles : []);

  // Weather field (engine RainField → GPU WeatherPass). Update against the
  // visible world rect, then hand it to endFrame.
  const halfX = camera.worldUnitsX / 2;
  const halfY = camera.worldUnitsY / 2;
  weather.update(dt, season, day, {
    left: camera.centerX - halfX,
    right: camera.centerX + halfX,
    top: camera.centerY - halfY,
    bottom: camera.centerY + halfY,
  });

  // Brief 17 chimney smoke: emit rising grey puffs from bakery/smith/woodcutter
  // (render-side RNG jitter only), advance the pool, hand it to endFrame so the
  // WebGPU particle pass draws it natively (the overlay callback is a no-op).
  smoke.update(currentBuildings, nowMs);
  particles.update(dt);

  // Day/night + seasonal wash (GPU TintPass via endFrame), then particles +
  // weather (both rendered natively by the WebGPU backend).
  const wash = computeWash(season, dayFraction);
  renderer.endFrame(wash, particles, weather.field);

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

  client.init(SEED, TICKS_PER_DAY);
  updateModeLabel();
  requestAnimationFrame(loop);
}

void boot().catch((err) => {
  console.error("[citadel] boot failed", err);
});
