import { WORLD_WIDTH, WORLD_HEIGHT } from "../world/regions";

export interface BootConfig {
  seed: number;
  tickRateHz: number;
  ticksPerDay: number;
  maxDays: number;
}

export const CONFIG: BootConfig = {
  seed: 0xc0ffee,
  tickRateHz: 20,
  // brief 27 — long days. 1200 ticks @ 20Hz = 1 real minute/day (watchable;
  // a 100-day run is ~100 min @ 1×). The Stardew target is 6000 (5 min/day);
  // it's selectable via the run hash (RunDescriptor carries ticksPerDay).
  ticksPerDay: 1200,
  maxDays: 100,
};

export const TILE = 16;

// P0 profiling — opt-in via `?profile` (or `?profile=1`) on the URL. When set,
// the worker times tick + snapshot and the render loop times the frame +
// interpolation; both surface in the DebugOverlay. Diagnostic only — never
// touches sim state, so determinism is unaffected.
export const PROFILE_ENABLED =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("profile");

export const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,
  worldUnitsY: WORLD_HEIGHT * TILE,
  centerX: (WORLD_WIDTH * TILE) / 2,
  centerY: (WORLD_HEIGHT * TILE) / 2,
} as const;
