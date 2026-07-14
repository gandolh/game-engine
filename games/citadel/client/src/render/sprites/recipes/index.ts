/**
 * Barrel for the Citadel sprite recipes. Exposes the CHAR-recipe set (units +
 * fx — consumed by atlas.ts) and the building-type → frame-name mapping
 * (consumed by quads.ts).
 *
 * Buildings are NOT char recipes any more: every `bld/*` frame comes from the
 * 3D-mesh pipeline (`../mesh/`). So the set of building types that have a
 * sprite is derived from `MESH_MODELS` — the thing that actually renders — and
 * a test re-asserts it against the sim's building-type list, so the two can't
 * drift.
 */
import type { PixelRecipe } from "../types";
import { MESH_MODELS } from "../mesh/models";
import { MILL_FRAME_COUNT, millFrameName } from "./buildings";
import { UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN } from "./units";
import { FX_RECIPES, FRAME_DIAMOND, FLAME_FRAME_COUNT, flameFrameName } from "./fx";

export { MILL_FRAME_COUNT, millFrameName, buildingLitFrameName, LIT_BUILDING_TYPES } from "./buildings";
export {
  UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN,
  UNIT_FRAME_COUNT, unitFrameAt, villagerFrameName, raiderFrameName,
  ROLE_ACCESSORY_JOBS, villagerRoleFrameName, villagerNameForJob,
} from "./units";
export { FRAME_DIAMOND, FRAME_ROAD, FRAME_BRIDGE, FLAME_FRAME_COUNT, flameFrameName } from "./fx";

/**
 * Every CHAR recipe baked into the runtime atlas (units + fx). Buildings are no
 * longer here — `atlas.ts` bakes them from `MESH_OVERRIDES` instead.
 */
export const ALL_RECIPES: readonly PixelRecipe[] = [...UNIT_RECIPES, ...FX_RECIPES];

/** The frame-name prefix for building sprites. */
export const BUILDING_FRAME_PREFIX = "bld/";

/** Building type → atlas frame name (`bld/<type>`). */
export function buildingFrameName(type: string): string {
  return `${BUILDING_FRAME_PREFIX}${type}`;
}

/**
 * The set of building types that have a sprite (derived from the MESH MODEL
 * names by stripping the `bld/` prefix). quads.ts checks membership before
 * requesting a frame, so a type without art falls back to a tinted box rather
 * than throwing in GpuAtlasStore.uv().
 *
 * Derived from `MESH_MODELS` — the models the atlas actually rasterizes — so
 * this set cannot claim art that doesn't render (it used to be derived from the
 * now-deleted char `BUILDING_RECIPES`).
 *
 * Animation / lit frames like `bld/mill@3` or `bld/house@lit` are NOT types —
 * they're extra frames of an existing type — so `@`-suffixed names are excluded.
 */
export const BUILDING_SPRITE_TYPES: ReadonlySet<string> = new Set(
  MESH_MODELS
    .map((m) => m.name.slice(BUILDING_FRAME_PREFIX.length))
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
