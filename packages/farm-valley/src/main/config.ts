import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";

export interface BootConfig {
  seed: number;
  tickRateHz: number;
  ticksPerDay: number;
  maxDays: number;
}

export const CONFIG: BootConfig = {
  seed: 0xc0ffee,
  tickRateHz: 20,
  // 1200 ticks @ 20Hz = 1 real min/day; selectable via run hash up to 6000.
  ticksPerDay: 1200,
  maxDays: 100,
};

export const TILE = 16;

// Default camera zoom at game start (1 = whole 160×160 world in view).
// At zoom 1 the camera spans the entire world, so the renderer's viewport cull
// (WebGpuRenderer.push / Canvas2dRenderer.push) drops nothing and every sprite +
// the full static/water passes raster every frame (see brief 84 / performance.md
// Tier 0). Starting zoomed in shrinks worldUnitsX/Y so culling actually bites.
// Tunable: higher = closer/cheaper but shows less of the valley at once. Wheel
// zoom still reaches MIN_ZOOM (0.5) for a full-world establishing view.
export const DEFAULT_ZOOM = 2;

// Opt-in profiling via `?profile` URL flag; worker + render loop timings surface
// in DebugOverlay. Never touches sim state.
export const PROFILE_ENABLED =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("profile");

export const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,
  worldUnitsY: WORLD_HEIGHT * TILE,
  centerX: (WORLD_WIDTH * TILE) / 2,
  centerY: (WORLD_HEIGHT * TILE) / 2,
} as const;
