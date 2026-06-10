import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import type { RegionDef } from "../regions";

/** Fountain is placed at the top-left corner of each farm (minX+1, minY+1). */
export function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

/** Spawn decorative props (layer 40, solid by default). Pass `solid: false` to leave a tile walkable. */
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

/** Invisible solid blockers for a building footprint (baked art in render-systems). */
export function placeFootprint(
  world: World<GameEntity>,
  tiles: ReadonlyArray<{ x: number; y: number }>,
): void {
  for (const t of tiles) {
    world.spawn({ solid: { isSolid: true, tileX: t.x, tileY: t.y } });
  }
}
