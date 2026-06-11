import { Camera2D, MIN_ZOOM, MAX_ZOOM, expSmooth } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { TILE } from "./config";
import type { SnapshotSprite } from "@farm/sim-core/snapshot";
import type { SimClient } from "../worker/sim-client";

export let focusedFarmerId: number | null = null;
export let panOffset = { x: 0, y: 0 };
export let zoom = 1;
// recenteringOnPip: eases panOffset→0 over several frames instead of snapping
// (an instant setCenter read as "jumping back to a previous position").
export let recenteringOnPip = false;

// Hover tooltip — tracks raw canvas-relative mouse position in CSS pixels.
export const mousePos = { x: -9999, y: -9999 };

// WASD/arrows hold directions; step cadence lives in PlayerControlSystem.
// Main thread reports held direction only when it changes.
export let lastPlayerMoveX: "left" | "right" | null = null;
export let lastPlayerMoveY: "up" | "down" | null = null;
// playerFarmerId: learned from the first snapshot (sprite labeled "Pip").
export let playerFarmerId: number | null = null;

export let _simClient: SimClient | null = null;
export let _camera: Camera2D | null = null;

// Setters for mutable state (used by render-loop and bootstrap)
export function setFocusedFarmerId(id: number | null): void { focusedFarmerId = id; }
export function setPanOffset(o: { x: number; y: number }): void { panOffset = o; }
export function setZoom(z: number): void { zoom = z; }
export function setRecenteringOnPip(v: boolean): void { recenteringOnPip = v; }
export function setLastPlayerMoveX(v: "left" | "right" | null): void { lastPlayerMoveX = v; }
export function setLastPlayerMoveY(v: "up" | "down" | null): void { lastPlayerMoveY = v; }
export function setPlayerFarmerId(id: number | null): void { playerFarmerId = id; }
export function setSimClient(c: SimClient | null): void { _simClient = c; }
export function setCamera(c: Camera2D | null): void { _camera = c; }

// ---------- Focus glide state (module-private; accessed only via stepFocusGlide) ----------
let _prevFocusId: number | null = null;
let _gliding = false;
let _glideElapsedSec = 0;

export interface GlideState {
  center: { x: number; y: number };
  gliding: boolean;
  elapsedSec: number;
}

/**
 * Returns the new camera center + glide state for this frame.
 *  rawTarget = base(focus)+panOffset (already computed by caller).
 *  focusChanged: did focusedFarmerId change since last frame.
 *  sx: world→screen scale (canvas.width / camera.worldUnitsX) for the 0.5px rest test.
 *  k≈10. Force-lock after 0.6s cap so a fast-moving target can't trap a permanent trail.
 */
export function stepFocusGlide(
  prevCenter: { x: number; y: number },
  rawTarget: { x: number; y: number },
  focusChanged: boolean,
  dtSec: number,
  sx: number,
  state: { gliding: boolean; elapsedSec: number },
): GlideState {
  const K = 10;
  const MAX_ELAPSED = 0.6;
  const REST_THRESHOLD = 0.5; // screen pixels
  if (focusChanged) { state.gliding = true; state.elapsedSec = 0; }
  if (state.gliding) {
    let cx = expSmooth(prevCenter.x, rawTarget.x, K, dtSec);
    let cy = expSmooth(prevCenter.y, rawTarget.y, K, dtSec);
    state.elapsedSec += dtSec;
    const screenDist = Math.hypot(rawTarget.x - cx, rawTarget.y - cy) * sx;
    if (screenDist < REST_THRESHOLD || state.elapsedSec >= MAX_ELAPSED) {
      cx = rawTarget.x; cy = rawTarget.y; state.gliding = false;
    }
    return { center: { x: cx, y: cy }, gliding: state.gliding, elapsedSec: state.elapsedSec };
  }
  return { center: { x: rawTarget.x, y: rawTarget.y }, gliding: false, elapsedSec: 0 };
}

// sprites: pass the interpolated list for this frame, or omit to fetch lazily.
export function applyFocusAndPan(
  camera: Camera2D,
  sprites?: SnapshotSprite[],
  dtSec = 0,
  sx = 0,
): void {
  let baseX: number;
  let baseY: number;
  if (focusedFarmerId !== null && _simClient !== null) {
    let pos: { x: number; y: number } | null = null;
    if (sprites !== undefined) {
      for (const s of sprites) {
        if (s.id === focusedFarmerId && s.interpolate) {
          pos = { x: s.x, y: s.y };
          break;
        }
      }
    } else {
      pos = _simClient.getFarmerInterpolatedPos(focusedFarmerId);
    }
    baseX = pos?.x ?? camera.centerX;
    baseY = pos?.y ?? camera.centerY;
  } else {
    baseX = (WORLD_WIDTH * TILE) / 2;
    baseY = (WORLD_HEIGHT * TILE) / 2;
  }
  const rawTarget = { x: baseX + panOffset.x, y: baseY + panOffset.y };
  if (dtSec > 0) {
    const focusChanged = focusedFarmerId !== _prevFocusId;
    _prevFocusId = focusedFarmerId;
    const result = stepFocusGlide(
      { x: camera.centerX, y: camera.centerY }, rawTarget, focusChanged, dtSec, sx,
      { gliding: _gliding, elapsedSec: _glideElapsedSec },
    );
    _gliding = result.gliding; _glideElapsedSec = result.elapsedSec;
    camera.setCenter(result.center.x, result.center.y);
  } else {
    _prevFocusId = focusedFarmerId; _gliding = false; _glideElapsedSec = 0;
    camera.setCenter(rawTarget.x, rawTarget.y);
  }
}

export function setupCameraListeners(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
): void {
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let camStartX = 0;
  let camStartY = 0;

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mouseleave", () => {
    mousePos.x = -9999;
    mousePos.y = -9999;
  });

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    isDragging = true;
    recenteringOnPip = false; // drag overrides smooth recenter
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    camStartX = panOffset.x;
    camStartY = panOffset.y;
  });

  window.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    // Screen-pixel delta → world-pixel delta
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
    const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
    panOffset = {
      x: camStartX - (e.clientX - dragStartX) * scaleX,
      y: camStartY - (e.clientY - dragStartY) * scaleY,
    };
    applyFocusAndPan(camera);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  canvas.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    // Multiplicative step keeps perceived zoom speed constant in log-zoom space.
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    camera.setZoom(zoom);
    applyFocusAndPan(camera);
  }, { passive: false });
}
