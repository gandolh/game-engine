import { loopClip } from "./cycle";
import {
  FOAM_FRAMES,
  FORGE_FIRE_FRAMES,
  FORGE_SMOKE_FRAMES,
  WATERFALL_FALL_FRAMES,
  CAMPFIRE_FRAMES,
  WEATHER_BEACON_FRAMES,
} from "./frames";

/**
 * Render-side scenery animation clips, built on the engine's `AnimationClip`.
 * Sample with `sampleCycle`/`cycleIndex` from `./cycle`. Wall-clock driven
 * (render-only). Periods preserve the previous hand-rolled cycler timings.
 */
export const FOAM_CLIP = loopClip("foam", FOAM_FRAMES, 1800);
export const FORGE_FIRE_CLIP = loopClip("forge-fire", FORGE_FIRE_FRAMES, 420);
export const FORGE_SMOKE_CLIP = loopClip("forge-smoke", FORGE_SMOKE_FRAMES, 700);
export const WATERFALL_FALL_CLIP = loopClip("waterfall-fall", WATERFALL_FALL_FRAMES, 540);
export const CAMPFIRE_CLIP = loopClip("campfire", CAMPFIRE_FRAMES, 390);
export const WEATHER_BEACON_CLIP = loopClip("weather-beacon", WEATHER_BEACON_FRAMES, 1000);
