/**
 * Barrel for the Citadel sprite recipes. Exposes the full recipe set (consumed
 * by atlas.ts) and the building-type → frame-name mapping (consumed by
 * quads.ts). The set of building types that HAVE a sprite is derived from the
 * recipe names, so the two can't drift (a test re-asserts it).
 */
import type { PixelRecipe } from "../types";
import { BUILDING_RECIPES } from "./buildings";
import { UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN } from "./units";
import { FX_RECIPES, FRAME_DIAMOND } from "./fx";

export { BUILDING_RECIPES } from "./buildings";
export { UNIT_RECIPES, FRAME_VILLAGER, FRAME_RAIDER, FRAME_PEDESTRIAN } from "./units";
export { FRAME_DIAMOND, FRAME_ROAD, FRAME_BRIDGE } from "./fx";

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
 */
export const BUILDING_SPRITE_TYPES: ReadonlySet<string> = new Set(
  BUILDING_RECIPES.map((r) => r.name.slice(BUILDING_FRAME_PREFIX.length)),
);

export { FRAME_VILLAGER as VILLAGER_FRAME, FRAME_RAIDER as RAIDER_FRAME };
