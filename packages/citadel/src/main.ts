/**
 * Citadel — Phase 3 browser entry point.
 *
 * Phase 3 additions: chapel, market, watchpost, tradingpost toolbar buttons;
 * decrees panel (workHours, rationing, tithe, conscription); happiness HUD;
 * trader panel (shown only when traderPresent).
 */
import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, getBuildingDef, getProductionDef } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot } from "@citadel/sim-core";
import { CitadelSimClient } from "./worker/sim-client";
import { bakeTerrainLayer, drawTerrain, clampZoom } from "./render/terrain-renderer";
import { drawBuildings, drawGhost, drawVillagers } from "./render/building-renderer";
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

const hudDay = document.getElementById("hud-day")!;
const hudPop = document.getElementById("hud-pop")!;
const hudBread = document.getElementById("hud-bread")!;
const hudWood = document.getElementById("hud-wood")!;
const hudHappiness = document.getElementById("hud-happiness")!;
const hudEvents = document.getElementById("hud-events")!;
const btnPause = document.getElementById("btn-pause")!;
const btn1x = document.getElementById("btn-1x")!;
const btn2x = document.getElementById("btn-2x")!;
const btn4x = document.getElementById("btn-4x")!;
const btnDemolish = document.getElementById("btn-demolish")!;
const btnRoad = document.getElementById("btn-build-road")!;
const btnCancel = document.getElementById("btn-cancel")!;
const lblMode = document.getElementById("lbl-mode")!;

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

canvas.addEventListener("mousedown", (e) => {
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
  if (placementState.mode === "road") {
    placementState.startRoadDrag();
    return;
  }
  // Otherwise begin a camera pan.
  isPanning = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener("mouseup", (e) => {
  if (placementState.mode === "road" && placementState.isDraggingRoad) {
    placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
    const tiles = placementState.endRoadDrag();
    if (tiles.length > 0) {
      client.sendCommand({ type: "placeRoad", payload: { tiles } });
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
  }
});

function updateModeLabel(): void {
  const mode = placementState.mode;
  if (mode === "place") lblMode.textContent = `Mode: Place ${placementState.selectedType}`;
  else if (mode === "demolish") lblMode.textContent = "Mode: Demolish";
  else if (mode === "road") lblMode.textContent = "Mode: Road (drag)";
  else lblMode.textContent = "Mode: None";
}

function selectBuild(type: string): void {
  placementState.mode = "place";
  placementState.selectedType = type;
  const def = getBuildingDef(type);
  if (def !== undefined) placementState.setFootprint(def.w, def.h);
  const prod = getProductionDef(type);
  placementState.setRequiresForest(prod?.terrainReq === "forest");
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
];
for (const [id, type] of BUILD_BUTTONS) {
  const btn = document.getElementById(id);
  if (btn !== null) btn.addEventListener("click", () => selectBuild(type));
}

btnRoad.addEventListener("click", () => {
  placementState.mode = "road";
  placementState.setRequiresForest(false);
  updateModeLabel();
});
btnDemolish.addEventListener("click", () => {
  placementState.mode = "demolish";
  updateModeLabel();
});
btnCancel.addEventListener("click", () => {
  placementState.mode = "none";
  updateModeLabel();
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
  hudDay.textContent = `Day ${day} (${season})`;
  hudPop.textContent = `Pop ${population}/${popCap}`;
  hudBread.textContent = `Bread: ${bread} (${surplusSign}${foodSurplus})`;
  hudWood.textContent = `Wood: ${wood}`;
  // Phase 3: happiness display with color coding
  const happinessColor = happiness >= 60 ? "#73eff7" : happiness >= 40 ? "#fee761" : "#e43b44";
  hudHappiness.textContent = `Happy: ${happiness}`;
  hudHappiness.style.color = happinessColor;
  hudEvents.textContent = events.length > 0 ? events[events.length - 1]! : "";

  drawTerrain(ctx, canvas, bakedTerrain, camera);
  drawBuildings(ctx, canvas, currentBuildings, camera);
  drawVillagers(ctx, canvas, currentVillagers, camera);

  const ghost = placementState.ghost();
  if (ghost !== null) {
    drawGhost(ctx, canvas, camera, ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid);
  }
  // Preview the road being painted.
  if (placementState.mode === "road" && placementState.isDraggingRoad) {
    for (const t of placementState.roadTiles) {
      drawGhost(ctx, canvas, camera, t.x, t.y, 1, 1, true);
    }
  }

  requestAnimationFrame(loop);
}

client.init(SEED, TICKS_PER_DAY);
updateModeLabel();
requestAnimationFrame(loop);
