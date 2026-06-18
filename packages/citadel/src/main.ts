/**
 * Citadel — Phase 1 browser entry point.
 *
 * Sets up the canvas, initialises the sim Worker, bakes terrain, and runs
 * the animation loop. Phase 1 adds:
 *   - Toolbar: "Build House" / "Demolish" / "Cancel" buttons
 *   - Ghost preview follows cursor (green=valid, red=invalid)
 *   - Click to place a building or demolish
 */
import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, getBuildingDef } from "@citadel/sim-core";
import type { TerrainGrid, BuildingSnapshot } from "@citadel/sim-core";
import { CitadelSimClient } from "./worker/sim-client";
import { bakeTerrainLayer, drawTerrain, clampZoom } from "./render/terrain-renderer";
import { drawBuildings, drawGhost } from "./render/building-renderer";
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
const hudTick = document.getElementById("hud-tick")!;
const btnPause = document.getElementById("btn-pause")!;
const btn1x = document.getElementById("btn-1x")!;
const btn2x = document.getElementById("btn-2x")!;
const btn4x = document.getElementById("btn-4x")!;
const btnBuildHouse = document.getElementById("btn-build-house")!;
const btnDemolish = document.getElementById("btn-demolish")!;
const btnCancel = document.getElementById("btn-cancel")!;
const lblMode = document.getElementById("lbl-mode")!;

// ---------------------------------------------------------------------------
// Camera state
// ---------------------------------------------------------------------------
const camera: Camera = {
  centerX: (WORLD_WIDTH * TILE_SIZE) / 2,
  centerY: (WORLD_HEIGHT * TILE_SIZE) / 2,
  zoom: 1,
};

// Pan & zoom interaction
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
canvas.addEventListener("mouseup", () => { isDragging = false; });
canvas.addEventListener("mouseleave", () => { isDragging = false; });
canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
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
  // Update ghost cursor position
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = clampZoom(camera.zoom * factor);
}, { passive: false });

// ---------------------------------------------------------------------------
// Placement UX
// ---------------------------------------------------------------------------
const placementState = new PlacementStateManager();
let currentBuildings: readonly BuildingSnapshot[] = [];

canvas.addEventListener("click", (e) => {
  if (isDragging) return;
  placementState.updateCursor(e, canvas, camera, terrain, currentBuildings);

  if (placementState.mode === "place") {
    const ghost = placementState.ghost();
    if (ghost !== null && ghost.valid) {
      client.sendCommand({
        type: "placeBuilding",
        payload: {
          buildingType: placementState.selectedType,
          x: ghost.tileX,
          y: ghost.tileY,
        },
      });
    }
  } else if (placementState.mode === "demolish") {
    const { tx, ty } = placementState.cursorTile();
    client.sendCommand({ type: "demolish", payload: { x: tx, y: ty } });
  }
});

function updateModeLabel(): void {
  const mode = placementState.mode;
  if (mode === "place") {
    lblMode.textContent = `Mode: Place ${placementState.selectedType}`;
  } else if (mode === "demolish") {
    lblMode.textContent = "Mode: Demolish";
  } else {
    lblMode.textContent = "Mode: None";
  }
}

btnBuildHouse.addEventListener("click", () => {
  placementState.mode = "place";
  placementState.selectedType = "house";
  const def = getBuildingDef("house");
  if (def !== undefined) placementState.setFootprint(def.w, def.h);
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
// Sim client (Worker)
// ---------------------------------------------------------------------------
const client = new CitadelSimClient();

let paused = false;
let day = 1;
let tick = 0;

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
  tick = snap.tick;
  currentBuildings = snap.buildings;
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
  hudDay.textContent = `Day ${day}`;
  hudTick.textContent = `Tick ${tick}`;

  drawTerrain(ctx, canvas, bakedTerrain, camera);
  drawBuildings(ctx, canvas, currentBuildings, camera);

  // Ghost preview
  const ghost = placementState.ghost();
  if (ghost !== null) {
    drawGhost(ctx, canvas, camera, ghost.tileX, ghost.tileY, ghost.w, ghost.h, ghost.valid);
  }

  requestAnimationFrame(loop);
}

// Start worker, then begin loop
client.init(SEED, TICKS_PER_DAY);
updateModeLabel();
requestAnimationFrame(loop);
