/**
 * Citadel — Phase 0 browser entry point.
 *
 * Sets up the canvas, initialises the sim Worker, bakes terrain, and runs
 * the animation loop.
 */
import { generateTerrain, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from "@citadel/sim-core";
import { CitadelSimClient } from "./worker/sim-client";
import { bakeTerrainLayer, drawTerrain, clampZoom } from "./render/terrain-renderer";
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
  if (!isDragging) return;
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
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = clampZoom(camera.zoom * factor);
}, { passive: false });

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
});

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const terrain = generateTerrain(SEED);
const bakedTerrain = bakeTerrainLayer(terrain);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
function loop(): void {
  hudDay.textContent = `Day ${day}`;
  hudTick.textContent = `Tick ${tick}`;
  drawTerrain(ctx, canvas, bakedTerrain, camera);
  requestAnimationFrame(loop);
}

// Start worker, then begin loop
client.init(SEED, TICKS_PER_DAY);
requestAnimationFrame(loop);
