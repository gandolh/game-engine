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
import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, getBuildingDef, getProductionDef, TIER_LOCK, tierAtLeast, BUILDING_MAX_LEVEL, upgradeCost } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, CitadelSave, SettlementTier } from "@citadel/sim-core";
import { EDG } from "@engine/core";
import { CitadelSimClient } from "./worker/sim-client";
import { bakeTerrainLayer, drawTerrain, clampZoom } from "./render/terrain-renderer";
import { drawBuildings, drawGhost, drawVillagers, drawRaiders } from "./render/building-renderer";
import { PlacementStateManager } from "./ui/placement-state";
import type { Camera } from "./render/terrain-renderer";

const SEED = 0x1a2b3c4d;
const TICKS_PER_DAY = 20;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctxMaybe = canvas.getContext("2d");
if (!ctxMaybe) throw new Error("Failed to acquire 2d context");
const ctx: CanvasRenderingContext2D = ctxMaybe;

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

// ---------------------------------------------------------------------------
// Camera state
// ---------------------------------------------------------------------------
const camera: Camera = {
  centerX: (WORLD_WIDTH * TILE_SIZE) / 2,
  centerY: (WORLD_HEIGHT * TILE_SIZE) / 2,
  zoom: 1,
};

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth * dpr;
    const worldPxW = WORLD_WIDTH * TILE_SIZE;
    const baseS = Math.min(cw / worldPxW, (canvas.clientHeight * dpr) / (WORLD_HEIGHT * TILE_SIZE));
    const s = baseS * camera.zoom;
    const dx = (e.clientX - lastMouseX) / s * dpr;
    const dy = (e.clientY - lastMouseY) / s * dpr;
    camera.centerX -= dx;
    camera.centerY -= dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
  // Live upgrade hint: refresh the mode label as the cursor moves over buildings.
  if (placementState.mode === "upgrade") updateModeLabel();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = clampZoom(camera.zoom * factor);
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

client.onSnapshot((snap) => {
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
});

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const terrain: TerrainGrid = generateTerrain(SEED);
const bakedTerrain = bakeTerrainLayer(terrain);

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

  drawTerrain(ctx, canvas, bakedTerrain, camera);
  drawBuildings(ctx, canvas, currentBuildings, camera, outbreakActive);
  drawVillagers(ctx, canvas, currentVillagers, camera);
  drawRaiders(ctx, canvas, currentRaiders, camera);

  const ghost = placementState.ghost();
  if (ghost !== null) {
    drawGhost(ctx, canvas, camera, ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid);
  }
  // Preview the road/wall being painted.
  if ((placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad) {
    for (const t of placementState.roadTiles) {
      drawGhost(ctx, canvas, camera, t.x, t.y, 1, 1, true);
    }
  }

  requestAnimationFrame(loop);
}

client.init(SEED, TICKS_PER_DAY);
updateModeLabel();
requestAnimationFrame(loop);
