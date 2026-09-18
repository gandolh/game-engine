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

  ticksPerDay: 1200,
  maxDays: 100,
};

/**
 * Re-exported so the nine client modules that already import `TILE` from here keep working
 * unchanged (audit-60). The DEFINITION now lives in `@engine/core/render` — it was a private
 * `const TILE = 16;` in 15 production files across 4 packages, and sim-core, the server, the client
 * and the offline renderer all have to agree on it or hover and click silently target the wrong
 * tile.
 */
export { TILE } from "@engine/core/render";
// ...and imported for this module's own use below.
import { TILE } from "@engine/core/render";

export const DEFAULT_ZOOM = 3;

export const PROFILE_ENABLED =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("profile");

export const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,
  worldUnitsY: WORLD_HEIGHT * TILE,
  centerX: (WORLD_WIDTH * TILE) / 2,
  centerY: (WORLD_HEIGHT * TILE) / 2,
} as const;
