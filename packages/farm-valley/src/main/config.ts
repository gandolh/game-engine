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
