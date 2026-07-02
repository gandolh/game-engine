/**
 * Barrel for the Citadel sprite recipes. Exposes the full recipe set (consumed
 * by atlas.ts) and the building-type → frame-name mapping (consumed by
 * quads.ts). The set of building types that HAVE a sprite is derived from the
 * recipe names, so the two can't drift (a test re-asserts it).
 */
import type { PixelRecipe } from "../types";
import { BUILDING_RECIPES, MILL_FRAME_COUNT, millFrameName } from "./buildings";
import { UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN } from "./units";
import { FX_RECIPES, FRAME_DIAMOND, FLAME_FRAME_COUNT, flameFrameName } from "./fx";

export { BUILDING_RECIPES, MILL_FRAME_COUNT, millFrameName, buildingLitFrameName, LIT_BUILDING_TYPES } from "./buildings";
export {
  UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN,
  UNIT_FRAME_COUNT, unitFrameAt, villagerFrameName, raiderFrameName,
} from "./units";
export { FRAME_DIAMOND, FRAME_ROAD, FRAME_BRIDGE, FLAME_FRAME_COUNT, flameFrameName } from "./fx";

/** Every recipe baked into the runtime atlas (buildings + units + fx). */
export const ALL_RECIPES: readonly PixelRecipe[] = [...BUILDING_RECIPES, ...UNIT_RECIPES, ...FX_RECIPES];

/** The frame-name prefix for building sprites. */
export const BUILDING_FRAME_PREFIX = "bld/";

/** Building type → atlas frame name (`bld/<type>`). */
export function buildingFrameName(type: string): string {
  return `${BUILDING_FRAME_PREFIX}${type}`;
}

/**
 * The set of building types that have a sprite recipe (derived from recipe
 * names by stripping the `bld/` prefix). quads.ts checks membership before
 * requesting a frame, so a type without art falls back to a tinted box rather
 * than throwing in GpuAtlasStore.uv().
 *
 * Animation frames like `bld/mill@3` are NOT types — they're extra frames for an
 * existing type (mill) — so `@`-suffixed names are excluded.
 */
export const BUILDING_SPRITE_TYPES: ReadonlySet<string> = new Set(
  BUILDING_RECIPES
    .map((r) => r.name.slice(BUILDING_FRAME_PREFIX.length))
    .filter((type) => !type.includes("@")),
);

/**
 * Resolve the mill's animated frame for a render-clock value `clockMs`. Cycles
 * through the `MILL_FRAME_COUNT` rotated-sail frames at ~`periodMs` per full
 * 90° sweep. Render-only (the caller passes performance.now) — never the sim.
 */
export function millFrameAt(clockMs: number, periodMs = 2400): string {
  const phase = ((clockMs % periodMs) + periodMs) % periodMs / periodMs; // 0..1
  const i = Math.floor(phase * MILL_FRAME_COUNT) % MILL_FRAME_COUNT;
  return millFrameName(i);
}

export { FRAME_VILLAGER as VILLAGER_FRAME, FRAME_RAIDER as RAIDER_FRAME };

/**
 * Resolve the cozy-flame flicker frame for a render-clock value `clockMs`.
 * Cycles the `FLAME_FRAME_COUNT` lean frames at ~`periodMs` per loop; a per-fire
 * `phaseMs` (e.g. from the building key) keeps neighbouring fires out of lockstep.
 * Render-only (caller passes performance.now) — mirrors `millFrameAt`.
 */
export function flameFrameAt(clockMs: number, periodMs = 360, phaseMs = 0): string {
  const t = clockMs + phaseMs;
  const phase = (((t % periodMs) + periodMs) % periodMs) / periodMs; // 0..1
  const i = Math.floor(phase * FLAME_FRAME_COUNT) % FLAME_FRAME_COUNT;
  return flameFrameName(i);
}
