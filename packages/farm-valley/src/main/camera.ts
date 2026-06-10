import { Camera2D, MIN_ZOOM, MAX_ZOOM } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { TILE } from "./config";
import type { SnapshotSprite } from "@farm/sim-core/snapshot";
import type { SimClient } from "../worker/sim-client";

// brief-11: focus-camera — module-level camera interaction state
export let focusedFarmerId: number | null = null;
export let panOffset = { x: 0, y: 0 };
export let zoom = 1;
// When the player starts moving Pip while the camera has been panned/looking
// elsewhere, we re-center on Pip — but easing panOffset toward 0 over a few
// frames instead of an instant setCenter snap, which read as the camera
// "jumping back to a previous position". While true, the render loop decays
// panOffset each frame; it clears itself once the offset is ~0.
export let recenteringOnPip = false;

// Hover tooltip — tracks raw canvas-relative mouse position in CSS pixels.
export const mousePos = { x: -9999, y: -9999 };

// ── Player (Pip) input ───────────────────────────────────────────────────────
// WASD/arrows walk Pip one tile per step (throttled so movement reads cleanly);
// E performs the context-sensitive field action (selected hotbar tool) on the
// tile Pip faces; Space recenters the camera on Pip. Move/action are sent to the
// sim worker, which owns Pip as a real farmer entity. The step CADENCE now lives
// in the sim (PlayerControlSystem.PLAYER_STEP_TICKS) so movement can glide; the
// main thread just reports the held direction, resending only when it changes.
export let lastPlayerMoveX: "left" | "right" | null = null;
export let lastPlayerMoveY: "up" | "down" | null = null;
// The player farmer's entity id, learned from the first snapshot (the sprite
// labeled "Pip"); used to focus the camera on Pip by default.
export let playerFarmerId: number | null = null;

// brief-11: focus-camera — module-level client reference for the camera getter
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

// brief-11: focus-camera — center + pan logic
// sprites: precomputed interpolated list for this frame; pass null to let the
// function fetch it lazily via getFarmerInterpolatedPos (e.g. drag handler).
export function applyFocusAndPan(
  camera: Camera2D,
  sprites?: SnapshotSprite[],
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
  camera.setCenter(baseX + panOffset.x, baseY + panOffset.y);
}

// brief-11: focus-camera — wire canvas drag + scroll listeners onto the canvas
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
    // A manual drag overrides any in-progress smooth recenter so the two don't
    // fight over panOffset.
    recenteringOnPip = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    camStartX = panOffset.x;
    camStartY = panOffset.y;
  });

  window.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    // Convert screen-pixel delta to world-pixel delta
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
    // brief-60: multiplicative step so zooming feels uniform across [MIN_ZOOM, MAX_ZOOM].
    // A fixed ±0.1 additive step is glacial at 5×; multiplying by a factor
    // keeps the perceived speed roughly constant in log-zoom space.
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    camera.setZoom(zoom);
    applyFocusAndPan(camera);
  }, { passive: false });
}
