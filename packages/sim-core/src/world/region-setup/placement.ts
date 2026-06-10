/**
 * Prop and footprint placement helpers for region setup.
 * Split from region-setup.ts.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import type { RegionDef } from "../regions";

/** Fountain is placed at the top-left corner of each farm (minX+1, minY+1). */
export function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

/**
 * Spawn a batch of static decorative props (sprite + transform). Layer 40 sits
 * below NPCs/farmers (50/100) so the worker can stand in front of them. Every
 * prop is also a `solid` obstacle so neither Pip nor the AI farmers walk THROUGH
 * it — they path around (FeatureCollisionSystem blocks the grid, and Pip's step
 * check sees `solid`). Pass `solid: false` for a prop that must stay walkable
 * (e.g. a flat ground decoration on a tile a farmer must cross).
 */
export function placeProps(
  world: World<GameEntity>,
  props: ReadonlyArray<{ x: number; y: number; frame: string; solid?: boolean }>,
): void {
  for (const p of props) {
    const entity: GameEntity = {
      transform: { x: p.x, y: p.y, prevX: p.x, prevY: p.y, rotation: 0 },
      sprite: { atlasId: "main", frame: p.frame, layer: 40, tintRgba: 0xffffffff },
    };
    if (p.solid !== false) {
      entity.solid = { isSolid: true, tileX: p.x, tileY: p.y };
    }
    world.spawn(entity);
  }
}

/** Spawn invisible solid blockers for a building's multi-tile footprint, so the
 *  big baked workshop sprites (drawn in render-systems) block movement on the
 *  tiles they visually occupy. No sprite — the building is the baked static art. */
export function placeFootprint(
  world: World<GameEntity>,
  tiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  for (const t of tiles) {
    world.spawn({ solid: { isSolid: true, tileX: t.x, tileY: t.y } });
  }
}
