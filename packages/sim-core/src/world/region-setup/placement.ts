import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { scaleAroundNearestIsland, type RegionDef } from "../regions";

/** Fountain is placed at the top-left corner of each farm (minX+1, minY+1).
 *  Derived from already-scaled bounds, so it is NOT re-scaled here. */
export function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

/** Spawn decorative props (layer 40, solid by default). Pass `solid: false` to leave a tile walkable.
 *  Prop coordinates are authored against the original 160-scale layout and locked
 *  to their island (not the global map) so they ride with it and never drift off
 *  into the ocean — see regions.ts scaleAroundNearestIsland. */
export function placeProps(
  world: World<GameEntity>,
  props: ReadonlyArray<{ x: number; y: number; frame: string; solid?: boolean }>,
): void {
  for (const p of props) {
    const { x, y } = scaleAroundNearestIsland({ x: p.x, y: p.y });
    const entity: GameEntity = {
      transform: { x, y, prevX: x, prevY: y, rotation: 0 },
      sprite: { atlasId: "main", frame: p.frame, layer: 40, tintRgba: 0xffffffff },
    };
    if (p.solid !== false) {
      entity.solid = { isSolid: true, tileX: x, tileY: y };
    }
    world.spawn(entity);
  }
}

/** Invisible solid blockers for a building footprint (baked art in render-systems).
 *  The authored tiles form a contiguous block; re-anchoring each tile to its island
 *  preserves the block's position, and we FILL the resulting bounding box so the
 *  blocker stays gap-free and covers the building art. */
export function placeFootprint(
  world: World<GameEntity>,
  tiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  if (tiles.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tiles) {
    const { x, y } = scaleAroundNearestIsland(t);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      world.spawn({ solid: { isSolid: true, tileX: x, tileY: y } });
    }
  }
}
